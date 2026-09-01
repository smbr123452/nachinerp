import { z } from "zod";
import { Account, ProductType, PurchasePaymentMethod, Role, Unit } from "@prisma/client";
import { MANUAL_MOVEMENT_TYPES } from "@/lib/movements";

/** "1 200.5" / "1,200.5" гэх мэт оролтыг цэвэрлэнэ. */
const numericString = z
  .string()
  .trim()
  .transform((v) => v.replace(/\s|,/g, ""))
  .refine((v) => v !== "" && !Number.isNaN(Number(v)), { message: "Тоо оруулна уу." });

export const positiveAmount = numericString.refine((v) => Number(v) > 0, {
  message: "0-ээс их тоо оруулна уу.",
});

export const nonNegativeAmount = numericString.refine((v) => Number(v) >= 0, {
  message: "Сөрөг тоо байж болохгүй.",
});

export const dateInput = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Огноо буруу байна." });

export const optionalText = z
  .string()
  .trim()
  .max(500, "500 тэмдэгтээс хэтэрч болохгүй.")
  .optional()
  .transform((v) => (v === "" ? undefined : v));

export const requiredText = (label: string, max = 200) =>
  z.string().trim().min(1, `${label} заавал бөглөнө.`).max(max, `${max} тэмдэгтээс хэтэрч болохгүй.`);

// --- Нэвтрэх --------------------------------------------------------------

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("И-мэйл хаяг буруу байна."),
  password: z.string().min(1, "Нууц үгээ оруулна уу."),
});

// --- Хэрэглэгч ------------------------------------------------------------

export const userCreateSchema = z.object({
  email: z.string().trim().toLowerCase().email("И-мэйл хаяг буруу байна."),
  name: requiredText("Нэр"),
  role: z.nativeEnum(Role),
  password: z.string().min(8, "Нууц үг 8-аас доошгүй тэмдэгт байна."),
});

export const userUpdateSchema = z.object({
  id: z.string().min(1),
  name: requiredText("Нэр"),
  role: z.nativeEnum(Role),
  isActive: z.coerce.boolean(),
});

export const passwordResetSchema = z.object({
  id: z.string().min(1),
  password: z.string().min(8, "Нууц үг 8-аас доошгүй тэмдэгт байна."),
});

// --- Бараа материал -------------------------------------------------------

// Код нь sequence-ээс автоматаар үүсдэг тул формоос ирэхгүй.
export const rawMaterialSchema = z.object({
  name: requiredText("Нэр"),
  categoryId: z.string().optional().transform((v) => (v ? v : undefined)),
  unit: z.nativeEnum(Unit),
  minimumStock: nonNegativeAmount,
  isActive: z.coerce.boolean().default(true),
});

export const rawMaterialUpdateSchema = rawMaterialSchema.extend({ id: z.string().min(1) });

export const categorySchema = z.object({ name: requiredText("Нэр", 100) });

// --- Бүтээгдэхүүн ба жор --------------------------------------------------

export const productSchema = z.object({
  name: requiredText("Нэр"),
  categoryId: z.string().optional().transform((v) => (v ? v : undefined)),
  productType: z.nativeEnum(ProductType),
  sellingPrice: nonNegativeAmount,
  isActive: z.coerce.boolean().default(true),
  /** Зөвхөн RESALE-д хэрэглэгдэнэ; MANUFACTURED-д үл хамаарна. */
  unit: z.nativeEnum(Unit).default("PCS"),
  minimumStock: nonNegativeAmount.default("0"),
});

export const productUpdateSchema = productSchema.extend({ id: z.string().min(1) });

export const recipeLineSchema = z.object({
  rawMaterialId: z.string().min(1, "Материал сонгоно уу."),
  quantity: positiveAmount,
  unit: z.nativeEnum(Unit),
});

export const recipeSchema = z.object({
  productId: z.string().min(1),
  items: z.array(recipeLineSchema).max(50, "Жорын мөр хэт олон байна."),
});

// --- Худалдан авалт -------------------------------------------------------

/**
 * Худалдан авалтын мөр. Формоос "rm:<id>" / "pr:<id>" хэлбэрийн нэг
 * түлхүүрээр ирж, энд түүхий эд / бүтээгдэхүүн болж задарна.
 */
export const purchaseLineSchema = z
  .object({
    itemKey: z.string().min(1, "Бараа сонгоно уу."),
    quantity: positiveAmount,
    unit: z.nativeEnum(Unit),
    unitPrice: nonNegativeAmount,
  })
  .transform((line, ctx) => {
    const match = /^(rm|pr):(.+)$/.exec(line.itemKey);
    if (!match) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["itemKey"], message: "Бараа сонгоно уу." });
      return z.NEVER;
    }
    const [, kind, id] = match;
    return {
      rawMaterialId: kind === "rm" ? id : null,
      productId: kind === "pr" ? id : null,
      quantity: line.quantity,
      unit: line.unit,
      unitPrice: line.unitPrice,
    };
  });

