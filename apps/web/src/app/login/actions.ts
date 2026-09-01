"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth/password";
import { createSession, getClientIp, setSessionCookie, purgeExpiredSessions } from "@/lib/auth/session";
import { writeAudit } from "@/lib/audit";
import { loginSchema } from "@/lib/validation";
import { fail, type ActionState } from "@/lib/action-result";

const GENERIC_ERROR = "И-мэйл эсвэл нууц үг буруу байна.";

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return fail(GENERIC_ERROR);

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  // Хэрэглэгч байхгүй ч нууц үгийг шалгаж, хариу өгөх хугацааг ойролцоо байлгана.
  const passwordOk = await verifyPassword(
    parsed.data.password,
    user?.passwordHash ?? "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv",
  );

  if (!user || !passwordOk) return fail(GENERIC_ERROR);
  if (!user.isActive) return fail("Таны эрх идэвхгүй байна. Эзэнтэй холбогдоно уу.");

  await purgeExpiredSessions();
  const { token, expiresAt } = await createSession(user.id);
  await setSessionCookie(token, expiresAt);
  await writeAudit({
    userId: user.id,
    action: "LOGIN",
    entityType: "User",
    entityId: user.id,
    ipAddress: await getClientIp(),
  });

  redirect("/dashboard");
}
