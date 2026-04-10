import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/core/db/prisma";
import { requirePermission } from "@/core/auth/rbac";
import { writeAuditLog } from "@/core/audit/audit";

export async function GET() {
  const auth = await requirePermission("pos.mapping.read");
  if (auth instanceof NextResponse) return auth;

  const [mappings, branches, warehouses] = await Promise.all([
    prisma.posBranchMapping.findMany({
      orderBy: { posBranchName: "asc" },
      include: { branch: true, warehouse: true },
    }),
    prisma.branch.findMany({ where: { isActive: true }, orderBy: { nameMn: "asc" } }),
    prisma.warehouse.findMany({ where: { isActive: true }, orderBy: { nameMn: "asc" }, include: { branch: true } }),
  ]);

  return NextResponse.json({ mappings, branches, warehouses });
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission("pos.mapping.write");
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const posBranchName = String(body.posBranchName ?? "").trim();
  const branchId = String(body.branchId ?? "").trim();
  const warehouseId = String(body.warehouseId ?? "").trim();
  if (!posBranchName || !branchId || !warehouseId) {
    return NextResponse.json({ message: "posBranchName, branchId, warehouseId шаардлагатай." }, { status: 400 });
  }

  const created = await prisma.posBranchMapping.create({
    data: { posBranchName, branchId, warehouseId, isActive: true },
  });

  await writeAuditLog({
    actorUserId: auth.user.id,
    module: "pos.mapping.branch",
    action: "create",
    entityType: "PosBranchMapping",
    entityId: created.id,
    afterData: { posBranchName, branchId, warehouseId },
    ipAddress: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({ message: "POS branch mapping үүслээ." });
}

export async function PATCH(request: NextRequest) {
  const auth = await requirePermission("pos.mapping.write");
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const mappingId = String(body.mappingId ?? "").trim();
  if (!mappingId) return NextResponse.json({ message: "mappingId шаардлагатай." }, { status: 400 });

  const before = await prisma.posBranchMapping.findUnique({ where: { id: mappingId } });
  if (!before) return NextResponse.json({ message: "Mapping олдсонгүй." }, { status: 404 });

  const after = await prisma.posBranchMapping.update({
    where: { id: mappingId },
    data: {
      posBranchName: body.posBranchName !== undefined ? String(body.posBranchName).trim() : undefined,
      branchId: body.branchId !== undefined ? String(body.branchId).trim() : undefined,
      warehouseId: body.warehouseId !== undefined ? String(body.warehouseId).trim() : undefined,
      isActive: body.isActive !== undefined ? Boolean(body.isActive) : undefined,
    },
  });

  await writeAuditLog({
    actorUserId: auth.user.id,
    module: "pos.mapping.branch",
    action: "update",
    entityType: "PosBranchMapping",
    entityId: mappingId,
    beforeData: before,
    afterData: after,
    ipAddress: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  });
  return NextResponse.json({ message: "POS branch mapping шинэчлэгдлээ." });
}

export async function DELETE(request: NextRequest) {
  const auth = await requirePermission("pos.mapping.write");
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const mappingId = String(body.mappingId ?? "").trim();
  if (!mappingId) return NextResponse.json({ message: "mappingId шаардлагатай." }, { status: 400 });
  const before = await prisma.posBranchMapping.findUnique({ where: { id: mappingId } });
  if (!before) return NextResponse.json({ message: "Mapping олдсонгүй." }, { status: 404 });

  await prisma.posBranchMapping.delete({ where: { id: mappingId } });
  await writeAuditLog({
    actorUserId: auth.user.id,
    module: "pos.mapping.branch",
    action: "delete",
    entityType: "PosBranchMapping",
    entityId: mappingId,
    beforeData: before,
    ipAddress: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  });
  return NextResponse.json({ message: "POS branch mapping устгагдлаа." });
}

