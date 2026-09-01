import "server-only";
import type { PurchasePaymentMethod, Unit } from "@prisma/client";
import { d, money, qty as toQty, cost as toCost, ZERO, type Dec } from "@/lib/decimal";
import { convertQuantity, convertUnitPrice, isConvertible, unitLabel } from "@/lib/units";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { applyMovement, subjectOf, type StockSubject } from "./inventory";
import { recordMoneyTransaction } from "./money";
import { nextDocumentNumber } from "./numbering";

/**
 * Худалдан авалтын мөр. Түүхий эд ЭСВЭЛ RESALE бүтээгдэхүүн —
 * rawMaterialId / productId-ийн ЯГ НЭГИЙГ өгнө.
 */
export type PurchaseLineInput = {
  rawMaterialId?: string | null;
  productId?: string | null;
  quantity: string | number;
  unit: Unit;
  unitPrice: string | number;
};

export type PostPurchaseInput = {
  date: Date;
  supplierId?: string | null;
  paymentMethod: PurchasePaymentMethod;
  note?: string | null;
  items: PurchaseLineInput[];
  userId: string;
  ipAddress?: string | null;
};

/**
 * Худалдан авалт бүртгэх — БҮГД нэг гүйлгээнд:
 *   1) баримт, 2) мөрүүд, 3) нөөц нэмэх, 4) жигнэсэн дундаж өртөг,
 *   5) нөөцийн хөдөлгөөн, 6) мөнгөн гүйлгээ, 7) аудит.
 */
export async function postPurchase(input: PostPurchaseInput): Promise<{ id: string; purchaseNo: string }> {
  if (input.items.length === 0) {
    throw new Error("Дор хаяж нэг мөр нэмнэ үү.");
  }

  return prisma.$transaction(async (tx) => {
    const materialIds = input.items.flatMap((i) => (i.rawMaterialId ? [i.rawMaterialId] : []));
    const productIds = input.items.flatMap((i) => (i.productId ? [i.productId] : []));

    const [materials, products] = await Promise.all([
      tx.rawMaterial.findMany({ where: { id: { in: materialIds } } }),
      tx.product.findMany({ where: { id: { in: productIds } } }),
    ]);
    const materialById = new Map(materials.map((m) => [m.id, m]));
    const productById = new Map(products.map((p) => [p.id, p]));

    type Prepared = {
      subject: StockSubject;
      rawMaterialId: string | null;
      productId: string | null;
      quantity: Dec;
      unit: Unit;
      unitPrice: Dec;
      subtotal: Dec;
      baseQuantity: Dec;
      baseUnitCost: Dec;
    };

    const prepared: Prepared[] = input.items.map((item) => {
      if (Boolean(item.rawMaterialId) === Boolean(item.productId)) {
        throw new Error("Мөр бүр яг нэг бараа буюу бүтээгдэхүүнтэй байх ёстой.");
      }

      // Хоёр төрлийн субьектийг нэгэн ижил байдлаар шалгана.
      let target: { id: string; name: string; unit: Unit; isActive: boolean };
      if (item.rawMaterialId) {
        const material = materialById.get(item.rawMaterialId);
        if (!material) throw new Error("Бараа материал олдсонгүй.");
        target = material;
      } else {
        const product = productById.get(item.productId!);
        if (!product) throw new Error("Бүтээгдэхүүн олдсонгүй.");
        if (product.productType !== "RESALE") {
          throw new Error(
            `"${product.name}" нь үйлдвэрлэдэг бүтээгдэхүүн тул худалдан авалтад бүртгэхгүй.`,
          );
        }
        target = product;
      }
      if (!target.isActive) throw new Error(`"${target.name}" идэвхгүй байна.`);

      const quantity = toQty(item.quantity);
      const unitPrice = toCost(item.unitPrice);
      if (quantity.lessThanOrEqualTo(0)) {
        throw new Error(`"${target.name}" — тоо хэмжээ 0-ээс их байх ёстой.`);
      }
      if (unitPrice.lessThan(0)) {
        throw new Error(`"${target.name}" — нэгж үнэ сөрөг байж болохгүй.`);
      }
      if (!isConvertible(item.unit, target.unit)) {
        throw new Error(
          `"${target.name}" — ${unitLabel(item.unit)} нэгжийг ${unitLabel(target.unit)} рүү хөрвүүлэх боломжгүй.`,
        );
      }

      const rawMaterialId = item.rawMaterialId ?? null;
      const productId = item.productId ?? null;

      return {
        subject: subjectOf({ rawMaterialId, productId }),
        rawMaterialId,
        productId,
        quantity,
        unit: item.unit,
        unitPrice,
        subtotal: money(quantity.times(unitPrice)),
        baseQuantity: toQty(convertQuantity(quantity, item.unit, target.unit)),
        baseUnitCost: toCost(convertUnitPrice(unitPrice, item.unit, target.unit)),
      };
    });

    const totalAmount = money(prepared.reduce<Dec>((acc, p) => acc.plus(p.subtotal), ZERO));
    const purchaseNo = await nextDocumentNumber(tx, "purchase");

    const purchase = await tx.purchase.create({
      data: {
        purchaseNo,
        date: input.date,
        supplierId: input.supplierId ?? null,
        paymentMethod: input.paymentMethod,
        note: input.note ?? null,
        totalAmount,
        status: "POSTED",
        createdById: input.userId,
        items: {
          create: prepared.map((p) => ({
            rawMaterialId: p.rawMaterialId,
            productId: p.productId,
            quantity: p.quantity,
            unit: p.unit,
            unitPrice: p.unitPrice,
            subtotal: p.subtotal,
            baseQuantity: p.baseQuantity,
            baseUnitCost: p.baseUnitCost,
          })),
        },
      },
      select: { id: true, purchaseNo: true },
    });

    // Нөөц нэмэх + жигнэсэн дундаж өртөг шинэчлэх.
    for (const line of prepared) {
      await applyMovement(tx, {
        subject: line.subject,
        movementType: "PURCHASE_IN",
        quantity: line.baseQuantity,
        costPolicy: { mode: "AT_COST", unitCost: line.baseUnitCost },
        referenceType: "PURCHASE",
        referenceId: purchase.id,
        note: purchaseNo,
        userId: input.userId,
      });
    }

    // Бэлэн / банкаар төлсөн бол мөнгө гарна. Зээлээр бол гүйлгээ үүсэхгүй.
    if (input.paymentMethod !== "CREDIT" && totalAmount.greaterThan(0)) {
      await recordMoneyTransaction(tx, {
        type: "PURCHASE_PAYMENT_OUT",
        amount: totalAmount,
        sourceAccount: input.paymentMethod === "CASH" ? "CASH" : "BANK",
        referenceType: "PURCHASE",
        referenceId: purchase.id,
        note: purchaseNo,
        userId: input.userId,
        occurredAt: input.date,
      });
    }

    await writeAudit(
      {
        userId: input.userId,
        action: "PURCHASE_CREATED",
        entityType: "Purchase",
        entityId: purchase.id,
        newValue: {
          purchaseNo,
          totalAmount: totalAmount.toString(),
          paymentMethod: input.paymentMethod,
          items: prepared.map((p) => ({
            rawMaterialId: p.rawMaterialId,
            baseQuantity: p.baseQuantity.toString(),
            baseUnitCost: p.baseUnitCost.toString(),
          })),
        },
        ipAddress: input.ipAddress,
      },
      tx,
    );

    return purchase;
  });
}

