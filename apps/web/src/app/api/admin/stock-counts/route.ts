import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/core/db/prisma";
import { requirePermission } from "@/core/auth/rbac";
import { writeAuditLog } from "@/core/audit/audit";

type CountItemInput = {
  productId: string;
  countedQty: number;
};

export async function GET() {
  const auth = await requirePermission("inventory.adjustment.read");
  if (auth instanceof NextResponse) return auth;

  const [counts, warehouses, products] = await Promise.all([
    prisma.stockCountHeader.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        warehouse: { include: { branch: true } },
        items: { include: { product: true } },
      },
      take: 100,
    }),
    prisma.warehouse.findMany({
      where: { isActive: true },
      orderBy: { nameMn: "asc" },
      include: { branch: true },
    }),
    prisma.product.findMany({
      where: { isActive: true },
      orderBy: { nameMn: "asc" },
    }),
  ]);

  return NextResponse.json({ counts, warehouses, products });
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission("inventory.count.create");
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const warehouseId = String(body.warehouseId ?? "").trim();
  const note = body.note ? String(body.note).trim() : null;
  const items = (Array.isArray(body.items) ? body.items : []) as CountItemInput[];

  if (!warehouseId) {
    return NextResponse.json({ message: "Склад сонгоно уу." }, { status: 400 });
  }
  if (items.length === 0) {
    return NextResponse.json({ message: "Дор хаяж нэг тооллогын мөр оруулна уу." }, { status: 400 });
  }
  for (const item of items) {
    if (!item.productId || Number(item.countedQty) < 0) {
      return NextResponse.json({ message: "Тооллогын мөр буруу байна." }, { status: 400 });
    }
  }

  const countNo = `CNT-${Date.now()}`;
  const created = await prisma.$transaction(async (tx) => {
    const header = await tx.stockCountHeader.create({
      data: {
        countNo,
        warehouseId,
        note,
        createdById: auth.user.id,
      },
    });

    for (const item of items) {
      await tx.stockCountItem.create({
        data: {
          stockCountId: header.id,
          productId: item.productId,
          countedQty: new Prisma.Decimal(item.countedQty),
          systemQty: new Prisma.Decimal(0),
          varianceQty: new Prisma.Decimal(0),
        },
      });
    }
    return header;
  });

  await writeAuditLog({
    actorUserId: auth.user.id,
    module: "inventory.count",
    action: "create",
    entityType: "StockCountHeader",
    entityId: created.id,
    afterData: { warehouseId, note, items },
    ipAddress: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({ message: "Тооллого амжилттай үүслээ." });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const countId = String(body.countId ?? "").trim();
  const action = String(body.action ?? "").trim();

  if (!countId || !action) {
    return NextResponse.json({ message: "countId болон action шаардлагатай." }, { status: 400 });
  }

  const count = await prisma.stockCountHeader.findUnique({
    where: { id: countId },
    include: { items: true, warehouse: true },
  });
  if (!count) {
    return NextResponse.json({ message: "Тооллого олдсонгүй." }, { status: 404 });
  }

  if (action === "save_items") {
    const auth = await requirePermission("inventory.count.create");
    if (auth instanceof NextResponse) return auth;
    if (count.status !== "DRAFT") {
      return NextResponse.json({ message: "Зөвхөн DRAFT тооллогод мөр засна." }, { status: 400 });
    }
    const items = (Array.isArray(body.items) ? body.items : []) as CountItemInput[];
    if (items.length === 0) {
      return NextResponse.json({ message: "Хоосон мөр хадгалах боломжгүй." }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.stockCountItem.deleteMany({ where: { stockCountId: count.id } });
      for (const item of items) {
        if (!item.productId || Number(item.countedQty) < 0) {
          throw new Error("INVALID_ITEM");
        }
        await tx.stockCountItem.create({
          data: {
            stockCountId: count.id,
            productId: item.productId,
            countedQty: new Prisma.Decimal(item.countedQty),
            systemQty: new Prisma.Decimal(0),
            varianceQty: new Prisma.Decimal(0),
          },
        });
      }
    });

    return NextResponse.json({ message: "Тооллогын мөр хадгалагдлаа." });
  }

  if (action === "submit") {
    const auth = await requirePermission("inventory.count.submit");
    if (auth instanceof NextResponse) return auth;
    if (count.status !== "DRAFT") {
      return NextResponse.json({ message: "Зөвхөн DRAFT тооллого илгээнэ." }, { status: 400 });
    }

    const after = await prisma.stockCountHeader.update({
      where: { id: count.id },
      data: {
        status: "SUBMITTED",
        submittedAt: new Date(),
      },
    });

    await writeAuditLog({
      actorUserId: auth.user.id,
      module: "inventory.count",
      action: "submit",
      entityType: "StockCountHeader",
      entityId: count.id,
      beforeData: { status: count.status },
      afterData: { status: after.status },
      ipAddress: request.headers.get("x-forwarded-for"),
      userAgent: request.headers.get("user-agent"),
    });

    return NextResponse.json({ message: "Тооллого батлуулахад илгээгдлээ." });
  }

  if (action === "approve") {
    const auth = await requirePermission("inventory.count.approve");
    if (auth instanceof NextResponse) return auth;
    if (count.status !== "SUBMITTED") {
      return NextResponse.json({ message: "Зөвхөн SUBMITTED тооллого батлагдана." }, { status: 400 });
    }

    const adjustmentNo = `ADJ-${Date.now()}`;
    const approved = await prisma.$transaction(async (tx) => {
      const latestItems = await tx.stockCountItem.findMany({
        where: { stockCountId: count.id },
      });
      const productIds = latestItems.map((i) => i.productId);
      const balances = await tx.stockBalance.findMany({
        where: { warehouseId: count.warehouseId, productId: { in: productIds } },
      });
      const systemMap = new Map(balances.map((b) => [b.productId, Number(b.qty)]));

      const adjustedItems: Array<{
        productId: string;
        systemQty: number;
        countedQty: number;
        varianceQty: number;
      }> = [];

      for (const item of latestItems) {
        const systemQty = systemMap.get(item.productId) ?? 0;
        const countedQty = Number(item.countedQty);
        const varianceQty = countedQty - systemQty;

        await tx.stockCountItem.update({
          where: { id: item.id },
          data: {
            systemQty: new Prisma.Decimal(systemQty),
            varianceQty: new Prisma.Decimal(varianceQty),
          },
        });

        if (varianceQty !== 0) {
          adjustedItems.push({ productId: item.productId, systemQty, countedQty, varianceQty });
        }
      }

      const countAfter = await tx.stockCountHeader.update({
        where: { id: count.id },
        data: {
          status: "APPROVED",
          approvedById: auth.user.id,
          approvedAt: new Date(),
        },
      });

      if (adjustedItems.length > 0) {
        const adjHeader = await tx.stockAdjustmentHeader.create({
          data: {
            adjustmentNo,
            warehouseId: count.warehouseId,
            stockCountId: count.id,
            status: "PENDING_APPROVAL",
            note: `Count: ${count.countNo}`,
            createdById: auth.user.id,
          },
        });
        await tx.stockAdjustmentItem.createMany({
          data: adjustedItems.map((x) => ({
            stockAdjustmentId: adjHeader.id,
            productId: x.productId,
            systemQty: new Prisma.Decimal(x.systemQty),
            countedQty: new Prisma.Decimal(x.countedQty),
            varianceQty: new Prisma.Decimal(x.varianceQty),
          })),
        });
      }

      return countAfter;
    });

    await writeAuditLog({
      actorUserId: auth.user.id,
      module: "inventory.count",
      action: "approve",
      entityType: "StockCountHeader",
      entityId: count.id,
      beforeData: { status: count.status },
      afterData: { status: approved.status },
      ipAddress: request.headers.get("x-forwarded-for"),
      userAgent: request.headers.get("user-agent"),
    });

    return NextResponse.json({ message: "Тооллого батлагдлаа, тохируулга үүслээ." });
  }

  return NextResponse.json({ message: "action буруу байна." }, { status: 400 });
}

