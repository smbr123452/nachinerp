"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOperator, requireOwner } from "@/lib/auth/guards";
import { getClientIp } from "@/lib/auth/session";
import { fail, ok, toActionError, type ActionState } from "@/lib/action-result";
import { fieldErrors, parseRows, writeOffLineSchema, writeOffSchema } from "@/lib/validation";
import { parseDateInput } from "@/lib/dates";
import { writeOffPath, type WriteOffContext } from "@/lib/write-offs";
import {
  createWriteOffDraft,
  deleteWriteOffDraft,
  postWriteOff,
  reverseWriteOff,
  updateWriteOffDraft,
  type WriteOffLineInput,
} from "@/server/services/write-offs";

/**
 * Актын хоёр урсгал (бараа материал / бүтээгдэхүүн) НЭГ л домэйн үйлчилгээ
 * дуудна. Ялгаа нь зөвхөн ХҮРЭЭ (context) — нягтлан бодох логик давхардахгүй.
 *
 * Эрхийн шалгалт БҮГД энд, сервер талд хийгдэнэ. UI дээр товч нуух нь
 * хамгаалалт биш — шууд POST илгээсэн ч эдгээр хамгаалалт үйлчилнэ.
 *
 *   requireOperator() — эзэн ба менежер хоёулаа акт үүсгэж, батална.
 *   requireOwner()    — буцаалт ЗӨВХӨН эзэн.
 *
 * Хүрээг формоос авдаг ч энэ нь ЭРСДЭЛГҮЙ: хүрээ нь зөвхөн аль төрлийн
 * субьект зөвшөөрөгдөхийг сонгодог бөгөөд субьект бүр тухайн хүрээнд
 * тохирохыг үйлчилгээ дахин шалгана. Өөрөөр хэлбэл хүрээг сольж ямар нэг
 * зүйлийг "нэвтрүүлэх" боломжгүй — зөвхөн өөр хүрээний хүчинтэй акт болно.
 */

/** Формоос ирсэн хүрээг батална. Танигдаагүй утга бол алдаа. */
function readContext(formData: FormData): WriteOffContext {
  const raw = String(formData.get("context") ?? "");
  if (raw !== "RAW_MATERIAL" && raw !== "PRODUCT") {
    throw new Error("Актын хүрээ тодорхойгүй байна.");
  }
  return raw;
}

/** Формын мөрүүдийг үйлчилгээний давхаргын оролт болгоно. */
function readLines(formData: FormData):
  | { ok: true; lines: WriteOffLineInput[] }
  | { ok: false; state: ActionState } {
  const rows = parseRows(formData, "lines", ["subject", "quantity"]);
  const parsed = writeOffLineSchema.array().min(1).safeParse(rows);
  if (!parsed.success) {
    return { ok: false, state: fail("Барааны мөрүүдийг шалгана уу.", fieldErrors(parsed.error)) };
  }

  const lines = parsed.data.map((row) => {
    const [kind, id] = row.subject.split(":");
    return kind === "rawMaterial"
      ? { rawMaterialId: id, quantity: row.quantity }
      : { productId: id, quantity: row.quantity };
  });

  return { ok: true, lines };
}

export async function createWriteOffAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let created: { id: string } | null = null;
  let context: WriteOffContext = "RAW_MATERIAL";
  try {
    const user = await requireOperator();
    context = readContext(formData);

    const parsed = writeOffSchema.safeParse({
      date: formData.get("date"),
      reason: formData.get("reason"),
      note: formData.get("note"),
    });
    if (!parsed.success) return fail("Мэдээллээ шалгана уу.", fieldErrors(parsed.error));

    const lines = readLines(formData);
    if (!lines.ok) return lines.state;

    created = await createWriteOffDraft({
      context,
      date: parseDateInput(parsed.data.date),
      reason: parsed.data.reason,
      note: parsed.data.note,
      lines: lines.lines,
      userId: user.id,
      ipAddress: await getClientIp(),
    });
  } catch (error) {
    return toActionError(error);
  }

  revalidatePath(writeOffPath(context));
  redirect(writeOffPath(context, `/${created.id}`));
}

