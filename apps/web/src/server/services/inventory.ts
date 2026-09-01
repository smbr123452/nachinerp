import "server-only";
import { type MovementType, type RawMaterial, type Unit } from "@prisma/client";
import { cost as toCost, d, qty as toQty, ZERO, type Dec, type DecimalLike } from "@/lib/decimal";
import { unitLabel } from "@/lib/units";
import type { Tx } from "@/lib/prisma";
import { allowNegativeStock } from "./settings";

/**
 * Нөөцийн ГАНЦ орох цэг.
 *
 * Дүрэм: RawMaterial / Product-ийн quantity ба averageCost-ыг энэ файлаас
 * гадуур ХЭЗЭЭ Ч шууд өөрчлөхгүй. Бүх өөрчлөлт InventoryMovement үүсгэнэ.
 *
 * Нөөцийн субьект хоёр төрөлтэй:
 *   - rawMaterial — түүхий эд (жорд ордог)
 *   - product     — RESALE буюу бэлэн бүтээгдэхүүн (худалдаж аваад борлуулдаг)
 * Хоёулаа НЭГ дэвтэр (InventoryMovement) хуваалцана. Мөр бүр яг нэг
 * субьекттэй байхыг өгөгдлийн сангийн CHECK баталгаажуулна.
 *
 * MANUFACTURED бүтээгдэхүүн нөөцийн субьект БИШ — түүний өртөг жорноос
 * бодогдож, материал нь борлуулалтын үед хасагдана.
 */

export class InsufficientStockError extends Error {
  constructor(
    readonly materialName: string,
    readonly required: Dec,
    readonly available: Dec,
    readonly unit: string,
  ) {
    super(
      `"${materialName}" хүрэлцэхгүй байна. Шаардлагатай: ${required.toFixed(3)} ${unit}, ` +
        `үлдэгдэл: ${available.toFixed(3)} ${unit}.`,
    );
    this.name = "InsufficientStockError";
  }
}

/** Орлогын төрлүүд (эерэг тэмдэгтэй). */
const INBOUND: MovementType[] = [
  "PURCHASE_IN",
  "MANUAL_ADJUSTMENT_IN",
  "INVENTORY_COUNT_GAIN",
  "RETURN_IN",
  "CORRECTION_IN",
];

export function isInbound(type: MovementType): boolean {
  return INBOUND.includes(type);
}

// ---------------------------------------------------------------------------
// Нөөцийн субьект
// ---------------------------------------------------------------------------

export type StockSubject =
  | { kind: "rawMaterial"; id: string }
  | { kind: "product"; id: string };

export function rawMaterialSubject(id: string): StockSubject {
  return { kind: "rawMaterial", id };
}

export function productSubject(id: string): StockSubject {
  return { kind: "product", id };
}

/**
 * Дэвтрийн мөр / худалдан авалтын мөрөөс субьектийг тодорхойлно.
 * DB CHECK-ээр яг нэг нь утгатай тул энд алдаа гарвал өгөгдөл эвдэрсэн гэсэн үг.
 */
export function subjectOf(row: {
  rawMaterialId: string | null;
  productId: string | null;
}): StockSubject {
  if (row.rawMaterialId) return rawMaterialSubject(row.rawMaterialId);
  if (row.productId) return productSubject(row.productId);
  throw new Error("Нөөцийн мөрөнд субьект алга байна (өгөгдлийн зөрчил).");
}

/** Түгжигдсэн субьектийн нөөцийн төлөв — хоёр төрөлд нийтлэг. */
export type LockedStock = {
  subject: StockSubject;
  id: string;
  name: string;
  unit: Unit;
  quantity: Dec;
  averageCost: Dec;
};

export type CostPolicy =
  /** Одоогийн жигнэсэн дундаж өртгөөр — дундаж өртөг хэвээр үлдэнэ. */
  | { mode: "AVERAGE" }
  /** Тодорхой өртгөөр орлогодох — жигнэсэн дундаж дахин тооцоологдоно. */
  | { mode: "AT_COST"; unitCost: DecimalLike }
  /** Тодорхой өртгөөр буцаан хасах (худалдан авалт цуцлах) — дундажийг ухраана. */
  | { mode: "REMOVE_AT_COST"; unitCost: DecimalLike };

export type MovementInput = {
  /** Аль нөөцийн субьект дээр хөдөлгөөн үүсгэх вэ. */
  subject: StockSubject;
  movementType: MovementType;
  /** Үргэлж ЭЕРЭГ хэмжээ (материалын үндсэн нэгжээр). Чиглэлийг төрөл заана. */
  quantity: DecimalLike;
  costPolicy?: CostPolicy;
  referenceType: string;
  referenceId?: string | null;
  note?: string | null;
  userId: string;
  /** Эзний зөвшөөрлөөр сөрөг үлдэгдэл рүү оруулах. */
  allowNegative?: boolean;
};

