"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOperator } from "@/lib/auth/guards";
import { getClientIp } from "@/lib/auth/session";
import { fail, ok, toActionError, type ActionState } from "@/lib/action-result";
import { cancelSchema, countCreateSchema, countLineSchema, fieldErrors, parseRows } from "@/lib/validation";
import { parseDateInput } from "@/lib/dates";
import {
  cancelInventoryCount,
  createInventoryCount,
  finalizeInventoryCount,
  saveCountLines,
} from "@/server/services/counts";

export async function createCountAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let countId: string | null = null;
  try {
    const user = await requireOperator();
    const parsed = countCreateSchema.safeParse({
      date: formData.get("date"),
      note: formData.get("note"),
      rawMaterialIds: formData.getAll("rawMaterialIds").map(String),
    });
    if (!parsed.success) return fail("Мэдээллээ шалгана уу.", fieldErrors(parsed.error));

    const count = await createInventoryCount({
      date: parseDateInput(parsed.data.date),
      note: parsed.data.note,
      rawMaterialIds: parsed.data.rawMaterialIds,
      userId: user.id,
      ipAddress: await getClientIp(),
    });
    countId = count.id;
  } catch (error) {
    return toActionError(error);
  }

  revalidatePath("/counts");
  redirect(`/counts/${countId}`);
}

export async function saveCountAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireOperator();
    const countId = String(formData.get("countId") ?? "");
    const rows = parseRows(formData, "lines", ["rawMaterialId", "countedQuantity"]);
    const parsed = countLineSchema.array().safeParse(rows);
    if (!parsed.success) return fail("Тоолсон тоог шалгана уу.", fieldErrors(parsed.error));

    await saveCountLines({ countId, lines: parsed.data, userId: user.id });

    revalidatePath(`/counts/${countId}`);
    return ok("Хадгалагдлаа.");
  } catch (error) {
    return toActionError(error);
  }
}

export async function finalizeCountAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireOperator();
    const countId = String(formData.get("countId") ?? "");
    const rows = parseRows(formData, "lines", ["rawMaterialId", "countedQuantity"]);
    if (rows.length > 0) {
      const parsed = countLineSchema.array().safeParse(rows);
      if (!parsed.success) return fail("Тоолсон тоог шалгана уу.", fieldErrors(parsed.error));
      await saveCountLines({ countId, lines: parsed.data, userId: user.id });
    }

    const result = await finalizeInventoryCount({
      countId,
      userId: user.id,
      ipAddress: await getClientIp(),
    });

    revalidatePath("/counts");
    revalidatePath(`/counts/${countId}`);
    revalidatePath("/materials");
    revalidatePath("/dashboard");
    return ok(
      `Тооллого баталгаажлаа. ${result.adjustedCount} мөрөнд тохируулга хийж, зөрүү ${result.varianceAmount.toFixed(0)}₮ бүртгэгдлээ.`,
    );
  } catch (error) {
    return toActionError(error);
  }
}

export async function cancelCountAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireOperator();
    const parsed = cancelSchema.safeParse({ id: formData.get("id"), note: formData.get("note") });
    if (!parsed.success) return fail("Шалтгаанаа бичнэ үү.", fieldErrors(parsed.error));

    await cancelInventoryCount({
      countId: parsed.data.id,
      userId: user.id,
      note: parsed.data.note,
      ipAddress: await getClientIp(),
    });

    revalidatePath("/counts");
    revalidatePath(`/counts/${parsed.data.id}`);
    return ok("Тооллого цуцлагдлаа.");
  } catch (error) {
    return toActionError(error);
  }
}
