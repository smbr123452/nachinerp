import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/core/db/prisma";
import { requirePermission } from "@/core/auth/rbac";
import { writeAuditLog } from "@/core/audit/audit";
import { addStockLedgerAndUpdateBalance } from "@/core/inventory/stock";

export async function GET() {
  const auth = await requirePermission("production.order.read");
  if (auth instanceof NextResponse) return auth;

  const [orders, recipes, warehouses] = await Promise.all([
    prisma.productionOrder.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        recipe: { include: { finishedProduct: true, items: { include: { materialProduct: true } } } },
        sourceWarehouse: { include: { branch: true } },
        outputWarehouse: { include: { branch: true } },
      },
      take: 100,
    }),
    prisma.recipe.findMany({
      where: { isActive: true },
      orderBy: { nameMn: "asc" },
      include: { finishedProduct: true, items: { include: { materialProduct: true } } },
    }),
    prisma.warehouse.findMany({ where: { isActive: true }, orderBy: { nameMn: "asc" }, include: { branch: true } }),
  ]);

  return NextResponse.json({ orders, recipes, warehouses });
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission("production.order.create");
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const recipeId = String(body.recipeId ?? "").trim();
  const sourceWarehouseId = String(body.sourceWarehouseId ?? "").trim();
  const outputWarehouseId = String(body.outputWarehouseId ?? "").trim();
  const plannedQty = Number(body.plannedQty ?? 0);
  const note = body.note ? String(body.note).trim() : null;

  if (!recipeId || !sourceWarehouseId || !outputWarehouseId || plannedQty <= 0) {
    return NextResponse.json({ message: "Үйлдвэрлэлийн захиалгын мэдээлэл дутуу байна." }, { status: 400 });
  }

  const recipe = await prisma.recipe.findUnique({ where: { id: recipeId } });
  if (!recipe || !recipe.isActive) {
    return NextResponse.json({ message: "Жор олдсонгүй эсвэл идэвхгүй байна." }, { status: 404 });
  }

  const orderNo = `PROD-${Date.now()}`;
  const created = await prisma.productionOrder.create({
    data: {
      orderNo,
      recipeId,
      finishedProductId: recipe.finishedProductId,
      sourceWarehouseId,
      outputWarehouseId,
      plannedQty,
      note,
      createdById: auth.user.id,
    },
  });

  await writeAuditLog({
    actorUserId: auth.user.id,
    module: "production.order",
    action: "create",
    entityType: "ProductionOrder",
    entityId: created.id,
    afterData: { recipeId, sourceWarehouseId, outputWarehouseId, plannedQty, note },
    ipAddress: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({ message: "Үйлдвэрлэлийн захиалга үүслээ." });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const orderId = String(body.orderId ?? "").trim();
  const action = String(body.action ?? "").trim();

  if (!orderId || !action) {
    return NextResponse.json({ message: "orderId болон action шаардлагатай." }, { status: 400 });
  }

  const order = await prisma.productionOrder.findUnique({
    where: { id: orderId },
    include: {
      recipe: { include: { items: true } },
      sourceWarehouse: true,
      outputWarehouse: true,
    },
  });
  if (!order) return NextResponse.json({ message: "Захиалга олдсонгүй." }, { status: 404 });

  if (action === "approve") {
    const auth = await requirePermission("production.order.approve");
    if (auth instanceof NextResponse) return auth;
    if (order.status !== "DRAFT") {
      return NextResponse.json({ message: "Зөвхөн DRAFT захиалга батлагдана." }, { status: 400 });
    }
    await prisma.productionOrder.update({
      where: { id: order.id },
      data: { status: "APPROVED", approvedById: auth.user.id, approvedAt: new Date() },
    });
    await writeAuditLog({
      actorUserId: auth.user.id,
      module: "production.order",
      action: "approve",
      entityType: "ProductionOrder",
      entityId: order.id,
      beforeData: { status: order.status },
      afterData: { status: "APPROVED" },
      ipAddress: request.headers.get("x-forwarded-for"),
      userAgent: request.headers.get("user-agent"),
    });
    return NextResponse.json({ message: "Захиалга батлагдлаа." });
  }

  if (action === "execute") {
    const auth = await requirePermission("production.order.execute");
    if (auth instanceof NextResponse) return auth;
    if (order.status !== "APPROVED") {
      return NextResponse.json({ message: "Зөвхөн APPROVED захиалга гүйцэтгэнэ." }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      for (const item of order.recipe.items) {
        const consumeQty = Number(item.qtyPerUnit) * Number(order.plannedQty);
        await addStockLedgerAndUpdateBalance(tx, {
          txnType: "PRODUCTION_CONSUME",
          warehouseId: order.sourceWarehouseId,
          branchId: order.sourceWarehouse.branchId,
          productId: item.materialProductId,
          qtyIn: 0,
          qtyOut: consumeQty,
          refType: "PRODUCTION_ORDER",
          refId: order.id,
          note: order.note,
          createdById: auth.user.id,
        });
      }

      await addStockLedgerAndUpdateBalance(tx, {
        txnType: "PRODUCTION_OUTPUT",
        warehouseId: order.outputWarehouseId,
        branchId: order.outputWarehouse.branchId,
        productId: order.finishedProductId,
        qtyIn: Number(order.plannedQty),
        qtyOut: 0,
        refType: "PRODUCTION_ORDER",
        refId: order.id,
        note: order.note,
        createdById: auth.user.id,
      });

      await tx.productionOrder.update({
        where: { id: order.id },
        data: {
          status: "EXECUTED",
          executedById: auth.user.id,
          executedAt: new Date(),
        },
      });
    });

    await writeAuditLog({
      actorUserId: auth.user.id,
      module: "production.order",
      action: "execute",
      entityType: "ProductionOrder",
      entityId: order.id,
      beforeData: { status: order.status, plannedQty: order.plannedQty },
      afterData: { status: "EXECUTED" },
      ipAddress: request.headers.get("x-forwarded-for"),
      userAgent: request.headers.get("user-agent"),
    });
    return NextResponse.json({ message: "Үйлдвэрлэл амжилттай гүйцэтгэлээ." });
  }

  return NextResponse.json({ message: "action буруу байна." }, { status: 400 });
}

