import "server-only";
import type { Prisma } from "@prisma/client";
import type { Tx } from "@/lib/prisma";
import { prisma } from "@/lib/prisma";

export type AuditAction =
  | "USER_CREATED"
  | "USER_UPDATED"
  | "USER_PASSWORD_CHANGED"
  | "LOGIN"
  | "LOGOUT"
  | "RAW_MATERIAL_CREATED"
  | "RAW_MATERIAL_UPDATED"
  | "PRODUCT_CREATED"
  | "PRODUCT_UPDATED"
  | "RECIPE_UPDATED"
  | "PURCHASE_CREATED"
  | "PURCHASE_CANCELLED"
  | "SALE_FINALIZED"
  | "SALE_CANCELLED"
  | "EXPENSE_CREATED"
  | "EXPENSE_CANCELLED"
  | "EXPENSE_CATEGORY_CREATED"
  | "EXPENSE_CATEGORY_UPDATED"
  | "INVENTORY_COUNT_CREATED"
  | "INVENTORY_COUNT_FINALIZED"
  | "INVENTORY_COUNT_CANCELLED"
  | "MANUAL_ADJUSTMENT"
  | "BANK_DEPOSIT"
  | "MONEY_ADJUSTMENT"
  | "SETTING_UPDATED";

export type AuditInput = {
  userId: string | null;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  oldValue?: Prisma.InputJsonValue | null;
  newValue?: Prisma.InputJsonValue | null;
  note?: string | null;
  ipAddress?: string | null;
};

/**
 * Аудит бичлэг. Гүйлгээний дотор дуудвал баримттай нэг атомт үйлдэл болно.
 */
export async function writeAudit(input: AuditInput, tx: Tx = prisma): Promise<void> {
  await tx.auditLog.create({
    data: {
      userId: input.userId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      oldValue: input.oldValue ?? undefined,
      newValue: input.newValue ?? undefined,
      note: input.note ?? null,
      ipAddress: input.ipAddress ?? null,
    },
  });
}

export const AUDIT_ACTION_LABEL: Record<string, string> = {
  USER_CREATED: "Хэрэглэгч үүсгэсэн",
  USER_UPDATED: "Хэрэглэгч засварласан",
  USER_PASSWORD_CHANGED: "Нууц үг солисон",
  LOGIN: "Нэвтэрсэн",
  LOGOUT: "Гарсан",
  RAW_MATERIAL_CREATED: "Материал нэмсэн",
  RAW_MATERIAL_UPDATED: "Материал засварласан",
  PRODUCT_CREATED: "Бүтээгдэхүүн нэмсэн",
  PRODUCT_UPDATED: "Бүтээгдэхүүн засварласан",
  RECIPE_UPDATED: "Жор шинэчилсэн",
  PURCHASE_CREATED: "Худалдан авалт бүртгэсэн",
  PURCHASE_CANCELLED: "Худалдан авалт цуцалсан",
  SALE_FINALIZED: "Борлуулалт баталгаажуулсан",
  SALE_CANCELLED: "Борлуулалт цуцалсан",
  EXPENSE_CREATED: "Зардал бүртгэсэн",
  EXPENSE_CANCELLED: "Зардал цуцалсан",
  EXPENSE_CATEGORY_CREATED: "Зардлын ангилал нэмсэн",
  EXPENSE_CATEGORY_UPDATED: "Зардлын ангилал засварласан",
  INVENTORY_COUNT_CREATED: "Тооллого үүсгэсэн",
  INVENTORY_COUNT_FINALIZED: "Тооллого баталгаажуулсан",
  INVENTORY_COUNT_CANCELLED: "Тооллого цуцалсан",
  MANUAL_ADJUSTMENT: "Гар тохируулга хийсэн",
  BANK_DEPOSIT: "Банкинд тушаасан",
  MONEY_ADJUSTMENT: "Мөнгөн тохируулга хийсэн",
  SETTING_UPDATED: "Тохиргоо өөрчилсөн",
};
