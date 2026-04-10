import { NextRequest, NextResponse } from "next/server";
import { ProductType } from "@prisma/client";
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

function asProductType(value: unknown): ProductType | null {
  const v = String(value ?? "").trim().toUpperCase();
  if (v === "RAW_MATERIAL") return ProductType.RAW_MATERIAL;
  if (v === "FINISHED_PRODUCT") return ProductType.FINISHED_PRODUCT;
  return null;
}

export async function GET() {
  const auth = await requirePermission("admin.masterdata.read");
  if (auth instanceof NextResponse) return auth;

  const products = await prisma.product.findMany({
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ products });
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission("admin.masterdata.write");
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const sku = String(body.sku ?? "").trim().toUpperCase();
  const barcode = body.barcode ? String(body.barcode).trim() : null;
  const nameMn = String(body.nameMn ?? "").trim();
  const type = asProductType(body.type);

  if (!sku || !nameMn || !type) {
    return NextResponse.json({ message: "Бүтээгдэхүүний мэдээлэл дутуу байна." }, { status: 400 });
  }

  const exists = await prisma.product.findUnique({ where: { sku } });
  if (exists) {
    return NextResponse.json({ message: "SKU давхцаж байна." }, { status: 409 });
  }

  const created = await prisma.product.create({
    data: {
      sku,
      barcode,
      nameMn,
      type,
      isActive: true,
    },
  });

  await writeAuditLog({
    actorUserId: auth.user.id,
    module: "admin.products",
    action: "create",
    entityType: "Product",
    entityId: created.id,
    afterData: created,
    ipAddress: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({ message: "Бүтээгдэхүүн амжилттай үүслээ." });
}

export async function PATCH(request: NextRequest) {
  const auth = await requirePermission("admin.masterdata.write");
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const productId = String(body.productId ?? "").trim();
  const sku = body.sku !== undefined ? String(body.sku).trim().toUpperCase() : undefined;
  const barcode = body.barcode !== undefined ? String(body.barcode).trim() : undefined;
  const nameMn = body.nameMn !== undefined ? String(body.nameMn).trim() : undefined;
  const type = body.type !== undefined ? asProductType(body.type) : undefined;
  const isActive = asBoolean(body.isActive);

  if (!productId) {
    return NextResponse.json({ message: "productId шаардлагатай." }, { status: 400 });
  }

  const before = await prisma.product.findUnique({ where: { id: productId } });
  if (!before) {
    return NextResponse.json({ message: "Бүтээгдэхүүн олдсонгүй." }, { status: 404 });
  }

  const after = await prisma.product.update({
    where: { id: productId },
    data: {
      sku: sku && sku.length > 0 ? sku : undefined,
      barcode: barcode ?? undefined,
      nameMn: nameMn && nameMn.length > 0 ? nameMn : undefined,
      type: type ?? undefined,
      isActive: isActive ?? undefined,
    },
  });

  await writeAuditLog({
    actorUserId: auth.user.id,
    module: "admin.products",
    action: "update",
    entityType: "Product",
    entityId: productId,
    beforeData: before,
    afterData: after,
    ipAddress: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({ message: "Бүтээгдэхүүн шинэчлэгдлээ." });
}

export async function DELETE(request: NextRequest) {
  const auth = await requirePermission("admin.masterdata.write");
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const productId = String(body.productId ?? "").trim();
  if (!productId) {
    return NextResponse.json({ message: "productId шаардлагатай." }, { status: 400 });
  }

  const before = await prisma.product.findUnique({ where: { id: productId } });
  if (!before) {
    return NextResponse.json({ message: "Бүтээгдэхүүн олдсонгүй." }, { status: 404 });
  }

  const after = await prisma.product.update({
    where: { id: productId },
    data: { isActive: false },
  });

  await writeAuditLog({
    actorUserId: auth.user.id,
    module: "admin.products",
    action: "delete",
    entityType: "Product",
    entityId: productId,
    beforeData: before,
    afterData: after,
    ipAddress: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({ message: "Бүтээгдэхүүн идэвхгүй боллоо." });
}

