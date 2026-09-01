"use server";

import { redirect } from "next/navigation";
import { getCurrentUser, destroyCurrentSession, getClientIp } from "@/lib/auth/session";
import { writeAudit } from "@/lib/audit";

export async function logoutAction(): Promise<void> {
  const user = await getCurrentUser();
  if (user) {
    await writeAudit({
      userId: user.id,
      action: "LOGOUT",
      entityType: "User",
      entityId: user.id,
      ipAddress: await getClientIp(),
    });
  }
  await destroyCurrentSession();
  redirect("/login");
}
