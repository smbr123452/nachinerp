"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOperator } from "@/lib/auth/guards";
import { getClientIp } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { fail, isUniqueViolation, ok, toActionError, type ActionState } from "@/lib/action-result";
import { cancelSchema, fieldErrors, parseRows, purchaseSchema, supplierSchema } from "@/lib/validation";
import { parseDateInput } from "@/lib/dates";
import { cancelPurchase, postPurchase } from "@/server/services/purchases";

export async function createPurchaseAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let purchaseId: string | null = null;
  try {
    const user = await requireOperator();
    const rows = parseRows(formData, "items", ["rawMaterialId", "quantity", "unit", "unitPrice"]);
    const parsed = purchaseSchema.safeParse({
      date: formData.get("date"),
      supplierId: formData.get("supplierId"),
      paymentMethod: formData.get("paymentMethod"),
      note: formData.get("note"),
      items: rows,
    });
    if (!parsed.success) return fail("Мэдээллээ шалгана уу.", fieldErrors(parsed.error));

    const purchase = await postPurchase({
      date: parseDateInput(parsed.data.date),
      supplierId: parsed.data.supplierId,
      paymentMethod: parsed.data.paymentMethod,
      note: parsed.data.note,
      items: parsed.data.items,
      userId: user.id,
      ipAddress: await getClientIp(),
    });
    purchaseId = purchase.id;
  } catch (error) {
    return toActionError(error);
  }

  revalidatePath("/purchases");
  revalidatePath("/materials");
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

export async function createSupplierAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireOperator();
    const parsed = supplierSchema.safeParse({
      name: formData.get("name"),
      phone: formData.get("phone"),
      note: formData.get("note"),
    });
    if (!parsed.success) return fail("Мэдээллээ шалгана уу.", fieldErrors(parsed.error));

    await prisma.supplier.create({
      data: { name: parsed.data.name, phone: parsed.data.phone ?? null, note: parsed.data.note ?? null },
    });
    revalidatePath("/purchases");
    return ok("Нийлүүлэгч нэмэгдлээ.");
  } catch (error) {
    if (isUniqueViolation(error)) return fail("Ийм нэртэй нийлүүлэгч бүртгэлтэй байна.");
    return toActionError(error);
  }
}
