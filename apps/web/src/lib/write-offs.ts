import type { DocStatus, WriteOffReason } from "@prisma/client";

/**
 * Актаар хасах шалтгааны дэлгэцийн нэрс.
 *
 * Дотооддоо бүтэцтэй утга (enum) хадгална — тайланг шалтгаанаар бүлэглэх,
 * хожим нэрийг өөрчлөхөд түүхэн өгөгдөл эвдрэхгүй байх зорилготой.
 */
export const WRITE_OFF_REASON_LABEL: Record<WriteOffReason, string> = {
  EXPIRED: "Хугацаа дууссан",
  SPOILED: "Муудсан",
  DAMAGED: "Гэмтсэн",
  SPILLED_BROKEN: "Асгарсан / Хагарсан",
  LOSS: "Алдагдал",
  INTERNAL_USE: "Дотоод хэрэглээ",
  QUALITY_REJECTED: "Чанарын шаардлага хангаагүй",
  OTHER: "Бусад",
};

/** Дэлгэцэнд сонголт болгон харуулах дараалал. */
export const WRITE_OFF_REASONS = [
  "EXPIRED",
  "SPOILED",
  "DAMAGED",
  "SPILLED_BROKEN",
  "LOSS",
  "INTERNAL_USE",
  "QUALITY_REJECTED",
  "OTHER",
] as const satisfies readonly WriteOffReason[];

/** "Бусад" шалтгаанд тайлбар заавал шаардана — өөр шалтгаанд сонголттой. */
export function reasonRequiresNote(reason: WriteOffReason): boolean {
  return reason === "OTHER";
}

/** Актад ашиглагдах төлөвүүд. DocStatus-ийн CANCELLED энд хэрэглэгдэхгүй. */
export const WRITE_OFF_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Ноорог",
  POSTED: "Батлагдсан",
  REVERSED: "Буцаасан",
};

export function writeOffStatusLabel(status: DocStatus): string {
  return WRITE_OFF_STATUS_LABEL[status] ?? status;
}

/** Зөвхөн БАТЛАГДСАН акт бодит хорогдол. Буцаасан акт тайланд орохгүй. */
export function countsAsLoss(status: DocStatus): boolean {
  return status === "POSTED";
}
