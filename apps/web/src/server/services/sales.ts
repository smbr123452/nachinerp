import "server-only";
import { d, money, qty as toQty, cost as toCost, ZERO, type Dec } from "@/lib/decimal";
import { convertQuantity, unitLabel } from "@/lib/units";
import { prisma } from "@/lib/prisma";
import type { Tx } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import {
  applyMovement,
  productSubject,
  rawMaterialSubject,
  subjectOf,
  type StockSubject,
} from "./inventory";
import { recordMoneyTransaction } from "./money";
import { nextDocumentNumber } from "./numbering";

export type SaleLineInput = {
  productId: string;
  quantity: string | number;
  unitPrice: string | number;
};

export type PaymentSplitInput = {
  cash: string | number;
  card: string | number;
  qr: string | number;
  bankTransfer: string | number;
  other: string | number;
};

export type PostSalesBatchInput = {
  date: Date;
  note?: string | null;
  source?: string;
  items: SaleLineInput[];
  payments: PaymentSplitInput;
  userId: string;
  /** Зөвхөн эзэн сөрөг үлдэгдэл зөвшөөрч болно. */
  allowNegativeStock?: boolean;
  ipAddress?: string | null;
};

export type StockShortage = {
  /** Түүхий эд бол "rm:<id>", бэлэн бүтээгдэхүүн бол "pr:<id>". */
  key: string;
  materialName: string;
  required: string;
  available: string;
  unit: string;
};

/** Нөөц хүрэлцэхгүй үед борлуулалт батлагдахгүй (анхдагч дүрэм). */
export class SaleStockShortageError extends Error {
  constructor(readonly shortages: StockShortage[]) {
    super(
      "Нөөц хүрэлцэхгүй тул борлуулалтыг баталгаажуулах боломжгүй: " +
        shortages
          .map((s) => `${s.materialName} (хэрэгцээ ${s.required} ${s.unit}, үлдэгдэл ${s.available} ${s.unit})`)
          .join("; "),
    );
    this.name = "SaleStockShortageError";
  }
}

export class MissingRecipeError extends Error {
  constructor(readonly productNames: string[]) {
    super(`Жор тодорхойлогдоогүй бүтээгдэхүүн байна: ${productNames.join(", ")}.`);
    this.name = "MissingRecipeError";
  }
}

/**
 * Борлуулалтад хасагдах нэг мөр.
 *
 * MANUFACTURED бүтээгдэхүүн — жорынх нь материалууд хасагдана.
 * RESALE бүтээгдэхүүн       — өөрөө өөрийн нөөцөөс хасагдана.
 */
type Consumption = {
  subject: StockSubject;
  key: string;
  materialName: string;
  baseQuantity: Dec;
  averageCost: Dec;
  unit: string;
  available: Dec;
};

function consumptionKey(subject: StockSubject): string {
  return subject.kind === "rawMaterial" ? `rm:${subject.id}` : `pr:${subject.id}`;
}

type PreparedSaleLine = {
  productId: string;
  productName: string;
  quantity: Dec;
  unitPrice: Dec;
  total: Dec;
  unitCost: Dec;
  totalCost: Dec;
};

/**
 * Борлуулалтад хасагдах нөөц ба борлуулсан бүтээгдэхүүний өртгийг тооцно.
 *
 *   MANUFACTURED — жорынх нь материалууд, тэдгээрийн одоогийн дундаж өртгөөр
 *   RESALE       — бүтээгдэхүүн өөрөө, өөрийн дундаж авалтын өртгөөр
 *
 * Уншилтын үйлдэл — урьдчилан шалгахад ч, батлахад ч ашиглагдана.
 */