/**
 * Худалдан авалтыг ЦУЦЛАХ — устгахгүй.
 * Эсрэг чиглэлийн хөдөлгөөн үүсгэж, дундаж өртгийг ухраана.
 */
export async function cancelPurchase(params: {
  purchaseId: string;
  userId: string;
  note: string;
  ipAddress?: string | null;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const purchase = await tx.purchase.findUnique({
      where: { id: params.purchaseId },
      include: { items: true },
    });
    if (!purchase) throw new Error("Худалдан авалт олдсонгүй.");
    if (purchase.status !== "POSTED") throw new Error("Зөвхөн батлагдсан баримтыг цуцална.");

    for (const item of purchase.items) {
      await applyMovement(tx, {
        subject: subjectOf(item),
        movementType: "CORRECTION_OUT",
        quantity: item.baseQuantity,
        costPolicy: { mode: "REMOVE_AT_COST", unitCost: item.baseUnitCost },
        referenceType: "PURCHASE_CANCEL",
        referenceId: purchase.id,
        note: `${purchase.purchaseNo} цуцлалт`,
        userId: params.userId,
        // Цуцлалт нь өмнөх орлогыг буцаана — түүхийн бүрэн бүтэн байдлыг
        // хадгалахын тулд үлдэгдэл хүрэлцэхгүй байсан ч зогсоохгүй.
        allowNegative: true,
      });
    }

    if (purchase.paymentMethod !== "CREDIT" && d(purchase.totalAmount).greaterThan(0)) {
      await recordMoneyTransaction(tx, {
        type: "OTHER_IN",
        amount: purchase.totalAmount,
        destinationAccount: purchase.paymentMethod === "CASH" ? "CASH" : "BANK",
        referenceType: "PURCHASE_CANCEL",
        referenceId: purchase.id,
        note: `${purchase.purchaseNo} цуцлалтын буцаалт`,
        userId: params.userId,
      });
    }

    await tx.purchase.update({
      where: { id: purchase.id },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelNote: params.note },
    });

    await writeAudit(
      {
        userId: params.userId,
        action: "PURCHASE_CANCELLED",
        entityType: "Purchase",
        entityId: purchase.id,
        oldValue: { status: purchase.status, totalAmount: purchase.totalAmount.toString() },
        newValue: { status: "CANCELLED" },
        note: params.note,
        ipAddress: params.ipAddress,
      },
      tx,
    );
  });
}

export const PURCHASE_PAYMENT_LABEL: Record<PurchasePaymentMethod, string> = {
  CASH: "Бэлэн",
  BANK: "Банк",
  CREDIT: "Зээлээр",
};
