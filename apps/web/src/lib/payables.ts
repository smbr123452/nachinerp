import type { Account } from "@prisma/client";

/**
 * Нийлүүлэгчийн өглөгийн нийтлэг шошго ба клиент талын хэлбэрүүд.
 *
 * ЭНЭ ФАЙЛ "server-only" БАЙХГҮЙ: төлбөрийн модал, хүснэгт зэрэг клиент
 * бүрдлүүд шошгыг ашиглана.
 */

/**
 * Өглөгийн харагдах төлөв. ХАДГАЛАГДДАГГҮЙ — үлдэгдэл ба төлөх өдрөөс
 * тооцогдоно.
 */
export type PayableStatus = "UNPAID" | "PARTIAL" | "PAID" | "OVERDUE";

export const PAYABLE_STATUS_LABEL: Record<PayableStatus, string> = {
  UNPAID: "Төлөгдөөгүй",
  PARTIAL: "Хэсэгчлэн төлсөн",
  PAID: "Төлөгдсөн",
  OVERDUE: "Хугацаа хэтэрсэн",
};

export const PAYABLE_STATUS_TONE: Record<
  PayableStatus,
  "neutral" | "success" | "danger" | "warning" | "info"
> = {
  UNPAID: "neutral",
  PARTIAL: "info",
  PAID: "success",
  OVERDUE: "danger",
};

/** Мөнгөн дансны шошго — төлбөр хаанаас гарсныг харуулна. */
export const PAYMENT_ACCOUNT_LABEL: Record<Account, string> = {
  CASH: "Касс",
  BANK: "Банк",
};

/** Клиент рүү дамжуулах хэлбэр — Decimal, Date хоёулаа энгийн утга болно. */
export type ClientPayment = {
  id: string;
  amount: number;
  account: Account;
  paidAt: string;
  note: string | null;
  reference: string | null;
  status: "POSTED" | "REVERSED";
  createdByName: string;
  reversedAt: string | null;
  reversedByName: string | null;
  reversalNote: string | null;
};

export type ClientPayable = {
  id: string;
  purchaseId: string;
  purchaseNo: string;
  supplierId: string;
  supplierName: string;
  originalAmount: number;
  paid: number;
  outstanding: number;
  /** YYYY-MM-DD эсвэл null ("Тодорхойгүй"). */
  dueDate: string | null;
  note: string | null;
  status: PayableStatus;
  /** Худалдан авалт цуцлагдсан бол өглөг ч хаагдсан. */
  cancelled: boolean;
  payments: ClientPayment[];
};
