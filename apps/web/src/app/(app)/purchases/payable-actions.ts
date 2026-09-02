"use server";

import { revalidatePath } from "next/cache";
import { requireOperator, requireOwner } from "@/lib/auth/guards";
import { getClientIp } from "@/lib/auth/session";
import { fail, ok, toActionError, type ActionState } from "@/lib/action-result";
import { fieldErrors, reversePaymentSchema, supplierPaymentSchema } from "@/lib/validation";
import { parseDateInput } from "@/lib/dates";
import { recordSupplierPayment, reverseSupplierPayment } from "@/server/services/payables";
import { prisma } from "@/lib/prisma";

/** Өглөгтэй холбоотой хуудсуудыг шинэчилнэ. */
async function revalidatePayable(payableId: string): Promise<void> {
  const payable = await prisma.supplierPayable.findUnique({
    where: { id: payableId },
    select: { purchaseId: true, supplierId: true },
  });
  if (payable) {
    revalidatePath(`/purchases/${payable.purchaseId}`);
    revalidatePath(`/purchases/suppliers/${payable.supplierId}`);
  }
  revalidatePath("/purchases");
  revalidatePath("/money");
  revalidatePath("/dashboard");
}

/**
 * Нийлүүлэгчид төлбөр хийх.
 *
 * Эрх: OWNER ба MANAGER хоёул төлбөр бүртгэнэ (requireOperator). Шалгалт
 * СЕРВЕР дээр — товч нуух нь хамгаалалт биш.
 *
 * Энэ үйлдэл ЗАРДАЛ үүсгэхгүй: зөвхөн мөнгө гарч, өр буурна.
 */
export async function recordSupplierPaymentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireOperator();
    const parsed = supplierPaymentSchema.safeParse({
      payableId: formData.get("payableId"),
      amount: formData.get("amount"),
      account: formData.get("account"),
      paidAt: formData.get("paidAt"),
      note: formData.get("note"),
      reference: formData.get("reference"),
    });
    if (!parsed.success) return fail("Мэдээллээ шалгана уу.", fieldErrors(parsed.error));

    const idempotencyKey = String(formData.get("idempotencyKey") ?? "").trim() || null;

    const result = await recordSupplierPayment({
      payableId: parsed.data.payableId,
      amount: parsed.data.amount,
      account: parsed.data.account,
      paidAt: parseDateInput(parsed.data.paidAt),
      note: parsed.data.note,
      reference: parsed.data.reference,
      userId: user.id,
      idempotencyKey,
      ipAddress: await getClientIp(),
    });

    await revalidatePayable(parsed.data.payableId);

    if (!result.created) return ok("Энэ төлбөр аль хэдийн бүртгэгдсэн байна.");
    return ok(
      result.outstanding.lessThanOrEqualTo(0)
        ? "Төлбөр бүртгэгдэж, өглөг бүрэн хаагдлаа."
        : `Төлбөр бүртгэгдлээ. Үлдэгдэл: ${result.outstanding.toFixed(2)}₮.`,
    );
  } catch (error) {
    return toActionError(error);
  }
}

/**
 * Төлбөрийг буцаах — ЗӨВХӨН эзэн.
 *
 * Устгахгүй: төлбөр REVERSED болж, эсрэг мөнгөн гүйлгээ үүснэ.
 */
export async function reverseSupplierPaymentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireOwner();
    const parsed = reversePaymentSchema.safeParse({
      paymentId: formData.get("paymentId"),
      note: formData.get("note"),
    });
    if (!parsed.success) return fail("Шалтгаанаа бичнэ үү.", fieldErrors(parsed.error));

    const payment = await prisma.supplierPayment.findUnique({
      where: { id: parsed.data.paymentId },
      select: { payableId: true },
    });
    if (!payment) return fail("Төлбөр олдсонгүй.");

    await reverseSupplierPayment({
      paymentId: parsed.data.paymentId,
      userId: user.id,
      note: parsed.data.note,
      ipAddress: await getClientIp(),
    });

    await revalidatePayable(payment.payableId);
    return ok("Төлбөр буцаагдлаа.");
  } catch (error) {
    return toActionError(error);
  }
}
