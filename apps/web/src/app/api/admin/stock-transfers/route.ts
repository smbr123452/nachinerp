import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/core/db/prisma";
import { getCurrentAuthContext, hasPermission, requirePermission } from "@/core/auth/rbac";
import { writeAuditLog } from "@/core/audit/audit";
import { addStockLedgerAndUpdateBalance } from "@/core/inventory/stock";

type TransferItemInput = { productId: string; qty: number };

export async function GET() {
  const auth = await getCurrentAuthContext();
  if (!auth) {
    return NextResponse.json({ message: "Нэвтрэх шаардлагатай." }, { status: 401 });
  }
  const canRead =
    hasPermission(auth, "inventory.ledger.read") ||
    hasPermission(auth, "inventory.transfer.create") ||
    hasPermission(auth, "inventory.transfer.approve") ||
    hasPermission(auth, "inventory.transfer.receive");
  if (!canRead) {
    return NextResponse.json({ message: "Шилжүүлэг харах эрх хүрэхгүй байна." }, { status: 403 });
  }

  const [transfers, warehouses, products] = await Promise.all([
    prisma.stockTransferHeader.findMany({
      orderBy: { requestedAt: "desc" },
      include: {
        fromWarehouse: { include: { branch: true } },
        toWarehouse: { include: { branch: true } },
        items: { include: { product: true } },
      },
      take: 100,
    }),
    prisma.warehouse.findMany({ where: { isActive: true }, orderBy: { nameMn: "asc" }, include: { branch: true } }),
    prisma.product.findMany({ where: { isActive: true }, orderBy: { nameMn: "asc" } }),
  ]);

  return NextResponse.json({ transfers, warehouses, products });
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission("inventory.transfer.create");
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const fromWarehouseId = String(body.fromWarehouseId ?? "").trim();
  const toWarehouseId = String(body.toWarehouseId ?? "").trim();
  const note = body.note ? String(body.note).trim() : null;
  const items = (Array.isArray(body.items) ? body.items : []) as TransferItemInput[];

  if (!fromWarehouseId || !toWarehouseId || items.length === 0) {
    return NextResponse.json({ message: "Шилжүүлгийн мэдээлэл дутуу байна." }, { status: 400 });
  }
  if (fromWarehouseId === toWarehouseId) {
    return NextResponse.json({ message: "Эхлэл ба очих склад адил байж болохгүй." }, { status: 400 });
  }

  for (const item of items) {
    if (!item.productId || Number(item.qty) <= 0) {
      return NextResponse.json({ message: "Шилжүүлгийн мөр буруу байна." }, { status: 400 });
    }
  }

  const transferNo = `TRF-${Date.now()}`;
  const created = await prisma.$transaction(async (tx) => {
    const header = await tx.stockTransferHeader.create({
      data: {
        transferNo,
        fromWarehouseId,
        toWarehouseId,
        note,
        requestedById: auth.user.id,
      },
    });
    for (const item of items) {
      await tx.stockTransferItem.create({
        data: {
          transferId: header.id,
          productId: item.productId,
          qty: item.qty,
        },
      });
    }
    return header;
  });

  await writeAuditLog({
    actorUserId: auth.user.id,
    module: "inventory.transfer",
    action: "create",
    entityType: "StockTransferHeader",
    entityId: created.id,
    afterData: { fromWarehouseId, toWarehouseId, note, items, status: "DRAFT" },
    ipAddress: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({ message: "Шилжүүлэг амжилттай үүслээ." });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const transferId = String(body.transferId ?? "").trim();
  const action = String(body.action ?? "").trim();

  if (!transferId || !action) {
    return NextResponse.json({ message: "transferId болон action шаардлагатай." }, { status: 400 });
  }

  const transfer = await prisma.stockTransferHeader.findUnique({
    where: { id: transferId },
    include: { items: true, fromWarehouse: true, toWarehouse: true },
  });
  if (!transfer) {
    return NextResponse.json({ message: "Шилжүүлэг олдсонгүй." }, { status: 404 });
  }

  if (action === "approve") {
    const auth = await requirePermission("inventory.transfer.approve");
    if (auth instanceof NextResponse) return auth;
    if (transfer.status !== "DRAFT") {
      return NextResponse.json({ message: "Зөвхөн DRAFT төлөвтэй шилжүүлгийг батална." }, { status: 400 });
    }

    const before = transfer;
    const after = await prisma.stockTransferHeader.update({
      where: { id: transferId },
      data: {
        status: "APPROVED",
        approvedById: auth.user.id,
        approvedAt: new Date(),
      },
    });

    await writeAuditLog({
      actorUserId: auth.user.id,
      module: "inventory.transfer",
      action: "approve",
      entityType: "StockTransferHeader",
      entityId: transferId,
      beforeData: { status: before.status },
      afterData: { status: after.status },
      ipAddress: request.headers.get("x-forwarded-for"),
      userAgent: request.headers.get("user-agent"),
    });

    return NextResponse.json({ message: "Шилжүүлэг батлагдлаа." });
  }

  if (action === "receive") {
    const auth = await requirePermission("inventory.transfer.receive");
    if (auth instanceof NextResponse) return auth;
    if (transfer.status !== "APPROVED") {
      return NextResponse.json({ message: "Зөвхөн APPROVED төлөвтэй шилжүүлгийг хүлээн авна." }, { status: 400 });
    }

    const before = transfer;
    await prisma.$transaction(async (tx) => {
      for (const item of transfer.items) {
        await addStockLedgerAndUpdateBalance(tx, {
          txnType: "TRANSFER_OUT",
          warehouseId: transfer.fromWarehouseId,
          branchId: transfer.fromWarehouse.branchId,
          productId: item.productId,
          qtyIn: 0,
          qtyOut: Number(item.qty),
          refType: "TRANSFER",
          refId: transfer.id,
          note: transfer.note,
          createdById: auth.user.id,
        });

        await addStockLedgerAndUpdateBalance(tx, {
          txnType: "TRANSFER_IN",
          warehouseId: transfer.toWarehouseId,
          branchId: transfer.toWarehouse.branchId,
          productId: item.productId,
          qtyIn: Number(item.qty),
          qtyOut: 0,
          refType: "TRANSFER",
          refId: transfer.id,
          note: transfer.note,
          createdById: auth.user.id,
        });
      }

      await tx.stockTransferHeader.update({
        where: { id: transfer.id },
        data: {
          status: "RECEIVED",
          receivedById: auth.user.id,
          receivedAt: new Date(),
        },
      });
    });

    await writeAuditLog({
      actorUserId: auth.user.id,
      module: "inventory.transfer",
      action: "receive",
      entityType: "StockTransferHeader",
      entityId: transfer.id,
      beforeData: { status: before.status },
      afterData: { status: "RECEIVED" },
      ipAddress: request.headers.get("x-forwarded-for"),
      userAgent: request.headers.get("user-agent"),
    });

    return NextResponse.json({ message: "Шилжүүлэг хүлээн авалт амжилттай." });
  }

  return NextResponse.json({ message: "action буруу байна." }, { status: 400 });
}