export const purchaseSchema = z.object({
  date: dateInput,
  supplierId: z.string().optional().transform((v) => (v ? v : undefined)),
  paymentMethod: z.nativeEnum(PurchasePaymentMethod),
  note: optionalText,
  items: z.array(purchaseLineSchema).min(1, "Дор хаяж нэг мөр нэмнэ үү."),
});

export const supplierSchema = z.object({
  name: requiredText("Нэр", 150),
  phone: optionalText,
  note: optionalText,
});

// --- Борлуулалт -----------------------------------------------------------

export const saleLineSchema = z.object({
  productId: z.string().min(1, "Бүтээгдэхүүн сонгоно уу."),
  quantity: positiveAmount,
  unitPrice: nonNegativeAmount,
});

export const saleBatchSchema = z.object({
  date: dateInput,
  note: optionalText,
  items: z.array(saleLineSchema).min(1, "Дор хаяж нэг бүтээгдэхүүн нэмнэ үү."),
  cash: nonNegativeAmount,
  card: nonNegativeAmount,
  qr: nonNegativeAmount,
  bankTransfer: nonNegativeAmount,
  other: nonNegativeAmount,
  allowNegativeStock: z.coerce.boolean().default(false),
});

// --- Зардал ---------------------------------------------------------------

export const expenseSchema = z.object({
  date: dateInput,
  categoryId: z.string().min(1, "Ангилал сонгоно уу."),
  amount: positiveAmount,
  account: z.nativeEnum(Account),
  description: optionalText,
  receiptUrl: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v === "" ? undefined : v))
    .refine((v) => v === undefined || /^https?:\/\//i.test(v), {
      message: "Холбоос http:// эсвэл https:// -ээр эхэлнэ.",
    }),
});

export const expenseCategorySchema = z.object({
  name: requiredText("Нэр", 100),
  isActive: z.coerce.boolean().default(true),
});

// --- Тооллого -------------------------------------------------------------

export const countCreateSchema = z.object({
  date: dateInput,
  note: optionalText,
  rawMaterialIds: z.array(z.string().min(1)).min(1, "Дор хаяж нэг материал сонгоно уу."),
});

export const countLineSchema = z.object({
  rawMaterialId: z.string().min(1),
  countedQuantity: nonNegativeAmount,
});

// --- Мөнгө ба тохируулга --------------------------------------------------

export const bankDepositSchema = z.object({
  date: dateInput,
  amount: positiveAmount,
  note: optionalText,
});

export const moneyAdjustmentSchema = z.object({
  date: dateInput,
  account: z.nativeEnum(Account),
  direction: z.enum(["IN", "OUT"]),
  amount: positiveAmount,
  note: requiredText("Тайлбар"),
});

export const manualAdjustmentSchema = z.object({
  rawMaterialId: z.string().min(1),
  movementType: z.enum(MANUAL_MOVEMENT_TYPES),
  quantity: positiveAmount,
  note: requiredText("Шалтгаан"),
});

export const cancelSchema = z.object({
  id: z.string().min(1),
  note: requiredText("Шалтгаан"),
});

/** Zod алдааг талбар бүрээр бүлэглэнэ. */
export function fieldErrors(error: z.ZodError): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    (result[key] ??= []).push(issue.message);
  }
  return result;
}

/** Тоон талбарыг уншина. Хоосон талбарыг өгөгдсөн анхдагч утгаар солино. */
export function formNumber(formData: FormData, key: string, fallback = "0"): string {
  const value = String(formData.get(key) ?? "").trim();
  return value === "" ? fallback : value;
}

/** Динамик мөрүүдийг FormData-аас уншина: items[0][field] хэлбэр. */
export function parseRows(formData: FormData, prefix: string, fields: string[]) {
  const rows: Record<string, string>[] = [];
  let index = 0;
  for (;;) {
    const present = fields.some((f) => formData.has(`${prefix}[${index}][${f}]`));
    if (!present) break;
    const row: Record<string, string> = {};
    for (const field of fields) {
      row[field] = String(formData.get(`${prefix}[${index}][${field}]`) ?? "");
    }
    // Бүрэн хоосон мөрийг алгасна.
    if (fields.some((f) => row[f]?.trim())) rows.push(row);
    index += 1;
  }
  return rows;
}