export type MovementResult = {
  movementId: string;
  unitCost: Dec;
  totalCost: Dec;
  balanceAfter: Dec;
  newAverageCost: Dec;
};

/**
 * Жигнэсэн дундаж өртөг:
 *   шинэДундаж = (хуучинТоо × хуучинДундаж + шинэТоо × шинэӨртөг) / (хуучинТоо + шинэТоо)
 */
export function calculateWeightedAverageCost(
  oldQuantity: DecimalLike,
  oldAverageCost: DecimalLike,
  incomingQuantity: DecimalLike,
  incomingUnitCost: DecimalLike,
): Dec {
  const oldQty = d(oldQuantity);
  const oldAvg = d(oldAverageCost);
  const inQty = d(incomingQuantity);
  const inCost = d(incomingUnitCost);

  const totalQty = oldQty.plus(inQty);
  if (totalQty.lessThanOrEqualTo(0)) {
    // Үлдэгдэл тэг буюу сөрөг бол сүүлийн мэдэгдэж буй өртгийг барина.
    return toCost(inCost.isZero() ? oldAvg : inCost);
  }
  // Сөрөг үлдэгдэлтэй үед хуучин үнэлгээ утгагүй тул шинэ өртгөөр эхлүүлнэ.
  if (oldQty.lessThanOrEqualTo(0)) return toCost(inCost);

  const totalValue = oldQty.times(oldAvg).plus(inQty.times(inCost));
  return toCost(totalValue.dividedBy(totalQty));
}

/** Худалдан авалт цуцлахад дундаж өртгийг ухраах. */
function reverseWeightedAverageCost(
  oldQuantity: DecimalLike,
  oldAverageCost: DecimalLike,
  removedQuantity: DecimalLike,
  removedUnitCost: DecimalLike,
): Dec {
  const oldQty = d(oldQuantity);
  const oldAvg = d(oldAverageCost);
  const remQty = d(removedQuantity);

  const remainingQty = oldQty.minus(remQty);
  if (remainingQty.lessThanOrEqualTo(0)) return toCost(oldAvg);

  const remainingValue = oldQty.times(oldAvg).minus(remQty.times(d(removedUnitCost)));
  if (remainingValue.lessThanOrEqualTo(0)) return toCost(oldAvg);

  return toCost(remainingValue.dividedBy(remainingQty));
}

/**
 * Материалын мөрийг гүйлгээний туршид түгжинэ (зэрэгцээ бичилтээс хамгаална).
 * Тоо хэмжээ / өртгийг уншихаас өмнө дуудвал зөрүү тооцоо гацахгүй.
 */
export async function lockRawMaterial(tx: Tx, rawMaterialId: string): Promise<RawMaterial> {
  await tx.$queryRaw`SELECT id FROM "RawMaterial" WHERE id = ${rawMaterialId} FOR UPDATE`;
  const material = await tx.rawMaterial.findUnique({ where: { id: rawMaterialId } });
  if (!material) throw new Error("Бараа материал олдсонгүй.");
  return material;
}

/**
 * RESALE бүтээгдэхүүний мөрийг түгжинэ.
 * MANUFACTURED бүтээгдэхүүн нөөцийн субьект биш тул татгалзана —
 * түүний өртөг жорноос бодогддог.
 */
