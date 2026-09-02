import type { PurchasePaymentMethod } from "@prisma/client";

/**
 * Худалдан авалтын шошгууд.
 *
 * ЭНЭ ФАЙЛ "server-only" БАЙХГҮЙ: шошгыг сервер ба клиент хоёул ашигладаг
 * (баталгаажуулах модал клиент талд ажиллана).
 */
export const PURCHASE_PAYMENT_LABEL: Record<PurchasePaymentMethod, string> = {
  CASH: "Бэлэн",
  BANK: "Банк",
  CREDIT: "Зээлээр / Дараа төлөх",
};

/**
 * Худалдан авалтын баримтын төлөв.
 *
 * Баримт нь ЗӨВХӨН баталгаажуулах үед үүсдэг тул POSTED = "Баталгаажсан".
 * Борлуулалт, тооллогын нийтлэг шошгыг (DOC_STATUS_LABEL) хөндөөгүй.
 */
export const PURCHASE_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Ноорог",
  POSTED: "Баталгаажсан",
  CANCELLED: "Цуцлагдсан",
  REVERSED: "Буцаагдсан",
};
