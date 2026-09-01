import type { Prisma } from "@prisma/client";

type Num = Prisma.Decimal | number | string | null | undefined;

function toNum(value: Num): number {
  if (value === null || value === undefined || value === "") return 0;
  return typeof value === "number" ? value : Number(value.toString());
}

/** 6 820 000 ₮ */
export function formatMoney(value: Num, withSymbol = true): string {
  const n = toNum(value);
  const text = new Intl.NumberFormat("mn-MN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(n));
  return withSymbol ? `${text} ₮` : text;
}

/** Нэгжийн өртөг зэрэг нарийн дүн. */
export function formatMoneyPrecise(value: Num): string {
  const n = toNum(value);
  return `${new Intl.NumberFormat("mn-MN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n)} ₮`;
}

/** 182.5 — эцсийн тэгүүдийг хасна. */
export function formatQty(value: Num): string {
  const n = toNum(value);
  return new Intl.NumberFormat("mn-MN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(n);
}

export function formatPercent(value: Num, digits = 1): string {
  return `${toNum(value).toFixed(digits)}%`;
}

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "-";
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("mn-MN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "-";
  const date = typeof value === "string" ? new Date(value) : value;
  return `${formatDate(date)} ${new Intl.DateTimeFormat("mn-MN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)}`;
}

/** <input type="date"> -д тохирох YYYY-MM-DD. */
export function toDateInput(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${m}-${day}`;
}
