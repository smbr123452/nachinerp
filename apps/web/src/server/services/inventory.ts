import "server-only";
import { type MovementType, type RawMaterial } from "@prisma/client";
import { cost as toCost, d, qty as toQty, ZERO, type Dec, type DecimalLike } from "@/lib/decimal";
import { unitLabel } from "@/lib/units";
import type { Tx } from "@/lib/prisma";
import { allowNegativeStock } from "./settings";

/**
 * Нөөцийн ГАНЦ орох цэг.
 *
 * Дүрэм: RawMaterial.quantity / averageCost-ыг энэ файлаас гадуур
 * ХЭЗЭЭ Ч шууд өөрчлөхгүй. Бүх өөрчлөлт InventoryMovement үүсгэнэ.
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

export type CostPolicy =
  /** Одоогийн жигнэсэн дундаж өртгөөр — дундаж өртөг хэвээр үлдэнэ. */
  | { mode: "AVERAGE" }
  /** Тодорхой өртгөөр орлогодох — жигнэсэн дундаж дахин тооцоологдоно. */
  | { mode: "AT_COST"; unitCost: DecimalLike }
  /** Тодорхой өртгөөр буцаан хасах (худалдан авалт цуцлах) — дундажийг ухраана. */
  | { mode: "REMOVE_AT_COST"; unitCost: DecimalLike };

export type MovementInput = {
  rawMaterialId: string;
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
 * Нэг нөөцийн хөдөлгөөн бүртгэх. ЗААВАЛ гүйлгээний дотор дуудна.
 */
export async function applyMovement(tx: Tx, input: MovementInput): Promise<MovementResult> {
  const material = await lockRawMaterial(tx, input.rawMaterialId);

  const absQty = toQty(d(input.quantity).abs());
  if (absQty.lessThanOrEqualTo(0)) {
    throw new Error(`"${material.name}" — тоо хэмжээ 0-ээс их байх ёстой.`);
  }

  const inbound = isInbound(input.movementType);
  const signedQty = inbound ? absQty : absQty.negated();
  const balanceAfter = toQty(d(material.quantity).plus(signedQty));

  if (!inbound && balanceAfter.lessThan(0)) {
    const negativeAllowed = input.allowNegative ?? (await allowNegativeStock(tx));
    if (!negativeAllowed) {
      throw new InsufficientStockError(
        material.name,
        absQty,
        d(material.quantity),
        unitLabel(material.unit),
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
        material.quantity,
        material.averageCost,
        absQty,
        unitCost,
      );
      break;
    }
    case "REMOVE_AT_COST": {
      unitCost = toCost(policy.unitCost);
      newAverageCost = reverseWeightedAverageCost(
        material.quantity,
        material.averageCost,
        absQty,
        unitCost,
      );
      break;
    }
    default: {
      unitCost = toCost(material.averageCost);
      newAverageCost = toCost(material.averageCost);
      break;
    }
  }

  const totalCost = d(signedQty).times(unitCost).toDecimalPlaces(2);

  const movement = await tx.inventoryMovement.create({
    data: {
      rawMaterialId: material.id,
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

  await tx.rawMaterial.update({
    where: { id: material.id },
    data: {
      quantity: balanceAfter,
      averageCost: newAverageCost,
      ...(input.movementType === "PURCHASE_IN" ? { lastPurchasePrice: unitCost } : {}),
    },
  });

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
): Promise<{ rawMaterialId: string; name: string; stored: Dec; ledger: Dec }[]> {
  const materials = await tx.rawMaterial.findMany({ select: { id: true, name: true, quantity: true } });
  const grouped = await tx.inventoryMovement.groupBy({
    by: ["rawMaterialId"],
    _sum: { quantity: true },
  });
  const sums = new Map(grouped.map((g) => [g.rawMaterialId, d(g._sum.quantity ?? 0)]));

  return materials
    .map((m) => ({
      rawMaterialId: m.id,
      name: m.name,
      stored: d(m.quantity),
      ledger: sums.get(m.id) ?? ZERO,
    }))
    .filter((row) => !row.stored.equals(row.ledger));
}