export async function planSaleConsumption(
  items: SaleLineInput[],
  tx: Tx = prisma,
): Promise<{ lines: PreparedSaleLine[]; consumption: Consumption[] }> {
  if (items.length === 0) throw new Error("Дор хаяж нэг бүтээгдэхүүн нэмнэ үү.");

  const products = await tx.product.findMany({
    where: { id: { in: items.map((i) => i.productId) } },
    include: { recipeItems: { include: { rawMaterial: true } } },
  });
  const byId = new Map(products.map((p) => [p.id, p]));

  const missingRecipe: string[] = [];
  const consumptionMap = new Map<string, Consumption>();
  const lines: PreparedSaleLine[] = [];

  for (const item of items) {
    const product = byId.get(item.productId);
    if (!product) throw new Error("Бүтээгдэхүүн олдсонгүй.");

    const quantity = toQty(item.quantity);
    const unitPrice = money(item.unitPrice);
    if (quantity.lessThanOrEqualTo(0)) {
      throw new Error(`"${product.name}" — тоо ширхэг 0-ээс их байх ёстой.`);
    }
    if (unitPrice.lessThan(0)) {
      throw new Error(`"${product.name}" — үнэ сөрөг байж болохгүй.`);
    }
    // --- Өртөг ба хэрэглээ: бүтээгдэхүүний төрлөөс хамаарна ------------------
    let unitCost = ZERO;

    if (product.productType === "RESALE") {
      // Бэлэн бүтээгдэхүүн: өөрийн нөөцөөс өөрийн жигнэсэн
      // дундаж авалтын өртгөөр хасагдана. Жор хэрэггүй.
      unitCost = d(product.averageCost);

      const key = consumptionKey(productSubject(product.id));
      const existing = consumptionMap.get(key);
      if (existing) {
        existing.baseQuantity = existing.baseQuantity.plus(quantity);
      } else {
        consumptionMap.set(key, {
          subject: productSubject(product.id),
          key,
          materialName: product.name,
          baseQuantity: quantity,
          averageCost: unitCost,
          unit: unitLabel(product.unit),
          available: d(product.quantity),
        });
      }
    } else {
      // Үйлдвэрлэдэг бүтээгдэхүүн: жорын материалууд хасагдана.
      if (product.recipeItems.length === 0) missingRecipe.push(product.name);

      for (const recipeItem of product.recipeItems) {
        const material = recipeItem.rawMaterial;
        const perUnitBase = convertQuantity(recipeItem.quantity, recipeItem.unit, material.unit);
        const averageCost = d(material.averageCost);
        unitCost = unitCost.plus(perUnitBase.times(averageCost));

        const needed = perUnitBase.times(quantity);
        const key = consumptionKey(rawMaterialSubject(material.id));
        const existing = consumptionMap.get(key);
        if (existing) {
          existing.baseQuantity = existing.baseQuantity.plus(needed);
        } else {
          consumptionMap.set(key, {
            subject: rawMaterialSubject(material.id),
            key,
            materialName: material.name,
            baseQuantity: needed,
            averageCost,
            unit: unitLabel(material.unit),
            available: d(material.quantity),
          });
        }
      }
    }

    const finalUnitCost = toCost(unitCost);
    lines.push({
      productId: product.id,
      productName: product.name,
      quantity,
      unitPrice,
      total: money(quantity.times(unitPrice)),
      unitCost: finalUnitCost,
      totalCost: money(quantity.times(finalUnitCost)),
    });
  }

  if (missingRecipe.length > 0) throw new MissingRecipeError(missingRecipe);

  const consumption = [...consumptionMap.values()].map((c) => ({
    ...c,
    baseQuantity: toQty(c.baseQuantity),
  }));

  return { lines, consumption };
}

export function findShortages(consumption: Consumption[]): StockShortage[] {
  return consumption
    .filter((c) => c.baseQuantity.greaterThan(c.available))
    .map((c) => ({
      key: c.key,
      materialName: c.materialName,
      required: c.baseQuantity.toFixed(3),
      available: c.available.toFixed(3),
      unit: c.unit,
    }));
}