export async function lockResaleProduct(tx: Tx, productId: string) {
  await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${productId} FOR UPDATE`;
  const product = await tx.product.findUnique({ where: { id: productId } });
  if (!product) throw new Error("Бүтээгдэхүүн олдсонгүй.");
  if (product.productType !== "RESALE") {
    throw new Error(
      `"${product.name}" нь үйлдвэрлэдэг бүтээгдэхүүн тул өөрийн нөөцийн хөдөлгөөнгүй.`,
    );
  }
  return product;
}

/** Субьектээс үл хамааран нэгдсэн хэлбэрээр түгжиж уншина. */
export async function lockStock(tx: Tx, subject: StockSubject): Promise<LockedStock> {
  if (subject.kind === "rawMaterial") {
    const m = await lockRawMaterial(tx, subject.id);
    return {
      subject,
      id: m.id,
      name: m.name,
      unit: m.unit,
      quantity: d(m.quantity),
      averageCost: d(m.averageCost),
    };
  }
  const p = await lockResaleProduct(tx, subject.id);
  return {
    subject,
    id: p.id,
    name: p.name,
    unit: p.unit,
    quantity: d(p.quantity),
    averageCost: d(p.averageCost),
  };
}

/**
 * Нэг нөөцийн хөдөлгөөн бүртгэх. ЗААВАЛ гүйлгээний дотор дуудна.
 */
export async function applyMovement(tx: Tx, input: MovementInput): Promise<MovementResult> {
  const stock = await lockStock(tx, input.subject);

  const absQty = toQty(d(input.quantity).abs());
  if (absQty.lessThanOrEqualTo(0)) {
    throw new Error(`"${stock.name}" — тоо хэмжээ 0-ээс их байх ёстой.`);
  }

  const inbound = isInbound(input.movementType);
  const signedQty = inbound ? absQty : absQty.negated();
  const balanceAfter = toQty(d(stock.quantity).plus(signedQty));

  if (!inbound && balanceAfter.lessThan(0)) {
    const negativeAllowed = input.allowNegative ?? (await allowNegativeStock(tx));
    if (!negativeAllowed) {
      throw new InsufficientStockError(
        stock.name,
        absQty,
        d(stock.quantity),
        unitLabel(stock.unit),
      );
    }
  }

  const policy: CostPolicy = input.costPolicy ?? { mode: "AVERAGE" };
  let unitCost: Dec;
  let newAverageCost: Dec;

  switch (policy.mode) {
    case "AT_COST": {
      unitCost = toCost(policy.unitCost);
      newAverageCost = calculateWeightedAverageCost(
        stock.quantity,
        stock.averageCost,
        absQty,
        unitCost,
      );
      break;
    }
    case "REMOVE_AT_COST": {
      unitCost = toCost(policy.unitCost);
      newAverageCost = reverseWeightedAverageCost(
        stock.quantity,
        stock.averageCost,
        absQty,
        unitCost,
      );
      break;
    }
    default: {
      unitCost = toCost(stock.averageCost);
      newAverageCost = toCost(stock.averageCost);
      break;
    }
  }

  const totalCost = d(signedQty).times(unitCost).toDecimalPlaces(2);

  const isRawMaterial = input.subject.kind === "rawMaterial";

  const movement = await tx.inventoryMovement.create({
    data: {
      // Яг нэг субьект — нөгөө нь null (DB CHECK үүнийг баталгаажуулна).
      rawMaterialId: isRawMaterial ? stock.id : null,
      productId: isRawMaterial ? null : stock.id,
      movementType: input.movementType,
      quantity: signedQty,
      unitCost,
      totalCost,
      balanceAfter,
      referenceType: input.referenceType,
      referenceId: input.referenceId ?? null,
      note: input.note ?? null,
      createdById: input.userId,
    },
    select: { id: true },
  });

  const stockUpdate = {
    quantity: balanceAfter,
    averageCost: newAverageCost,
    ...(input.movementType === "PURCHASE_IN" ? { lastPurchasePrice: unitCost } : {}),
  };

  if (isRawMaterial) {
    await tx.rawMaterial.update({ where: { id: stock.id }, data: stockUpdate });
  } else {
    await tx.product.update({ where: { id: stock.id }, data: stockUpdate });
  }

  return {
    movementId: movement.id,
    unitCost,
    totalCost,
    balanceAfter,
    newAverageCost,
  };
}

/** Нөөцийн нийт үнэлгээ (тоо × дундаж өртөг). */
export function inventoryValue(quantity: DecimalLike, averageCost: DecimalLike): Dec {
  return d(quantity).times(d(averageCost)).toDecimalPlaces(2);
}

/** Дэвтрийн нийлбэр ба бүртгэлийн үлдэгдэл тохирч буй эсэхийг шалгах. */
export async function verifyLedgerConsistency(
  tx: Tx,
): Promise<{ subject: StockSubject; name: string; stored: Dec; ledger: Dec }[]> {
  const [materials, products, byMaterial, byProduct] = await Promise.all([
    tx.rawMaterial.findMany({ select: { id: true, name: true, quantity: true } }),
    // MANUFACTURED бүтээгдэхүүн дэвтэрт ордоггүй тул шалгалтад оруулахгүй.
    tx.product.findMany({
      where: { productType: "RESALE" },
      select: { id: true, name: true, quantity: true },
    }),
    tx.inventoryMovement.groupBy({ by: ["rawMaterialId"], _sum: { quantity: true } }),
    tx.inventoryMovement.groupBy({ by: ["productId"], _sum: { quantity: true } }),
  ]);

  const materialSums = new Map(
    byMaterial.filter((g) => g.rawMaterialId).map((g) => [g.rawMaterialId!, d(g._sum.quantity ?? 0)]),
  );
  const productSums = new Map(
    byProduct.filter((g) => g.productId).map((g) => [g.productId!, d(g._sum.quantity ?? 0)]),
  );

  const rows = [
    ...materials.map((m) => ({
      subject: rawMaterialSubject(m.id),
      name: m.name,
      stored: d(m.quantity),
      ledger: materialSums.get(m.id) ?? ZERO,
    })),
    ...products.map((p) => ({
      subject: productSubject(p.id),
      name: p.name,
      stored: d(p.quantity),
      ledger: productSums.get(p.id) ?? ZERO,
    })),
  ];

  return rows.filter((row) => !row.stored.equals(row.ledger));
}
