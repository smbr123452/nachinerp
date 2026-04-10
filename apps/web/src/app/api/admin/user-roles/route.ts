import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/core/db/prisma";
import { requirePermission } from "@/core/auth/rbac";
import { writeAuditLog } from "@/core/audit/audit";

export async function POST(request: NextRequest) {
  const auth = await requirePermission("admin.users.write");
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const userId = String(body.userId ?? "").trim();
  const roleId = String(body.roleId ?? "").trim();
  const scopeType = String(body.scopeType ?? "GLOBAL").trim().toUpperCase();
  const scopeId = body.scopeId ? String(body.scopeId).trim() : null;

  if (!userId || !roleId) {
    return NextResponse.json({ message: "userId болон roleId шаардлагатай." }, { status: 400 });
  }

  const exists = await prisma.userRole.findFirst({
    where: { userId, roleId, scopeType: scopeType as "GLOBAL" | "BRANCH" | "WAREHOUSE", scopeId },
  });

  if (exists) {
    return NextResponse.json({ message: "Энэ role аль хэдийн оноогдсон байна." }, { status: 409 });
  }

  const created = await prisma.userRole.create({
    data: {
      userId,
      roleId,
      scopeType: scopeType as "GLOBAL" | "BRANCH" | "WAREHOUSE",
      scopeId,
    },
  });

  await writeAuditLog({
    actorUserId: auth.user.id,
    module: "admin.user_roles",
    action: "assign",
    entityType: "UserRole",
    entityId: created.id,
    afterData: { userId, roleId, scopeType, scopeId },
    ipAddress: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({ message: "Role оноолт амжилттай." });
}

export async function DELETE(request: NextRequest) {
  const auth = await requirePermission("admin.users.write");
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const userRoleId = String(body.userRoleId ?? "").trim();
  if (!userRoleId) {
    return NextResponse.json({ message: "userRoleId шаардлагатай." }, { status: 400 });
  }

  const before = await prisma.userRole.findUnique({ where: { id: userRoleId } });
  if (!before) {
    return NextResponse.json({ message: "Оноолт олдсонгүй." }, { status: 404 });
  }

  await prisma.userRole.delete({ where: { id: userRoleId } });

  await writeAuditLog({
    actorUserId: auth.user.id,
    module: "admin.user_roles",
    action: "remove",
    entityType: "UserRole",
    entityId: userRoleId,
    beforeData: before,
    ipAddress: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({ message: "Role оноолт хасагдлаа." });
}

