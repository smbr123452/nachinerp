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

// ---------------------------------------------------------------------------
// Актын хүрээ (context)
// ---------------------------------------------------------------------------

/**
 * Актын хүрээ — аль төрлийн нөөцийн субьектийг агуулахыг заана.
 *
 *   RAW_MATERIAL — зөвхөн бараа материал
 *   PRODUCT      — зөвхөн бүтээгдэхүүн (одоогоор бэлэн буюу RESALE)
 *   MIXED        — хоёуланг агуулсан ХУУЧИН баримт. Шинээр үүсэхгүй, гэхдээ
 *                  түүхэнд байвал уншигдана.
 *
 * Хүрээ нь баримтын мөрүүдээс ГАРНА — тусад нь багана хадгалахгүй. Ингэснээр
 * хуучин баримтууд нүүлгэлтгүйгээр зөв ангилагдана: мөр нь ямар субьекттэй
 * байсан, тэр нь хүрээг нь тодорхойлно.
 */
export type WriteOffContext = "RAW_MATERIAL" | "PRODUCT";
export type WriteOffDocumentContext = WriteOffContext | "MIXED";

export const WRITE_OFF_CONTEXT_LABEL: Record<WriteOffDocumentContext, string> = {
  RAW_MATERIAL: "Бараа материал",
  PRODUCT: "Бүтээгдэхүүн",
  MIXED: "Холимог (хуучин баримт)",
};

/** Хүрээ бүрийн үндсэн зам. Жагсаалт, шинэ маягт, дэлгэрэнгүй нь эндээс. */
export const WRITE_OFF_BASE_PATH: Record<WriteOffContext, string> = {
  RAW_MATERIAL: "/materials/write-offs",
  PRODUCT: "/products/write-offs",
};

export function writeOffPath(context: WriteOffContext, suffix = ""): string {
  return `${WRITE_OFF_BASE_PATH[context]}${suffix}`;
}

/** Мөрүүдээс баримтын хүрээг гаргана. */
export function deriveWriteOffContext(
  items: { rawMaterialId: string | null; productId: string | null }[],
): WriteOffDocumentContext {
  const hasMaterial = items.some((i) => i.rawMaterialId !== null);
  const hasProduct = items.some((i) => i.productId !== null);
  if (hasMaterial && hasProduct) return "MIXED";
  return hasProduct ? "PRODUCT" : "RAW_MATERIAL";
}

/** Хуучин холимог баримтыг дэлгэцэнд тусгайлан тэмдэглэнэ. */
export function isLegacyMixed(context: WriteOffDocumentContext): boolean {
  return context === "MIXED";
}
