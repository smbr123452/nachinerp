import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/core/db/prisma";
import { hashPassword } from "@/core/auth/password";
import { requirePermission } from "@/core/auth/rbac";
import { writeAuditLog } from "@/core/audit/audit";

function asBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value === "true") return true;
    if (value === "false") return false;
  }
  return undefined;
}

export async function GET() {
  const auth = await requirePermission("admin.users.read");
  if (auth instanceof NextResponse) return auth;

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      roles: {
        include: {
          role: true,
        },
      },
    },
  });

  return NextResponse.json({
    users: users.map((u) => ({
      id: u.id,
      username: u.username,
      fullName: u.fullName,
      isActive: u.isActive,
      createdAt: u.createdAt,
      roles: u.roles.map((r) => ({
        id: r.id,
        roleId: r.roleId,
        roleCode: r.role.code,
        roleNameMn: r.role.nameMn,
        scopeType: r.scopeType,
        scopeId: r.scopeId,
      })),
    })),
  });
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission("admin.users.write");
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const username = String(body.username ?? "").trim();
  const fullName = String(body.fullName ?? "").trim();
  const password = String(body.password ?? "");

  if (!username || !fullName || !password) {
    return NextResponse.json({ message: "Хэрэглэгч үүсгэх мэдээлэл дутуу байна." }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    return NextResponse.json({ message: "Хэрэглэгчийн нэр давхцаж байна." }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);

  const created = await prisma.user.create({
    data: {
      username,
      fullName,
      passwordHash,
      isActive: true,
    },
  });

  await writeAuditLog({
    actorUserId: auth.user.id,
    module: "admin.users",
    action: "create",
    entityType: "User",
    entityId: created.id,
    afterData: { username: created.username, fullName: created.fullName, isActive: created.isActive },
    ipAddress: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({ message: "Хэрэглэгч амжилттай үүслээ." });
}

export async function PATCH(request: NextRequest) {
  const auth = await requirePermission("admin.users.write");
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const userId = String(body.userId ?? "").trim();
  const fullName = body.fullName !== undefined ? String(body.fullName).trim() : undefined;
  const isActive = asBoolean(body.isActive);
  const password = body.password !== undefined ? String(body.password) : undefined;

  if (!userId) {
    return NextResponse.json({ message: "userId шаардлагатай." }, { status: 400 });
  }

  const before = await prisma.user.findUnique({ where: { id: userId } });
  if (!before) {
    return NextResponse.json({ message: "Хэрэглэгч олдсонгүй." }, { status: 404 });
  }

  const updateData: { fullName?: string; isActive?: boolean; passwordHash?: string } = {};
  if (fullName !== undefined && fullName.length > 0) updateData.fullName = fullName;
  if (isActive !== undefined) updateData.isActive = isActive;
  if (password !== undefined && password.length > 0) {
    updateData.passwordHash = await hashPassword(password);
  }

  const after = await prisma.user.update({
    where: { id: userId },
    data: updateData,
  });

  await writeAuditLog({
    actorUserId: auth.user.id,
    module: "admin.users",
    action: "update",
    entityType: "User",
    entityId: userId,
    beforeData: { fullName: before.fullName, isActive: before.isActive },
    afterData: { fullName: after.fullName, isActive: after.isActive },
    ipAddress: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({ message: "Хэрэглэгч шинэчлэгдлээ." });
}

export async function DELETE(request: NextRequest) {
  const auth = await requirePermission("admin.users.write");
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const userId = String(body.userId ?? "").trim();
  if (!userId) {
    return NextResponse.json({ message: "userId шаардлагатай." }, { status: 400 });
  }

  const before = await prisma.user.findUnique({ where: { id: userId } });
  if (!before) {
    return NextResponse.json({ message: "Хэрэглэгч олдсонгүй." }, { status: 404 });
  }

  const after = await prisma.user.update({
    where: { id: userId },
    data: { isActive: false },
  });

  await writeAuditLog({
    actorUserId: auth.user.id,
    module: "admin.users",
    action: "deactivate",
    entityType: "User",
    entityId: userId,
    beforeData: { isActive: before.isActive },
    afterData: { isActive: after.isActive },
    ipAddress: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({ message: "Хэрэглэгч идэвхгүй боллоо." });
}

