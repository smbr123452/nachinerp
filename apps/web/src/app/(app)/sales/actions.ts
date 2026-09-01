"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOperator } from "@/lib/auth/guards";
import { getClientIp } from "@/lib/auth/session";
import { fail, ok, toActionError, type ActionState } from "@/lib/action-result";
import { cancelSchema, fieldErrors, formNumber, parseRows, saleBatchSchema } from "@/lib/validation";
import { parseDateInput } from "@/lib/dates";
import { cancelSaleBatch, postSalesBatch } from "@/server/services/sales";

export async function createSaleBatchAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let batchId: string | null = null;
  try {
    const user = await requireOperator();
    const rows = parseRows(formData, "items", ["productId", "quantity", "unitPrice"]);
    const parsed = saleBatchSchema.safeParse({
      date: formData.get("date"),
      note: formData.get("note"),
      items: rows,
      cash: formNumber(formData, "cash"),
      card: formNumber(formData, "card"),
      qr: formNumber(formData, "qr"),
      bankTransfer: formNumber(formData, "bankTransfer"),
      other: formNumber(formData, "other"),
      allowNegativeStock: formData.get("allowNegativeStock") === "on",
    });
    if (!parsed.success) return fail("Мэдээллээ шалгана уу.", fieldErrors(parsed.error));

    // Сөрөг үлдэгдлийг зөвхөн ЭЗЭН зөвшөөрч чадна — сервер талд шалгана.
    const allowNegativeStock = parsed.data.allowNegativeStock && user.role === "OWNER";
    if (parsed.data.allowNegativeStock && user.role !== "OWNER") {
      return fail("Нөөц хүрэлцэхгүй үед баталгаажуулах эрхийг зөвхөн эзэн олгоно.");
    }

    const batch = await postSalesBatch({
      date: parseDateInput(parsed.data.date),
      note: parsed.data.note,
      items: parsed.data.items,
      payments: {
        cash: parsed.data.cash,
        card: parsed.data.card,
        qr: parsed.data.qr,
        bankTransfer: parsed.data.bankTransfer,
        other: parsed.data.other,
      },
      userId: user.id,
      allowNegativeStock,
      ipAddress: await getClientIp(),
    });
    batchId = batch.id;
  } catch (error) {
    return toActionError(error);
  }

  revalidatePath("/sales");
  revalidatePath("/materials");
  revalidatePath("/dashboard");
  redirect(`/sales/${batchId}`);
}

export async function cancelSaleBatchAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireOperator();
    const parsed = cancelSchema.safeParse({ id: formData.get("id"), note: formData.get("note") });
    if (!parsed.success) return fail("Шалтгаанаа бичнэ үү.", fieldErrors(parsed.error));

    await cancelSaleBatch({
      saleBatchId: parsed.data.id,
      userId: user.id,
      note: parsed.data.note,
      ipAddress: await getClientIp(),
    });

    revalidatePath("/sales");
    revalidatePath(`/sales/${parsed.data.id}`);
    revalidatePath("/materials");
    revalidatePath("/dashboard");
    return ok("Борлуулалт цуцлагдлаа.");
  } catch (error) {
    return toActionError(error);
  }
}
