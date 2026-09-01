import { Unit } from "@prisma/client";
import { d, type DecimalLike, type Dec } from "./decimal";

export type UnitFamily = "WEIGHT" | "VOLUME" | "COUNT";

type UnitInfo = { family: UnitFamily; label: string; toBase: number };

/**
 * Жин (үндсэн: грамм) ба эзэлхүүн (үндсэн: мл) дотроо хөрвөнө.
 * Ширхэгийн нэгжүүд (ш/хайрцаг/багц) хоорондоо хөрвөхгүй — материал бүр
 * ганц үндсэн нэгжтэй тул хөрвүүлэлт хийхгүйгээр тодорхой байлгана.
 */
const UNITS: Record<Unit, UnitInfo> = {
  KG: { family: "WEIGHT", label: "кг", toBase: 1000 },
  GRAM: { family: "WEIGHT", label: "гр", toBase: 1 },
  LITER: { family: "VOLUME", label: "л", toBase: 1000 },
  ML: { family: "VOLUME", label: "мл", toBase: 1 },
  PCS: { family: "COUNT", label: "ш", toBase: 1 },
  BOX: { family: "COUNT", label: "хайрцаг", toBase: 1 },
  PACK: { family: "COUNT", label: "багц", toBase: 1 },
};

export const ALL_UNITS = Object.keys(UNITS) as Unit[];

export function unitLabel(unit: Unit): string {
  return UNITS[unit].label;
}

export function unitFamily(unit: Unit): UnitFamily {
  return UNITS[unit].family;
}

/** `from` нэгжийг `to` нэгж рүү хөрвүүлэх боломжтой эсэх. */
export function isConvertible(from: Unit, to: Unit): boolean {
  if (from === to) return true;
  const a = UNITS[from];
  const b = UNITS[to];
  return a.family === b.family && a.family !== "COUNT";
}

/** Материалын үндсэн нэгжтэй нийцэх бүх нэгжүүд. */
export function compatibleUnits(base: Unit): Unit[] {
  return ALL_UNITS.filter((u) => isConvertible(u, base));
}

export class UnitConversionError extends Error {
  constructor(from: Unit, to: Unit) {
    super(`"${unitLabel(from)}" нэгжийг "${unitLabel(to)}" рүү хөрвүүлэх боломжгүй.`);
    this.name = "UnitConversionError";
  }
}

/** Тоо хэмжээг хөрвүүлэх (жишээ: 250 гр -> 0.25 кг). */
export function convertQuantity(quantity: DecimalLike, from: Unit, to: Unit): Dec {
  if (from === to) return d(quantity);
  if (!isConvertible(from, to)) throw new UnitConversionError(from, to);
  return d(quantity).times(UNITS[from].toBase).dividedBy(UNITS[to].toBase);
}

/** Нэгж үнийг хөрвүүлэх (жишээ: 3200₮/кг -> 3.2₮/гр). */
export function convertUnitPrice(price: DecimalLike, from: Unit, to: Unit): Dec {
  if (from === to) return d(price);
  if (!isConvertible(from, to)) throw new UnitConversionError(from, to);
  return d(price).times(UNITS[to].toBase).dividedBy(UNITS[from].toBase);
}
