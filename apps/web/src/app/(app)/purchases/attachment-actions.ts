"use server";

import { revalidatePath } from "next/cache";
import { requireOperator, requireOwner } from "@/lib/auth/guards";
import { getClientIp } from "@/lib/auth/session";
import { fail, ok, toActionError, type ActionState } from "@/lib/action-result";
import {
  addPurchaseAttachment,
  deletePurchaseAttachment,
} from "@/server/services/attachments";

/**
 * Хавсралт нэмэх — OWNER ба MANAGER.
 * Хавсралт устгах — ЗӨВХӨН OWNER (баримтын нотолгоо алдагдахаас сэргийлнэ).
 * Эрхийн шалгалт бүхэлдээ энд, сервер талд.
 *
 * ЧУХАЛ: баталгаажсан (POSTED) буюу цуцлагдсан баримтын хавсралтыг
 * үйлчилгээний давхарга татгалзана. Худалдан авалт нь баталгаажуулах үед
 * үүсдэг тул эдгээр үйлдэлд UI-аас хүрэх зам байхгүй — гэхдээ API-г гараар
 * дуудвал ч хоригдоно. Ноорог (DRAFT) баримтад зориулж үлдээв.
 */

export async function uploadPurchaseAttachmentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireOperator();
    const purchaseId = String(formData.get("purchaseId") ?? "");
    if (!purchaseId) return fail("Баримт сонгогдоогүй байна.");

    const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
    if (files.length === 0) return fail("Файл сонгоно уу.");

    const ipAddress = await getClientIp();
    for (const file of files) {
      await addPurchaseAttachment({ purchaseId, file, userId: user.id, ipAddress });
    }

    revalidatePath(`/purchases/${purchaseId}`);
    return ok(files.length === 1 ? "Хавсралт нэмэгдлээ." : `${files.length} хавсралт нэмэгдлээ.`);
  } catch (error) {
    return toActionError(error);
  }
}

export async function deletePurchaseAttachmentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireOwner();
    const attachmentId = String(formData.get("attachmentId") ?? "");
    if (!attachmentId) return fail("Хавсралт сонгогдоогүй байна.");

    const { purchaseId } = await deletePurchaseAttachment({
      attachmentId,
      userId: user.id,
      ipAddress: await getClientIp(),
    });

    revalidatePath(`/purchases/${purchaseId}`);
    return ok("Хавсралт устгагдлаа.");
  } catch (error) {
    return toActionError(error);
  }
}
