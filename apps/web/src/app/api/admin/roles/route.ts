import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/core/db/prisma";
import { requirePermission } from "@/core/auth/rbac";
import { writeAuditLog } from "@/core/audit/audit";

export async function GET() {
  const auth = await requirePermission("admin.roles.read");
  if (auth instanceof NextResponse) return auth;

  const roles = await prisma.role.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      permissions: {
        include: {
          permission: true,
        },
      },
    },
  });

  const permissions = await prisma.permission.findMany({
    orderBy: [{ module: "asc" }, { action: "asc" }],
  });

  return NextResponse.json({
    roles: roles.map((r) => ({
      id: r.id,
      code: r.code,
      nameMn: r.nameMn,
      description: r.description,
      permissions: r.permissions.map((rp) => ({
        id: rp.permission.id,
        code: rp.permission.code,
      })),
    })),
    permissions,
  });
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission("admin.roles.write");
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const code = String(body.code ?? "").trim();
  const nameMn = String(body.nameMn ?? "").trim();
  const description = body.description ? String(body.description).trim() : null;
  const permissionIds = Array.isArray(body.permissionIds) ? body.permissionIds.map(String) : [];

  if (!code || !nameMn) {
    return NextResponse.json({ message: "Role мэдээлэл дутуу байна." }, { status: 400 });
  }

  const exists = await prisma.role.findUnique({ where: { code } });
  if (exists) {
    return NextResponse.json({ message: "Role code давхцаж байна." }, { status: 409 });
  }

  const created = await prisma.role.create({
    data: {
      code,
      nameMn,
      description,
    },
  });

  if (permissionIds.length > 0) {
    await prisma.rolePermission.createMany({
      data: permissionIds.map((permissionId) => ({
        roleId: created.id,
        permissionId,
      })),
      skipDuplicates: true,
    });
  }

  await writeAuditLog({
    actorUserId: auth.user.id,
    module: "admin.roles",
    action: "create",
    entityType: "Role",
    entityId: created.id,
    afterData: { code: created.code, nameMn: created.nameMn, permissionIds },
    ipAddress: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({ message: "Role амжилттай үүслээ." });
}

export async function PATCH(request: NextRequest) {
  const auth = await requirePermission("admin.roles.write");
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const roleId = String(body.roleId ?? "").trim();
  const nameMn = body.nameMn !== undefined ? String(body.nameMn).trim() : undefined;
  const description = body.description !== undefined ? String(body.description).trim() : undefined;
  const permissionIds = Array.isArray(body.permissionIds) ? body.permissionIds.map(String) : undefined;

  if (!roleId) {
    return NextResponse.json({ message: "roleId шаардлагатай." }, { status: 400 });
  }

  const before = await prisma.role.findUnique({
    where: { id: roleId },
    include: { permissions: true },
  });
  if (!before) {
    return NextResponse.json({ message: "Role олдсонгүй." }, { status: 404 });
  }

  const updated = await prisma.role.update({
    where: { id: roleId },
    data: {
      nameMn: nameMn !== undefined && nameMn.length > 0 ? nameMn : undefined,
      description: description ?? undefined,
    },
  });

  if (permissionIds) {
    await prisma.rolePermission.deleteMany({ where: { roleId } });
    if (permissionIds.length > 0) {
      await prisma.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({ roleId, permissionId })),
        skipDuplicates: true,
      });
    }
  }

  await writeAuditLog({
    actorUserId: auth.user.id,
    module: "admin.roles",
    action: "update",
    entityType: "Role",
    entityId: roleId,
    beforeData: {
      nameMn: before.nameMn,
      description: before.description,
      permissionIds: before.permissions.map((p) => p.permissionId),
    },
    afterData: {
      nameMn: updated.nameMn,
      description: updated.description,
      permissionIds: permissionIds ?? before.permissions.map((p) => p.permissionId),
    },
    ipAddress: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({ message: "Role шинэчлэгдлээ." });
}

export async function DELETE(request: NextRequest) {
  const auth = await requirePermission("admin.roles.write");
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const roleId = String(body.roleId ?? "").trim();
  if (!roleId) {
    return NextResponse.json({ message: "roleId шаардлагатай." }, { status: 400 });
  }

  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (!role) {
    return NextResponse.json({ message: "Role олдсонгүй." }, { status: 404 });
  }

  await prisma.role.delete({ where: { id: roleId } });

  await writeAuditLog({
    actorUserId: auth.user.id,
    module: "admin.roles",
    action: "delete",
    entityType: "Role",
    entityId: roleId,
    beforeData: { code: role.code, nameMn: role.nameMn },
    ipAddress: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({ message: "Role устгагдлаа." });
}

