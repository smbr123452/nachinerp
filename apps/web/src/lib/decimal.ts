import { Prisma } from "@prisma/client";

export const D = Prisma.Decimal;
export type Dec = Prisma.Decimal;

export type DecimalLike = Prisma.Decimal | number | string;

export const ZERO = new Prisma.Decimal(0);

export function d(value: DecimalLike | null | undefined): Dec {
  if (value === null || value === undefined || value === "") return new Prisma.Decimal(0);
  return new Prisma.Decimal(value);
}

/** Мөнгөн дүн — 2 оронтой, банкны бус (half-up) тойролт. */
export function money(value: DecimalLike): Dec {
  return d(value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

/** Тоо хэмжээ — 3 оронтой. */
export function qty(value: DecimalLike): Dec {
  return d(value).toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP);
}

/** Нэгжийн өртөг — 4 оронтой. */
export function cost(value: DecimalLike): Dec {
  return d(value).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
}

export function isZero(value: DecimalLike): boolean {
  return d(value).isZero();
}

export function sum(values: DecimalLike[]): Dec {
  return values.reduce<Dec>((acc, v) => acc.plus(d(v)), new Prisma.Decimal(0));
}

/** Клиент рүү дамжуулахын тулд Decimal/Date-г энгийн утга болгоно. */
export function toNumber(value: DecimalLike | null | undefined): number {
  return d(value).toNumber();
}
