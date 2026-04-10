import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/core/db/prisma";
import { requirePermission } from "@/core/auth/rbac";
import { writeAuditLog } from "@/core/audit/audit";

type RecipeItemInput = { materialProductId: string; qtyPerUnit: number };

export async function GET() {
  const auth = await requirePermission("production.recipe.read");
  if (auth instanceof NextResponse) return auth;

  const [recipes, products] = await Promise.all([
    prisma.recipe.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        finishedProduct: true,
        items: { include: { materialProduct: true } },
      },
    }),
    prisma.product.findMany({ where: { isActive: true }, orderBy: { nameMn: "asc" } }),
  ]);

  return NextResponse.json({ recipes, products });
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission("production.recipe.write");
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const code = String(body.code ?? "").trim().toUpperCase();
  const nameMn = String(body.nameMn ?? "").trim();
  const finishedProductId = String(body.finishedProductId ?? "").trim();
  const items = (Array.isArray(body.items) ? body.items : []) as RecipeItemInput[];

  if (!code || !nameMn || !finishedProductId || items.length === 0) {
    return NextResponse.json({ message: "Жорын мэдээлэл дутуу байна." }, { status: 400 });
  }

  for (const item of items) {
    if (!item.materialProductId || Number(item.qtyPerUnit) <= 0) {
      return NextResponse.json({ message: "Жорын мөр буруу байна." }, { status: 400 });
    }
  }

  const exists = await prisma.recipe.findUnique({ where: { code } });
  if (exists) {
    return NextResponse.json({ message: "Жорын код давхцаж байна." }, { status: 409 });
  }

  const recipe = await prisma.$transaction(async (tx) => {
    const header = await tx.recipe.create({
      data: {
        code,
        nameMn,
        finishedProductId,
        createdById: auth.user.id,
      },
    });
    await tx.recipeItem.createMany({
      data: items.map((x) => ({
        recipeId: header.id,
        materialProductId: x.materialProductId,
        qtyPerUnit: x.qtyPerUnit,
      })),
    });
    return header;
  });

  await writeAuditLog({
    actorUserId: auth.user.id,
    module: "production.recipe",
    action: "create",
    entityType: "Recipe",
    entityId: recipe.id,
    afterData: { code, nameMn, finishedProductId, items },
    ipAddress: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({ message: "Жор амжилттай үүслээ." });
}

export async function PATCH(request: NextRequest) {
  const auth = await requirePermission("production.recipe.write");
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const recipeId = String(body.recipeId ?? "").trim();
  const nameMn = body.nameMn !== undefined ? String(body.nameMn).trim() : undefined;
  const isActive = body.isActive !== undefined ? Boolean(body.isActive) : undefined;
  const items = Array.isArray(body.items) ? (body.items as RecipeItemInput[]) : undefined;

  if (!recipeId) {
    return NextResponse.json({ message: "recipeId шаардлагатай." }, { status: 400 });
  }

  const before = await prisma.recipe.findUnique({
    where: { id: recipeId },
    include: { items: true },
  });
  if (!before) return NextResponse.json({ message: "Жор олдсонгүй." }, { status: 404 });

  await prisma.$transaction(async (tx) => {
    await tx.recipe.update({
      where: { id: recipeId },
      data: {
        nameMn: nameMn && nameMn.length > 0 ? nameMn : undefined,
        isActive: isActive ?? undefined,
      },
    });
    if (items) {
      await tx.recipeItem.deleteMany({ where: { recipeId } });
      if (items.length > 0) {
        await tx.recipeItem.createMany({
          data: items.map((x) => ({
            recipeId,
            materialProductId: x.materialProductId,
            qtyPerUnit: x.qtyPerUnit,
          })),
        });
      }
    }
  });

  await writeAuditLog({
    actorUserId: auth.user.id,
    module: "production.recipe",
    action: "update",
    entityType: "Recipe",
    entityId: recipeId,
    beforeData: {
      nameMn: before.nameMn,
      isActive: before.isActive,
      items: before.items.map((x) => ({ materialProductId: x.materialProductId, qtyPerUnit: x.qtyPerUnit })),
    },
    afterData: { nameMn, isActive, items },
    ipAddress: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({ message: "Жор шинэчлэгдлээ." });
}