/**
 * Өдрийн борлуулалтыг баталгаажуулах — БҮГД нэг гүйлгээнд:
 *   1) баримт, 2) орлого, 3) хэрэглээ (жор эсвэл бүтээгдэхүүний нөөц),
 *   4) нөөц хасах,
 *   5) SALE_CONSUMPTION_OUT хөдөлгөөн, 6) тухайн үеийн өртөг,
 *   7) ББӨ, 8) нийт ашиг, 9) мөнгөн гүйлгээ, 10) аудит.
 */
export async function postSalesBatch(
  input: PostSalesBatchInput,
): Promise<{ id: string; batchNo: string }> {
  const payments = {
    cash: money(input.payments.cash),
    card: money(input.payments.card),
    qr: money(input.payments.qr),
    bankTransfer: money(input.payments.bankTransfer),
    other: money(input.payments.other),
  };
  const paymentTotal = money(
    payments.cash.plus(payments.card).plus(payments.qr).plus(payments.bankTransfer).plus(payments.other),
  );
  if (Object.values(payments).some((v) => v.lessThan(0))) {
    throw new Error("Төлбөрийн дүн сөрөг байж болохгүй.");
  }

  return prisma.$transaction(async (tx) => {
    const { lines, consumption } = await planSaleConsumption(input.items, tx);

    const totalRevenue = money(lines.reduce<Dec>((acc, l) => acc.plus(l.total), ZERO));
    if (!paymentTotal.equals(totalRevenue)) {
      throw new Error(
        `Төлбөрийн хуваарилалт (${paymentTotal.toFixed(0)}₮) нийт орлоготой (${totalRevenue.toFixed(0)}₮) тэнцэхгүй байна.`,
      );
    }

    if (!input.allowNegativeStock) {
      const shortages = findShortages(consumption);
      if (shortages.length > 0) throw new SaleStockShortageError(shortages);
    }

    const totalCogs = money(lines.reduce<Dec>((acc, l) => acc.plus(l.totalCost), ZERO));
    const grossProfit = money(totalRevenue.minus(totalCogs));
    const batchNo = await nextDocumentNumber(tx, "saleBatch");

    const batch = await tx.saleBatch.create({
      data: {
        batchNo,
        date: input.date,
        status: "POSTED",
        note: input.note ?? null,
        source: input.source ?? "MANUAL",
        totalRevenue,
        totalCogs,
        grossProfit,
        cashAmount: payments.cash,
        cardAmount: payments.card,
        qrAmount: payments.qr,
        bankTransferAmount: payments.bankTransfer,
        otherAmount: payments.other,
        createdById: input.userId,
        items: {
          create: lines.map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            total: l.total,
            unitCost: l.unitCost,
            totalCost: l.totalCost,
          })),
        },
      },
      select: { id: true, batchNo: true },
    });

    // Жорын материал ба бэлэн бүтээгдэхүүнийг автоматаар хасна.
    for (const line of consumption) {
      if (line.baseQuantity.lessThanOrEqualTo(0)) continue;
      await applyMovement(tx, {
        subject: line.subject,
        movementType: "SALE_CONSUMPTION_OUT",
        quantity: line.baseQuantity,
        costPolicy: { mode: "AVERAGE" },
        referenceType: "SALE",
        referenceId: batch.id,
        note: batchNo,
        userId: input.userId,
        allowNegative: input.allowNegativeStock ?? false,
      });
    }

    // Төлбөрийн хэлбэр тус бүрээр мөнгөн гүйлгээ.
    // Карт / QR / шилжүүлэг нь банкаар, бэлэн нь кассд орно.
    const moneyLines: { amount: Dec; type: "SALE_CASH_IN" | "SALE_BANK_IN" | "OTHER_IN"; account: "CASH" | "BANK"; label: string }[] = [
      { amount: payments.cash, type: "SALE_CASH_IN", account: "CASH", label: "Бэлэн" },
      { amount: payments.card, type: "SALE_BANK_IN", account: "BANK", label: "Карт" },
      { amount: payments.qr, type: "SALE_BANK_IN", account: "BANK", label: "QR" },
      { amount: payments.bankTransfer, type: "SALE_BANK_IN", account: "BANK", label: "Дансаар" },
      { amount: payments.other, type: "OTHER_IN", account: "BANK", label: "Бусад" },
    ];
    for (const line of moneyLines) {
      if (line.amount.lessThanOrEqualTo(0)) continue;
      await recordMoneyTransaction(tx, {
        type: line.type,
        amount: line.amount,
        destinationAccount: line.account,
        referenceType: "SALE",
        referenceId: batch.id,
        note: `${batchNo} — ${line.label}`,
        userId: input.userId,
        occurredAt: input.date,
      });
    }

    await writeAudit(
      {
        userId: input.userId,
        action: "SALE_FINALIZED",
        entityType: "SaleBatch",
        entityId: batch.id,
        newValue: {
          batchNo,
          totalRevenue: totalRevenue.toString(),
          totalCogs: totalCogs.toString(),
          grossProfit: grossProfit.toString(),
          negativeStockOverride: Boolean(input.allowNegativeStock),
        },
        note: input.allowNegativeStock ? "Сөрөг үлдэгдлийг эзэн зөвшөөрсөн." : null,
        ipAddress: input.ipAddress,
      },
      tx,
    );

    return batch;
  });
}

