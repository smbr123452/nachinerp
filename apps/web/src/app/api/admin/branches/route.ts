import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/core/db/prisma";
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
  const auth = await requirePermission("admin.masterdata.read");
  if (auth instanceof NextResponse) return auth;

  const branches = await prisma.branch.findMany({
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ branches });
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission("admin.masterdata.write");
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const code = String(body.code ?? "").trim().toUpperCase();
  const nameMn = String(body.nameMn ?? "").trim();
  const address = body.address ? String(body.address).trim() : null;
  const phone = body.phone ? String(body.phone).trim() : null;

  if (!code || !nameMn) {
    return NextResponse.json({ message: "Салбарын код, нэр шаардлагатай." }, { status: 400 });
  }

  const exists = await prisma.branch.findUnique({ where: { code } });
  if (exists) {
    return NextResponse.json({ message: "Салбарын код давхцаж байна." }, { status: 409 });
  }

  const created = await prisma.branch.create({
    data: { code, nameMn, address, phone, isActive: true },
  });

  await writeAuditLog({
    actorUserId: auth.user.id,
    module: "admin.branches",
    action: "create",
    entityType: "Branch",
    entityId: created.id,
    afterData: created,
    ipAddress: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({ message: "Салбар амжилттай үүслээ." });
}

export async function PATCH(request: NextRequest) {
  const auth = await requirePermission("admin.masterdata.write");
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const branchId = String(body.branchId ?? "").trim();
  const code = body.code !== undefined ? String(body.code).trim().toUpperCase() : undefined;
  const nameMn = body.nameMn !== undefined ? String(body.nameMn).trim() : undefined;
  const address = body.address !== undefined ? String(body.address).trim() : undefined;
  const phone = body.phone !== undefined ? String(body.phone).trim() : undefined;
  const isActive = asBoolean(body.isActive);

  if (!branchId) {
    return NextResponse.json({ message: "branchId шаардлагатай." }, { status: 400 });
  }

  const before = await prisma.branch.findUnique({ where: { id: branchId } });
  if (!before) {
    return NextResponse.json({ message: "Салбар олдсонгүй." }, { status: 404 });
  }

  const after = await prisma.branch.update({
    where: { id: branchId },
    data: {
      code: code && code.length > 0 ? code : undefined,
      nameMn: nameMn && nameMn.length > 0 ? nameMn : undefined,
      address: address ?? undefined,
      phone: phone ?? undefined,
      isActive: isActive ?? undefined,
    },
  });

  await writeAuditLog({
    actorUserId: auth.user.id,
    module: "admin.branches",
    action: "update",
    entityType: "Branch",
    entityId: branchId,
    beforeData: before,
    afterData: after,
    ipAddress: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({ message: "Салбар шинэчлэгдлээ." });
}

export async function DELETE(request: NextRequest) {
  const auth = await requirePermission("admin.masterdata.write");
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const branchId = String(body.branchId ?? "").trim();
  if (!branchId) {
    return NextResponse.json({ message: "branchId шаардлагатай." }, { status: 400 });
  }

  const before = await prisma.branch.findUnique({ where: { id: branchId } });
  if (!before) {
    return NextResponse.json({ message: "Салбар олдсонгүй." }, { status: 404 });
  }

  const after = await prisma.branch.update({
    where: { id: branchId },
    data: { isActive: false },
  });

  await writeAuditLog({
    actorUserId: auth.user.id,
    module: "admin.branches",
    action: "delete",
    entityType: "Branch",
    entityId: branchId,
    beforeData: before,
    afterData: after,
    ipAddress: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({ message: "Салбар идэвхгүй боллоо." });
}

