"use server";

import { revalidatePath } from "next/cache";
import { requireOperator, requireOwner } from "@/lib/auth/guards";
import { getClientIp } from "@/lib/auth/session";
import { fail, isUniqueViolation, ok, toActionError, type ActionState } from "@/lib/action-result";
import { categorySchema, fieldErrors } from "@/lib/validation";
import {
  createCategory,
  deleteCategory,
  renameCategory,
  setCategoryActive,
  type CategoryKind,
} from "@/server/services/categories";

/**
 * Ангиллын үйлдлүүд. Эрхийн шалгалт БҮГД энд, сервер талд.
 *
 *   нэмэх / нэр солих / идэвхжүүлэх — OWNER, MANAGER
 *   бүр мөсөн устгах                — ЗӨВХӨН OWNER
 *
 * UI дээр товч нуух нь хамгаалалт биш — устгах үйлдэл requireOwner()-ээр
 * зогсоно.
 */

function pathFor(kind: CategoryKind): string {
  return kind === "rawMaterial" ? "/materials" : "/products";
}

function parseKind(value: FormDataEntryValue | null): CategoryKind {
  if (value === "rawMaterial" || value === "product") return value;
  throw new Error("Ангиллын төрөл буруу байна.");
}

export async function createCategoryAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireOperator();
    const kind = parseKind(formData.get("kind"));
    const parsed = categorySchema.safeParse({ name: formData.get("name") });
    if (!parsed.success) return fail("Нэрээ шалгана уу.", fieldErrors(parsed.error));

    await createCategory({
      kind,
      name: parsed.data.name,
      userId: user.id,
      ipAddress: await getClientIp(),
    });

    revalidatePath(pathFor(kind));
    return ok("Ангилал нэмэгдлээ.");
  } catch (error) {
    if (isUniqueViolation(error)) return fail("Ийм нэртэй ангилал бүртгэлтэй байна.");
    return toActionError(error);
  }
}

export async function renameCategoryAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireOperator();
    const kind = parseKind(formData.get("kind"));
    const id = String(formData.get("id") ?? "");
    if (!id) return fail("Ангилал сонгогдоогүй байна.");

    const parsed = categorySchema.safeParse({ name: formData.get("name") });
    if (!parsed.success) return fail("Нэрээ шалгана уу.", fieldErrors(parsed.error));

    await renameCategory({
      kind,
      id,
      name: parsed.data.name,
      userId: user.id,
      ipAddress: await getClientIp(),
    });

    revalidatePath(pathFor(kind));
    return ok("Нэр солигдлоо.");
  } catch (error) {
    if (isUniqueViolation(error)) return fail("Ийм нэртэй ангилал бүртгэлтэй байна.");
    return toActionError(error);
  }
}

export async function setCategoryActiveAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireOperator();
    const kind = parseKind(formData.get("kind"));
    const id = String(formData.get("id") ?? "");
    if (!id) return fail("Ангилал сонгогдоогүй байна.");
    const isActive = formData.get("isActive") === "true";

    await setCategoryActive({
      kind,
      id,
      isActive,
      userId: user.id,
      ipAddress: await getClientIp(),
    });

    revalidatePath(pathFor(kind));
    return ok(isActive ? "Ангилал сэргээгдлээ." : "Ангилал идэвхгүй боллоо.");
  } catch (error) {
    return toActionError(error);
  }
}

/** ЗӨВХӨН OWNER. Ашиглагдаж буй ангиллыг устгахгүй. */
export async function deleteCategoryAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireOwner();
    const kind = parseKind(formData.get("kind"));
    const id = String(formData.get("id") ?? "");
    if (!id) return fail("Ангилал сонгогдоогүй байна.");

    await deleteCategory({ kind, id, userId: user.id, ipAddress: await getClientIp() });

    revalidatePath(pathFor(kind));
    return ok("Ангилал устгагдлаа.");
  } catch (error) {
    return toActionError(error);
  }
}
