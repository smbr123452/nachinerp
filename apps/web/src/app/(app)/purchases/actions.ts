"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOperator } from "@/lib/auth/guards";
import { getClientIp } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { fail, isUniqueViolation, ok, toActionError, type ActionState } from "@/lib/action-result";
import { cancelSchema, fieldErrors, parseRows, purchaseSchema } from "@/lib/validation";
import { parseDateInput } from "@/lib/dates";
import { cancelPurchase, postPurchase } from "@/server/services/purchases";
import {
  ALLOWED_MIME_TYPES,
  MAX_ATTACHMENT_BYTES,
  fileStorage,
  isAllowedMimeType,
} from "@/server/storage";
import { sanitizeDisplayFileName } from "@/server/services/attachments";

/** Зөвхөн зураг — баримтын гэрэл зураг. PDF энд ороогүй. */
const RECEIPT_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/**
 * Худалдан авалтыг БАТАЛГААЖУУЛАХ.
 *
 * Энэ үйлдэл дуудагдах хүртэл ямар ч баримт, нөөцийн хөдөлгөөн, мөнгөн
 * гүйлгээ үүсэхгүй — модал дээр "Цуцлах" дарвал өгөгдлийн санд юу ч
 * үлдэхгүй.
 */
export async function createPurchaseAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let purchaseId: string | null = null;
  // Гүйлгээ унавал диск дээр өнчин файл үлдээхгүйн тулд гадна барина.
  let storedKey: string | null = null;
  try {
    const user = await requireOperator();
    const rows = parseRows(formData, "items", ["itemKey", "quantity", "unit", "unitPrice"]);
    const parsed = purchaseSchema.safeParse({
      date: formData.get("date"),
      supplierId: formData.get("supplierId"),
      paymentMethod: formData.get("paymentMethod"),
      note: formData.get("note"),
      items: rows,
      dueDate: formData.get("dueDate") ?? undefined,
      creditNote: formData.get("creditNote"),
    });
    if (!parsed.success) return fail("Мэдээллээ шалгана уу.", fieldErrors(parsed.error));

    // --- Баримтын зураг (заавал биш) ------------------------------------
    const receiptFile = formData.get("receipt");
    let receipt: {
      storageKey: string;
      originalFileName: string;
      mimeType: string;
      fileSize: number;
    } | null = null;

    if (receiptFile instanceof File && receiptFile.size > 0) {
      const mimeType = receiptFile.type;
      if (!isAllowedMimeType(mimeType) || !RECEIPT_MIME_TYPES.includes(mimeType as never)) {
        return fail("Баримтын зураг JPG, PNG эсвэл WEBP байх ёстой.");
      }
      if (receiptFile.size > MAX_ATTACHMENT_BYTES) {
        return fail(`Зургийн хэмжээ ${MAX_ATTACHMENT_BYTES / 1024 / 1024}MB-аас хэтрэхгүй байх ёстой.`);
      }
      const data = Buffer.from(await receiptFile.arrayBuffer());
      if (data.byteLength > MAX_ATTACHMENT_BYTES) {
        return fail("Зургийн хэмжээ хэтэрсэн байна.");
      }
      // Файлыг гүйлгээнээс ГАДНА бичнэ — гүйлгээ дотор файл бичих нь
      // түгжээг удаан барина.
      const stored = await fileStorage.put({ data, mimeType });
      storedKey = stored.storageKey;
      receipt = {
        storageKey: stored.storageKey,
        originalFileName: sanitizeDisplayFileName(receiptFile.name),
        mimeType,
        fileSize: stored.fileSize,
      };
    }

    const idempotencyKey = String(formData.get("idempotencyKey") ?? "").trim() || null;

    const purchase = await postPurchase({
      date: parseDateInput(parsed.data.date),
      supplierId: parsed.data.supplierId,
      paymentMethod: parsed.data.paymentMethod,
      note: parsed.data.note,
      items: parsed.data.items,
      userId: user.id,
      ipAddress: await getClientIp(),
      receipt,
      idempotencyKey,
      dueDate: parsed.data.dueDate ? parseDateInput(parsed.data.dueDate) : null,
      creditNote: parsed.data.creditNote,
    });
    purchaseId = purchase.id;
    if (purchase.created) {
      // Баримт үүссэн тул файл нь одоо түүнд харьяалагдана.
      storedKey = null;
    }
    // created:false бол давхардсан илгээлт — энэ удаад хадгалсан файлыг
    // доорх catch/цэвэрлэгээ устгана, өмнөх баримтын зураг хэвээр үлдэнэ.
  } catch (error) {
    if (storedKey) await fileStorage.delete(storedKey).catch(() => {});
    return toActionError(error);
  }

  // Давхардсан илгээлтийн өнчин файлыг цэвэрлэнэ.
  if (storedKey) await fileStorage.delete(storedKey).catch(() => {});

  revalidatePath("/purchases");
  revalidatePath("/materials");
  revalidatePath("/products");
  revalidatePath("/dashboard");
  redirect(`/purchases/${purchaseId}`);
}

export async function cancelPurchaseAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireOperator();
    const parsed = cancelSchema.safeParse({ id: formData.get("id"), note: formData.get("note") });
    if (!parsed.success) return fail("Шалтгаанаа бичнэ үү.", fieldErrors(parsed.error));

    await cancelPurchase({
      purchaseId: parsed.data.id,
      userId: user.id,
      note: parsed.data.note,
      ipAddress: await getClientIp(),
    });

    revalidatePath("/purchases");
    revalidatePath(`/purchases/${parsed.data.id}`);
    revalidatePath("/materials");
    revalidatePath("/dashboard");
    return ok("Худалдан авалт цуцлагдлаа.");
  } catch (error) {
    return toActionError(error);
  }
}
