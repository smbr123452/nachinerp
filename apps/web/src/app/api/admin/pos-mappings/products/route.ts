import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/core/db/prisma";
import { requirePermission } from "@/core/auth/rbac";
import { writeAuditLog } from "@/core/audit/audit";

export async function GET() {
  const auth = await requirePermission("pos.mapping.read");
  if (auth instanceof NextResponse) return auth;

  const [codeMappings, nameMappings, products] = await Promise.all([
    prisma.posProductMapping.findMany({ orderBy: { productCode: "asc" }, include: { product: true } }),
    prisma.posProductNameMapping.findMany({ orderBy: { productName: "asc" }, include: { product: true } }),
    prisma.product.findMany({ where: { isActive: true }, orderBy: { nameMn: "asc" } }),
  ]);

  return NextResponse.json({ codeMappings, nameMappings, products });
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission("pos.mapping.write");
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const mappingType = String(body.mappingType ?? "").trim().toUpperCase();
  const productId = String(body.productId ?? "").trim();
  if (!productId) return NextResponse.json({ message: "productId шаардлагатай." }, { status: 400 });

  if (mappingType === "CODE") {
    const productCode = String(body.productCode ?? "").trim();
    if (!productCode) return NextResponse.json({ message: "productCode шаардлагатай." }, { status: 400 });
    const created = await prisma.posProductMapping.create({ data: { productCode, productId, isActive: true } });
    await writeAuditLog({
      actorUserId: auth.user.id,
      module: "pos.mapping.product",
      action: "create_code",
      entityType: "PosProductMapping",
      entityId: created.id,
      afterData: { productCode, productId },
      ipAddress: request.headers.get("x-forwarded-for"),
      userAgent: request.headers.get("user-agent"),
    });
    return NextResponse.json({ message: "POS product code mapping үүслээ." });
  }

  if (mappingType === "NAME") {
    const productName = String(body.productName ?? "").trim();
    if (!productName) return NextResponse.json({ message: "productName шаардлагатай." }, { status: 400 });
    const created = await prisma.posProductNameMapping.create({ data: { productName, productId, isActive: true } });
    await writeAuditLog({
      actorUserId: auth.user.id,
      module: "pos.mapping.product",
      action: "create_name",
      entityType: "PosProductNameMapping",
      entityId: created.id,
      afterData: { productName, productId },
      ipAddress: request.headers.get("x-forwarded-for"),
      userAgent: request.headers.get("user-agent"),
    });
    return NextResponse.json({ message: "POS product name mapping үүслээ." });
  }

  return NextResponse.json({ message: "mappingType буруу байна." }, { status: 400 });
}

export async function PATCH(request: NextRequest) {
  const auth = await requirePermission("pos.mapping.write");
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const mappingType = String(body.mappingType ?? "").trim().toUpperCase();
  const mappingId = String(body.mappingId ?? "").trim();
  if (!mappingId) return NextResponse.json({ message: "mappingId шаардлагатай." }, { status: 400 });

  if (mappingType === "CODE") {
    const before = await prisma.posProductMapping.findUnique({ where: { id: mappingId } });
    if (!before) return NextResponse.json({ message: "Mapping олдсонгүй." }, { status: 404 });
    const after = await prisma.posProductMapping.update({
      where: { id: mappingId },
      data: {
        productCode: body.productCode !== undefined ? String(body.productCode).trim() : undefined,
        productId: body.productId !== undefined ? String(body.productId).trim() : undefined,
        isActive: body.isActive !== undefined ? Boolean(body.isActive) : undefined,
      },
    });
    await writeAuditLog({
      actorUserId: auth.user.id,
      module: "pos.mapping.product",
      action: "update_code",
      entityType: "PosProductMapping",
      entityId: mappingId,
      beforeData: before,
      afterData: after,
      ipAddress: request.headers.get("x-forwarded-for"),
      userAgent: request.headers.get("user-agent"),
    });
    return NextResponse.json({ message: "POS code mapping шинэчлэгдлээ." });
  }

  if (mappingType === "NAME") {
    const before = await prisma.posProductNameMapping.findUnique({ where: { id: mappingId } });
    if (!before) return NextResponse.json({ message: "Mapping олдсонгүй." }, { status: 404 });
    const after = await prisma.posProductNameMapping.update({
      where: { id: mappingId },
      data: {
        productName: body.productName !== undefined ? String(body.productName).trim() : undefined,
        productId: body.productId !== undefined ? String(body.productId).trim() : undefined,
        isActive: body.isActive !== undefined ? Boolean(body.isActive) : undefined,
      },
    });
    await writeAuditLog({
      actorUserId: auth.user.id,
      module: "pos.mapping.product",
      action: "update_name",
      entityType: "PosProductNameMapping",
      entityId: mappingId,
      beforeData: before,
      afterData: after,
      ipAddress: request.headers.get("x-forwarded-for"),
      userAgent: request.headers.get("user-agent"),
    });
    return NextResponse.json({ message: "POS name mapping шинэчлэгдлээ." });
  }

  return NextResponse.json({ message: "mappingType буруу байна." }, { status: 400 });
}

export async function DELETE(request: NextRequest) {
  const auth = await requirePermission("pos.mapping.write");
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const mappingType = String(body.mappingType ?? "").trim().toUpperCase();
  const mappingId = String(body.mappingId ?? "").trim();
  if (!mappingId) return NextResponse.json({ message: "mappingId шаардлагатай." }, { status: 400 });

  if (mappingType === "CODE") {
    const before = await prisma.posProductMapping.findUnique({ where: { id: mappingId } });
    if (!before) return NextResponse.json({ message: "Mapping олдсонгүй." }, { status: 404 });
    await prisma.posProductMapping.delete({ where: { id: mappingId } });
    await writeAuditLog({
      actorUserId: auth.user.id,
      module: "pos.mapping.product",
      action: "delete_code",
      entityType: "PosProductMapping",
      entityId: mappingId,
      beforeData: before,
      ipAddress: request.headers.get("x-forwarded-for"),
      userAgent: request.headers.get("user-agent"),
    });
    return NextResponse.json({ message: "POS code mapping устгагдлаа." });
  }

  if (mappingType === "NAME") {
    const before = await prisma.posProductNameMapping.findUnique({ where: { id: mappingId } });
    if (!before) return NextResponse.json({ message: "Mapping олдсонгүй." }, { status: 404 });
    await prisma.posProductNameMapping.delete({ where: { id: mappingId } });
    await writeAuditLog({
      actorUserId: auth.user.id,
      module: "pos.mapping.product",
      action: "delete_name",
      entityType: "PosProductNameMapping",
      entityId: mappingId,
      beforeData: before,
      ipAddress: request.headers.get("x-forwarded-for"),
      userAgent: request.headers.get("user-agent"),
    });
    return NextResponse.json({ message: "POS name mapping устгагдлаа." });
  }

  return NextResponse.json({ message: "mappingType буруу байна." }, { status: 400 });
}