export async function updateWriteOffAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireOperator();
    const context = readContext(formData);
    const writeOffId = String(formData.get("writeOffId") ?? "");

    const parsed = writeOffSchema.safeParse({
      date: formData.get("date"),
      reason: formData.get("reason"),
      note: formData.get("note"),
    });
    if (!parsed.success) return fail("Мэдээллээ шалгана уу.", fieldErrors(parsed.error));

    const lines = readLines(formData);
    if (!lines.ok) return lines.state;

    await updateWriteOffDraft({
      writeOffId,
      context,
      date: parseDateInput(parsed.data.date),
      reason: parsed.data.reason,
      note: parsed.data.note,
      lines: lines.lines,
      userId: user.id,
      ipAddress: await getClientIp(),
    });

    revalidatePath(writeOffPath(context, `/${writeOffId}`));
    return ok("Ноорог хадгалагдлаа.");
  } catch (error) {
    return toActionError(error);
  }
}

/**
 * Актыг батлах. Давхар дарахаас хамгаалахын тулд формоос ирсэн
 * idempotencyKey-г үйлчилгээ рүү дамжуулна — ижил түлхүүртэй хоёр дахь
 * илгээлт ШИНЭ хөдөлгөөн үүсгэхгүй.
 */
export async function postWriteOffAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireOperator();
    const context = readContext(formData);
    const writeOffId = String(formData.get("writeOffId") ?? "");
    const idempotencyKey = String(formData.get("idempotencyKey") ?? "").trim() || null;

    const result = await postWriteOff({
      writeOffId,
      userId: user.id,
      idempotencyKey,
      ipAddress: await getClientIp(),
    });

    revalidatePath(writeOffPath(context));
    revalidatePath(writeOffPath(context, `/${writeOffId}`));
    revalidatePath("/materials");
    revalidatePath("/products");
    return ok(
      result.posted
        ? `${result.documentNo} батлагдлаа.`
        : `${result.documentNo} аль хэдийн батлагдсан байна.`,
    );
  } catch (error) {
    return toActionError(error);
  }
}

/** Ноорог актыг устгах. Батлагдсан актыг үйлчилгээний давхарга татгалзана. */
export async function deleteWriteOffAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let context: WriteOffContext = "RAW_MATERIAL";
  try {
    const user = await requireOperator();
    context = readContext(formData);
    const writeOffId = String(formData.get("writeOffId") ?? "");

    await deleteWriteOffDraft({
      writeOffId,
      userId: user.id,
      ipAddress: await getClientIp(),
    });
  } catch (error) {
    return toActionError(error);
  }

  revalidatePath(writeOffPath(context));
  redirect(writeOffPath(context));
}

/**
 * Батлагдсан актыг буцаах — ЗӨВХӨН ЭЗЭН.
 *
 * Менежер энэ үйлдлийг хийх боломжгүй: товч нь UI дээр харагдахгүй бөгөөд
 * шууд илгээсэн ч requireOwner() татгалзана.
 */
export async function reverseWriteOffAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireOwner();
    const context = readContext(formData);
    const writeOffId = String(formData.get("writeOffId") ?? "");
    const note = String(formData.get("note") ?? "").trim() || null;

    const result = await reverseWriteOff({
      writeOffId,
      userId: user.id,
      note,
      ipAddress: await getClientIp(),
    });

    revalidatePath(writeOffPath(context));
    revalidatePath(writeOffPath(context, `/${writeOffId}`));
    revalidatePath("/materials");
    revalidatePath("/products");
    return ok(`${result.documentNo} буцаагдлаа.`);
  } catch (error) {
    return toActionError(error);
  }
}
