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

  const [warehouses, branches] = await Promise.all([
    prisma.warehouse.findMany({
      orderBy: { createdAt: "desc" },
      include: { branch: true },
    }),
    prisma.branch.findMany({
      where: { isActive: true },
      orderBy: { nameMn: "asc" },
      select: { id: true, code: true, nameMn: true },
    }),
  ]);

  return NextResponse.json({ warehouses, branches });
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission("admin.masterdata.write");
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const branchId = String(body.branchId ?? "").trim();
  const code = String(body.code ?? "").trim().toUpperCase();
  const nameMn = String(body.nameMn ?? "").trim();

  if (!branchId || !code || !nameMn) {
    return NextResponse.json({ message: "Склад үүсгэх мэдээлэл дутуу байна." }, { status: 400 });
  }

  const exists = await prisma.warehouse.findFirst({
    where: { branchId, code },
  });
  if (exists) {
    return NextResponse.json({ message: "Энэ салбар дээр складын код давхцаж байна." }, { status: 409 });
  }

  const created = await prisma.warehouse.create({
    data: { branchId, code, nameMn, isActive: true },
  });

  await writeAuditLog({
    actorUserId: auth.user.id,
    module: "admin.warehouses",
    action: "create",
    entityType: "Warehouse",
    entityId: created.id,
    afterData: created,
    ipAddress: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({ message: "Склад амжилттай үүслээ." });
}

export async function PATCH(request: NextRequest) {
  const auth = await requirePermission("admin.masterdata.write");
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const warehouseId = String(body.warehouseId ?? "").trim();
  const branchId = body.branchId !== undefined ? String(body.branchId).trim() : undefined;
  const code = body.code !== undefined ? String(body.code).trim().toUpperCase() : undefined;
  const nameMn = body.nameMn !== undefined ? String(body.nameMn).trim() : undefined;
  const isActive = asBoolean(body.isActive);

  if (!warehouseId) {
    return NextResponse.json({ message: "warehouseId шаардлагатай." }, { status: 400 });
  }

  const before = await prisma.warehouse.findUnique({ where: { id: warehouseId } });
  if (!before) {
    return NextResponse.json({ message: "Склад олдсонгүй." }, { status: 404 });
  }

  const after = await prisma.warehouse.update({
    where: { id: warehouseId },
    data: {
      branchId: branchId && branchId.length > 0 ? branchId : undefined,
      code: code && code.length > 0 ? code : undefined,
      nameMn: nameMn && nameMn.length > 0 ? nameMn : undefined,
      isActive: isActive ?? undefined,
    },
  });

  await writeAuditLog({
    actorUserId: auth.user.id,
    module: "admin.warehouses",
    action: "update",
    entityType: "Warehouse",
    entityId: warehouseId,
    beforeData: before,
    afterData: after,
    ipAddress: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({ message: "Склад шинэчлэгдлээ." });
}

export async function DELETE(request: NextRequest) {
  const auth = await requirePermission("admin.masterdata.write");
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const warehouseId = String(body.warehouseId ?? "").trim();
  if (!warehouseId) {
    return NextResponse.json({ message: "warehouseId шаардлагатай." }, { status: 400 });
  }

  const before = await prisma.warehouse.findUnique({ where: { id: warehouseId } });
  if (!before) {
    return NextResponse.json({ message: "Склад олдсонгүй." }, { status: 404 });
  }

  const after = await prisma.warehouse.update({
    where: { id: warehouseId },
    data: { isActive: false },
  });

  await writeAuditLog({
    actorUserId: auth.user.id,
    module: "admin.warehouses",
    action: "delete",
    entityType: "Warehouse",
    entityId: warehouseId,
    beforeData: before,
    afterData: after,
    ipAddress: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({ message: "Склад идэвхгүй боллоо." });
}

