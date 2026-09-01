/**
 * Огнооны туслах функцууд. Сервер дээр бүх тооцоо нэг цагийн бүсээр
 * (APP_TIMEZONE_OFFSET_HOURS, анхдагч UTC+8 = Улаанбаатар) явагдана.
 */
export const OFFSET_HOURS = Number(process.env.APP_TIMEZONE_OFFSET_HOURS ?? 8);
const OFFSET_MS = OFFSET_HOURS * 60 * 60 * 1000;

/** Тухайн орон нутгийн өдрийн 00:00-ийг UTC Date болгож буцаана. */
export function startOfLocalDay(date: Date = new Date()): Date {
  const shifted = new Date(date.getTime() + OFFSET_MS);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - OFFSET_MS);
}

export function endOfLocalDay(date: Date = new Date()): Date {
  return addDays(startOfLocalDay(date), 1);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export function startOfLocalMonth(date: Date = new Date()): Date {
  const shifted = new Date(date.getTime() + OFFSET_MS);
  shifted.setUTCDate(1);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - OFFSET_MS);
}

export function startOfNextLocalMonth(date: Date = new Date()): Date {
  const shifted = new Date(date.getTime() + OFFSET_MS);
  shifted.setUTCDate(1);
  shifted.setUTCHours(0, 0, 0, 0);
  shifted.setUTCMonth(shifted.getUTCMonth() + 1);
  return new Date(shifted.getTime() - OFFSET_MS);
}

/** "2026-09-01" гэх мэт оролтыг тухайн өдрийн эхлэл болгож хөрвүүлнэ. */
export function parseDateInput(value: string): Date {
  const [y, m, day] = value.split("-").map(Number);
  if (!y || !m || !day) throw new Error("Огноо буруу байна.");
  return new Date(Date.UTC(y, m - 1, day) - OFFSET_MS);
}

/** Орон нутгийн YYYY-MM-DD түлхүүр — өдрөөр бүлэглэхэд. */
export function localDayKey(date: Date): string {
  const shifted = new Date(date.getTime() + OFFSET_MS);
  return shifted.toISOString().slice(0, 10);
}
