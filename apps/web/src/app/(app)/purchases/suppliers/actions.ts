"use server";

import { revalidatePath } from "next/cache";
import { requireOperator, requireOwner } from "@/lib/auth/guards";
import { getClientIp } from "@/lib/auth/session";
import { fail, isUniqueViolation, ok, toActionError, type ActionState } from "@/lib/action-result";
import { fieldErrors, supplierSchema, supplierUpdateSchema } from "@/lib/validation";
import {
  addSupplierItem,
  createSupplier,
  deleteSupplier,
  removeSupplierItem,
  setSupplierActive,
  updateSupplier,
} from "@/server/services/suppliers";

/**
 * Нийлүүлэгчийн үйлдлүүд. Эрхийн шалгалт БҮГД энд, сервер талд.
 *
 *   нэмэх / засах / идэвхжүүлэх / бараа холбох — OWNER, MANAGER
 *   бүр мөсөн устгах                            — ЗӨВХӨН OWNER
 *
 * UI дээр товч нуух нь хамгаалалт биш.
 */

function readSupplierInput(formData: FormData) {
  return {
    name: formData.get("name"),
    phone: formData.get("phone"),
    contactPerson: formData.get("contactPerson"),
    email: formData.get("email"),
    note: formData.get("note"),
  };
}

const DUPLICATE_MESSAGE = "Ийм нэртэй нийлүүлэгч бүртгэлтэй байна.";

export async function createSupplierAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireOperator();
    const parsed = supplierSchema.safeParse(readSupplierInput(formData));
    if (!parsed.success) return fail("Мэдээллээ шалгана уу.", fieldErrors(parsed.error));

    const supplier = await createSupplier({
      input: parsed.data,
      userId: user.id,
      ipAddress: await getClientIp(),
    });

    revalidatePath("/purchases/suppliers");
    // /purchases/new-г ЗОРИУДААР revalidate хийхгүй: худалдан авалтын форм
    // дотроос дуудагдахад хуудас дахин ачаалагдвал оруулсан мөрүүд алдагдах
    // эрсдэлтэй. Оронд нь шинэ нийлүүлэгчийг клиент тал жагсаалтдаа нэмнэ.
    return ok("Нийлүүлэгч нэмэгдлээ.", { id: supplier.id, name: supplier.name });
  } catch (error) {
    if (isUniqueViolation(error)) return fail(DUPLICATE_MESSAGE);
    return toActionError(error);
  }
}

export async function updateSupplierAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireOperator();
    const parsed = supplierUpdateSchema.safeParse({
      id: formData.get("id"),
      ...readSupplierInput(formData),
    });
    if (!parsed.success) return fail("Мэдээллээ шалгана уу.", fieldErrors(parsed.error));

    await updateSupplier({
      id: parsed.data.id,
      input: parsed.data,
      userId: user.id,
      ipAddress: await getClientIp(),
    });

    revalidatePath("/purchases/suppliers");
    revalidatePath(`/purchases/suppliers/${parsed.data.id}`);
    return ok("Хадгалагдлаа.");
  } catch (error) {
    if (isUniqueViolation(error)) return fail(DUPLICATE_MESSAGE);
    return toActionError(error);
  }
}

export async function setSupplierActiveAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireOperator();
    const id = String(formData.get("id") ?? "");
    if (!id) return fail("Нийлүүлэгч сонгогдоогүй байна.");
    const isActive = formData.get("isActive") === "true";

    await setSupplierActive({ id, isActive, userId: user.id, ipAddress: await getClientIp() });

    revalidatePath("/purchases/suppliers");
    revalidatePath(`/purchases/suppliers/${id}`);
    return ok(isActive ? "Нийлүүлэгч идэвхжлээ." : "Нийлүүлэгч идэвхгүй боллоо.");
  } catch (error) {
    return toActionError(error);
  }
}

/** ЗӨВХӨН OWNER. Худалдан авалтын түүхтэй нийлүүлэгчийг устгахгүй. */
export async function deleteSupplierAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireOwner();
    const id = String(formData.get("id") ?? "");
    if (!id) return fail("Нийлүүлэгч сонгогдоогүй байна.");

    await deleteSupplier({ id, userId: user.id, ipAddress: await getClientIp() });

    revalidatePath("/purchases/suppliers");
    return ok("Нийлүүлэгч устгагдлаа.");
  } catch (error) {
    return toActionError(error);
  }
}

export async function addSupplierItemAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireOperator();
    const supplierId = String(formData.get("supplierId") ?? "");
    const itemKey = String(formData.get("itemKey") ?? "");
    if (!supplierId) return fail("Нийлүүлэгч сонгогдоогүй байна.");
    if (!itemKey) return fail("Бараа сонгоно уу.");

    await addSupplierItem({ supplierId, itemKey, userId: user.id, ipAddress: await getClientIp() });

    revalidatePath(`/purchases/suppliers/${supplierId}`);
    revalidatePath("/purchases/new");
    return ok("Бараа нэмэгдлээ.");
  } catch (error) {
    if (isUniqueViolation(error)) return fail("Энэ бараа аль хэдийн холбогдсон байна.");
    return toActionError(error);
  }
}

/** Холбоос салгана. Худалдан авалтын түүхэд ХЭЗЭЭ Ч хүрэхгүй. */
export async function removeSupplierItemAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireOperator();
    const supplierItemId = String(formData.get("supplierItemId") ?? "");
    if (!supplierItemId) return fail("Холбоос сонгогдоогүй байна.");

    const { supplierId } = await removeSupplierItem({
      supplierItemId,
      userId: user.id,
      ipAddress: await getClientIp(),
    });

    revalidatePath(`/purchases/suppliers/${supplierId}`);
    revalidatePath("/purchases/new");
    return ok("Холбоос салгагдлаа. Худалдан авалтын түүх хэвээр үлдсэн.");
  } catch (error) {
    return toActionError(error);
  }
}
