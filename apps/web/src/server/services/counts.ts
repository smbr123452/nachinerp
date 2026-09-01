import "server-only";
import { d, money, qty as toQty, ZERO, type Dec } from "@/lib/decimal";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { applyMovement, lockRawMaterial } from "./inventory";
import { nextDocumentNumber } from "./numbering";

export type CountLineInput = {
  rawMaterialId: string;
  countedQuantity: string | number;
};

/** Тооллого нээх — тухайн үеийн системийн үлдэгдлийг царцаана. */
export async function createInventoryCount(params: {
  date: Date;
  note?: string | null;
  rawMaterialIds: string[];
  userId: string;
  ipAddress?: string | null;
}): Promise<{ id: string; countNo: string }> {
  if (params.rawMaterialIds.length === 0) {
    throw new Error("Дор хаяж нэг бараа материал сонгоно уу.");
  }

  return prisma.$transaction(async (tx) => {
    const materials = await tx.rawMaterial.findMany({
      where: { id: { in: params.rawMaterialIds } },
    });
    const countNo = await nextDocumentNumber(tx, "inventoryCount");

    const count = await tx.inventoryCount.create({
      data: {
        countNo,
        date: params.date,
        status: "DRAFT",
        note: params.note ?? null,
        createdById: params.userId,
        items: {
          create: materials.map((m) => ({
            rawMaterialId: m.id,
            systemQuantity: m.quantity,
            countedQuantity: m.quantity,
            differenceQuantity: 0,
            weightedAverageCost: m.averageCost,
            varianceAmount: 0,
          })),
        },
      },
      select: { id: true, countNo: true },
    });

    await writeAudit(
      {
        userId: params.userId,
        action: "INVENTORY_COUNT_CREATED",
        entityType: "InventoryCount",
        entityId: count.id,
        newValue: { countNo, itemCount: materials.length },
        ipAddress: params.ipAddress,
      },
      tx,
    );

    return count;
  });
}

/** Ноорог тооллогын тоолсон тоог хадгалах. */
export async function saveCountLines(params: {
  countId: string;
  lines: CountLineInput[];
  userId: string;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const count = await tx.inventoryCount.findUnique({
      where: { id: params.countId },
      include: { items: true },
    });
    if (!count) throw new Error("Тооллого олдсонгүй.");
    if (count.status !== "DRAFT") throw new Error("Зөвхөн ноорог тооллогыг засварлана.");

    const byMaterial = new Map(count.items.map((i) => [i.rawMaterialId, i]));
    for (const line of params.lines) {
      const item = byMaterial.get(line.rawMaterialId);
      if (!item) continue;
      const counted = toQty(line.countedQuantity);
      if (counted.lessThan(0)) throw new Error("Тоолсон тоо сөрөг байж болохгүй.");
      const difference = toQty(counted.minus(d(item.systemQuantity)));
      await tx.inventoryCountItem.update({
        where: { id: item.id },
        data: {
          countedQuantity: counted,
          differenceQuantity: difference,
          varianceAmount: money(difference.times(d(item.weightedAverageCost))),
        },
      });
    }
  });
}

/**
 * Тооллогыг баталгаажуулах — үлдэгдлийг ШУУД дарж бичихгүй,
 * зөрүү тус бүрд тохируулгын хөдөлгөөн үүсгэнэ.
 */
export async function finalizeInventoryCount(params: {
  countId: string;
  userId: string;
  ipAddress?: string | null;
}): Promise<{ varianceAmount: Dec; adjustedCount: number }> {
  return prisma.$transaction(async (tx) => {
    const count = await tx.inventoryCount.findUnique({
      where: { id: params.countId },
      include: { items: true },
    });
    if (!count) throw new Error("Тооллого олдсонгүй.");
    if (count.status !== "DRAFT") throw new Error("Энэ тооллого аль хэдийн хаагдсан байна.");

    let totalVariance = ZERO;
    let adjustedCount = 0;

    for (const item of count.items) {
      // Баталгаажуулах агшны бодит үлдэгдэл ба өртгөөр дахин тооцно.
      // Мөрийг эхлээд түгжиж уншсанаар зэрэгцээ борлуулалт зөрүүг гажуудуулахгүй.
      const material = await lockRawMaterial(tx, item.rawMaterialId);
      const systemQuantity = d(material.quantity);
      const counted = d(item.countedQuantity);
      const difference = toQty(counted.minus(systemQuantity));
      const unitCost = d(material.averageCost);
      const variance = money(difference.times(unitCost));

      await tx.inventoryCountItem.update({
        where: { id: item.id },
        data: {
          systemQuantity,
          differenceQuantity: difference,
          weightedAverageCost: unitCost,
          varianceAmount: variance,
        },
      });

      if (difference.isZero()) continue;

      await applyMovement(tx, {
        rawMaterialId: item.rawMaterialId,
        movementType: difference.greaterThan(0) ? "INVENTORY_COUNT_GAIN" : "INVENTORY_COUNT_LOSS",
        quantity: difference.abs(),
        costPolicy: { mode: "AVERAGE" },
        referenceType: "INVENTORY_COUNT",
        referenceId: count.id,
        note: `${count.countNo} тооллогын зөрүү`,
        userId: params.userId,
      });

      totalVariance = totalVariance.plus(variance);
      adjustedCount += 1;
    }

    await tx.inventoryCount.update({
      where: { id: count.id },
      data: { status: "POSTED", completedAt: new Date() },
    });

    await writeAudit(
      {
        userId: params.userId,
        action: "INVENTORY_COUNT_FINALIZED",
        entityType: "InventoryCount",
        entityId: count.id,
        newValue: {
          countNo: count.countNo,
          varianceAmount: totalVariance.toString(),
          adjustedItems: adjustedCount,
        },
        ipAddress: params.ipAddress,
      },
      tx,
    );

    return { varianceAmount: money(totalVariance), adjustedCount };
  });
}

export async function cancelInventoryCount(params: {
  countId: string;
  userId: string;
  note: string;
  ipAddress?: string | null;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const count = await tx.inventoryCount.findUnique({ where: { id: params.countId } });
    if (!count) throw new Error("Тооллого олдсонгүй.");
    if (count.status !== "DRAFT") throw new Error("Зөвхөн ноорог тооллогыг цуцална.");

    await tx.inventoryCount.update({
      where: { id: count.id },
      data: { status: "CANCELLED", cancelNote: params.note },
    });

    await writeAudit(
      {
        userId: params.userId,
        action: "INVENTORY_COUNT_CANCELLED",
        entityType: "InventoryCount",
        entityId: count.id,
        oldValue: { status: count.status },
        newValue: { status: "CANCELLED" },
        note: params.note,
        ipAddress: params.ipAddress,
      },
      tx,
    );
  });
}
