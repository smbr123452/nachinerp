"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth/guards";
import { getClientIp } from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";
import { writeAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { fail, isUniqueViolation, ok, toActionError, type ActionState } from "@/lib/action-result";
import { fieldErrors, passwordResetSchema, userCreateSchema, userUpdateSchema } from "@/lib/validation";
import { setSetting, SETTING_KEYS } from "@/server/services/settings";

export async function createUserAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const owner = await requireOwner();
    const parsed = userCreateSchema.safeParse({
      email: formData.get("email"),
      name: formData.get("name"),
      role: formData.get("role"),
      password: formData.get("password"),
    });
    if (!parsed.success) return fail("Мэдээллээ шалгана уу.", fieldErrors(parsed.error));

    const user = await prisma.user.create({
      data: {
        email: parsed.data.email,
        name: parsed.data.name,
        role: parsed.data.role,
        passwordHash: await hashPassword(parsed.data.password),
      },
    });

    await writeAudit({
      userId: owner.id,
      action: "USER_CREATED",
      entityType: "User",
      entityId: user.id,
      newValue: { email: user.email, name: user.name, role: user.role },
      ipAddress: await getClientIp(),
    });

    revalidatePath("/settings");
    return ok("Хэрэглэгч нэмэгдлээ.");
  } catch (error) {
    if (isUniqueViolation(error)) return fail("Энэ и-мэйл бүртгэлтэй байна.");
    return toActionError(error);
  }
}

export async function updateUserAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const owner = await requireOwner();
    const parsed = userUpdateSchema.safeParse({
      id: formData.get("id"),
      name: formData.get("name"),
      role: formData.get("role"),
      isActive: formData.get("isActive") === "on",
    });
    if (!parsed.success) return fail("Мэдээллээ шалгана уу.", fieldErrors(parsed.error));

    const before = await prisma.user.findUnique({ where: { id: parsed.data.id } });
    if (!before) return fail("Хэрэглэгч олдсонгүй.");

    // Системд дор хаяж нэг идэвхтэй эзэн үлдэх ёстой.
    if (before.role === "OWNER" && (parsed.data.role !== "OWNER" || !parsed.data.isActive)) {
      const otherOwners = await prisma.user.count({
        where: { role: "OWNER", isActive: true, NOT: { id: before.id } },
      });
      if (otherOwners === 0) return fail("Системд дор хаяж нэг идэвхтэй эзэн байх шаардлагатай.");
    }

    const updated = await prisma.user.update({
      where: { id: parsed.data.id },
      data: { name: parsed.data.name, role: parsed.data.role, isActive: parsed.data.isActive },
    });

    // Эрх нь хасагдсан хэрэглэгчийн нээлттэй сешнийг хаана.
    if (!updated.isActive) {
      await prisma.session.deleteMany({ where: { userId: updated.id } });
    }

    await writeAudit({
      userId: owner.id,
      action: "USER_UPDATED",
      entityType: "User",
      entityId: updated.id,
      oldValue: { name: before.name, role: before.role, isActive: before.isActive },
      newValue: { name: updated.name, role: updated.role, isActive: updated.isActive },
      ipAddress: await getClientIp(),
    });

    revalidatePath("/settings");
    return ok("Хадгалагдлаа.");
  } catch (error) {
    return toActionError(error);
  }
}

export async function resetPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const owner = await requireOwner();
    const parsed = passwordResetSchema.safeParse({
      id: formData.get("id"),
      password: formData.get("password"),
    });
    if (!parsed.success) return fail("Нууц үгээ шалгана уу.", fieldErrors(parsed.error));

    await prisma.user.update({
      where: { id: parsed.data.id },
      data: { passwordHash: await hashPassword(parsed.data.password) },
    });
    await prisma.session.deleteMany({ where: { userId: parsed.data.id } });

    await writeAudit({
      userId: owner.id,
      action: "USER_PASSWORD_CHANGED",
      entityType: "User",
      entityId: parsed.data.id,
      ipAddress: await getClientIp(),
    });

    revalidatePath("/settings");
    return ok("Нууц үг солигдлоо. Тухайн хэрэглэгч дахин нэвтэрнэ.");
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateSettingsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const owner = await requireOwner();
    const companyName = String(formData.get("companyName") ?? "").trim();
    const allowNegative = formData.get("allowNegativeStock") === "on";

    if (!companyName) return fail("Байгууллагын нэрийг бөглөнө үү.");

    await setSetting(SETTING_KEYS.COMPANY_NAME, companyName);
    await setSetting(SETTING_KEYS.ALLOW_NEGATIVE_STOCK, allowNegative ? "true" : "false");

    await writeAudit({
      userId: owner.id,
      action: "SETTING_UPDATED",
      entityType: "SystemSetting",
      newValue: { companyName, allowNegativeStock: allowNegative },
      ipAddress: await getClientIp(),
    });

    revalidatePath("/settings");
    return ok("Тохиргоо хадгалагдлаа.");
  } catch (error) {
    return toActionError(error);
  }
}