/**
 * Борлуулалтыг ЦУЦЛАХ — устгахгүй. Хэрэглэсэн материалыг тухайн үеийн
 * өртгөөр нь буцаан орлогодож, мөнгөн гүйлгээг сөргүүлнэ.
 */
export async function cancelSaleBatch(params: {
  saleBatchId: string;
  userId: string;
  note: string;
  ipAddress?: string | null;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const batch = await tx.saleBatch.findUnique({ where: { id: params.saleBatchId } });
    if (!batch) throw new Error("Борлуулалт олдсонгүй.");
    if (batch.status !== "POSTED") throw new Error("Зөвхөн батлагдсан борлуулалтыг цуцална.");

    const movements = await tx.inventoryMovement.findMany({
      where: { referenceType: "SALE", referenceId: batch.id, movementType: "SALE_CONSUMPTION_OUT" },
    });

    for (const movement of movements) {
      await applyMovement(tx, {
        subject: subjectOf(movement),
        movementType: "CORRECTION_IN",
        quantity: d(movement.quantity).abs(),
        // Хэрэглэсэн үеийн өртгөөр буцаана — түүхэн өртөг өөрчлөгдөхгүй.
        costPolicy: { mode: "AT_COST", unitCost: movement.unitCost },
        referenceType: "SALE_CANCEL",
        referenceId: batch.id,
        note: `${batch.batchNo} цуцлалт`,
        userId: params.userId,
      });
    }

    const moneyLines: { amount: Dec; account: "CASH" | "BANK"; label: string }[] = [
      { amount: d(batch.cashAmount), account: "CASH", label: "Бэлэн" },
      { amount: d(batch.cardAmount), account: "BANK", label: "Карт" },
      { amount: d(batch.qrAmount), account: "BANK", label: "QR" },
      { amount: d(batch.bankTransferAmount), account: "BANK", label: "Дансаар" },
      { amount: d(batch.otherAmount), account: "BANK", label: "Бусад" },
    ];
    for (const line of moneyLines) {
      if (line.amount.lessThanOrEqualTo(0)) continue;
      await recordMoneyTransaction(tx, {
        type: "OTHER_OUT",
        amount: line.amount,
        sourceAccount: line.account,
        referenceType: "SALE_CANCEL",
        referenceId: batch.id,
        note: `${batch.batchNo} цуцлалт — ${line.label}`,
        userId: params.userId,
      });
    }

    await tx.saleBatch.update({
      where: { id: batch.id },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelNote: params.note },
    });

    await writeAudit(
      {
        userId: params.userId,
        action: "SALE_CANCELLED",
        entityType: "SaleBatch",
        entityId: batch.id,
        oldValue: { status: batch.status, totalRevenue: batch.totalRevenue.toString() },
        newValue: { status: "CANCELLED" },
        note: params.note,
        ipAddress: params.ipAddress,
      },
      tx,
    );
  });
}
