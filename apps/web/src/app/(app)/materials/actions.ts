"use server";

import { revalidatePath } from "next/cache";
import { requireOperator } from "@/lib/auth/guards";
import { getClientIp } from "@/lib/auth/session";
import { writeAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { fail, isUniqueViolation, ok, toActionError, type ActionState } from "@/lib/action-result";
import {
  fieldErrors,
  formNumber,
  manualAdjustmentSchema,
  rawMaterialSchema,
  rawMaterialUpdateSchema,
} from "@/lib/validation";
import { postManualAdjustment } from "@/server/services/adjustments";
import { nextEntityCode } from "@/server/services/numbering";

export async function createRawMaterialAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireOperator();
    const parsed = rawMaterialSchema.safeParse({
      name: formData.get("name"),
      categoryId: formData.get("categoryId"),
      unit: formData.get("unit"),
      minimumStock: formNumber(formData, "minimumStock"),
      isActive: formData.get("isActive") === "on",
    });
    if (!parsed.success) return fail("Мэдээллээ шалгана уу.", fieldErrors(parsed.error));

    // Код нь sequence-ээс — зэрэгцээ хүсэлтэд ч давхцахгүй.
    const sku = await nextEntityCode("rawMaterial");

    const material = await prisma.rawMaterial.create({
      data: {
        sku,
        name: parsed.data.name,
        categoryId: parsed.data.categoryId ?? null,
        unit: parsed.data.unit,
        minimumStock: parsed.data.minimumStock,
        isActive: parsed.data.isActive,
      },
    });

    await writeAudit({
      userId: user.id,
      action: "RAW_MATERIAL_CREATED",
      entityType: "RawMaterial",
      entityId: material.id,
      newValue: { sku: material.sku, name: material.name, unit: material.unit },
      ipAddress: await getClientIp(),
    });

    revalidatePath("/materials");
    return ok("Бараа материал нэмэгдлээ.");
  } catch (error) {
    if (isUniqueViolation(error)) return fail("Энэ код бүхий материал бүртгэлтэй байна.");
    return toActionError(error);
  }
}

export async function updateRawMaterialAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireOperator();
    const parsed = rawMaterialUpdateSchema.safeParse({
      id: formData.get("id"),
      name: formData.get("name"),
      categoryId: formData.get("categoryId"),
      unit: formData.get("unit"),
      minimumStock: formNumber(formData, "minimumStock"),
      isActive: formData.get("isActive") === "on",
    });
    if (!parsed.success) return fail("Мэдээллээ шалгана уу.", fieldErrors(parsed.error));

    const before = await prisma.rawMaterial.findUnique({ where: { id: parsed.data.id } });
    if (!before) return fail("Бараа материал олдсонгүй.");

    // Нөөцтэй материалын үндсэн нэгжийг солих нь түүхэн өртгийг гажуудуулна.
    const unitChanged = before.unit !== parsed.data.unit;
    if (unitChanged && !before.quantity.equals(0)) {
      return fail("Үлдэгдэлтэй материалын үндсэн нэгжийг солих боломжгүй.");
    }

    const updated = await prisma.rawMaterial.update({
      where: { id: parsed.data.id },
      data: {
        // Код өөрчлөгдөхгүй — түүхэн баримтуудын холбоос тогтвортой байна.
        name: parsed.data.name,
        categoryId: parsed.data.categoryId ?? null,
        unit: parsed.data.unit,
        minimumStock: parsed.data.minimumStock,
        isActive: parsed.data.isActive,
      },
    });

    await writeAudit({
      userId: user.id,
      action: "RAW_MATERIAL_UPDATED",
      entityType: "RawMaterial",
      entityId: updated.id,
      oldValue: {
        sku: before.sku,
        name: before.name,
        unit: before.unit,
        minimumStock: before.minimumStock.toString(),
        isActive: before.isActive,
      },
      newValue: {
        sku: updated.sku,
        name: updated.name,
        unit: updated.unit,
        minimumStock: updated.minimumStock.toString(),
        isActive: updated.isActive,
      },
      ipAddress: await getClientIp(),
    });

    revalidatePath("/materials");
    revalidatePath(`/materials/${updated.id}`);
    return ok("Хадгалагдлаа.");
  } catch (error) {
    if (isUniqueViolation(error)) return fail("Энэ код бүхий материал бүртгэлтэй байна.");
    return toActionError(error);
  }
}


export async function manualAdjustmentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireOperator();
    const parsed = manualAdjustmentSchema.safeParse({
      rawMaterialId: formData.get("rawMaterialId"),
      movementType: formData.get("movementType"),
      quantity: formData.get("quantity"),
      note: formData.get("note"),
    });
    if (!parsed.success) return fail("Мэдээллээ шалгана уу.", fieldErrors(parsed.error));

    await postManualAdjustment({
      rawMaterialId: parsed.data.rawMaterialId,
      movementType: parsed.data.movementType,
      quantity: parsed.data.quantity,
      note: parsed.data.note,
      userId: user.id,
      ipAddress: await getClientIp(),
    });

    revalidatePath("/materials");
    revalidatePath(`/materials/${parsed.data.rawMaterialId}`);
    return ok("Тохируулга бүртгэгдлээ.");
  } catch (error) {
    return toActionError(error);
  }
}
