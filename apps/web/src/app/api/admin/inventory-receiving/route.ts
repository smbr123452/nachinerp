import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/core/db/prisma";
import { requirePermission } from "@/core/auth/rbac";
import { writeAuditLog } from "@/core/audit/audit";
import { addStockLedgerAndUpdateBalance } from "@/core/inventory/stock";

type ReceivingItemInput = { productId: string; qty: number };

export async function GET() {
  const auth = await requirePermission("inventory.ledger.read");
  if (auth instanceof NextResponse) return auth;

  const [receivings, warehouses, products] = await Promise.all([
    prisma.stockReceivingHeader.findMany({
      orderBy: { receivedAt: "desc" },
      include: { warehouse: true, items: { include: { product: true } } },
      take: 100,
    }),
    prisma.warehouse.findMany({ where: { isActive: true }, orderBy: { nameMn: "asc" }, include: { branch: true } }),
    prisma.product.findMany({ where: { isActive: true }, orderBy: { nameMn: "asc" } }),
  ]);

  return NextResponse.json({ receivings, warehouses, products });
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission("inventory.receiving.create");
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const warehouseId = String(body.warehouseId ?? "").trim();
  const note = body.note ? String(body.note).trim() : null;
  const items = (Array.isArray(body.items) ? body.items : []) as ReceivingItemInput[];

  if (!warehouseId || items.length === 0) {
    return NextResponse.json({ message: "Орлогын мэдээлэл дутуу байна." }, { status: 400 });
  }

  for (const item of items) {
    if (!item.productId || Number(item.qty) <= 0) {
      return NextResponse.json({ message: "Орлогын мөр буруу байна." }, { status: 400 });
    }
  }

  const warehouse = await prisma.warehouse.findUnique({ where: { id: warehouseId } });
  if (!warehouse) {
    return NextResponse.json({ message: "Склад олдсонгүй." }, { status: 404 });
  }

  const receiveNo = `RCV-${Date.now()}`;

  const created = await prisma.$transaction(async (tx) => {
    const header = await tx.stockReceivingHeader.create({
      data: {
        receiveNo,
        warehouseId,
        note,
        createdById: auth.user.id,
      },
    });

    for (const item of items) {
      await tx.stockReceivingItem.create({
        data: {
          receivingId: header.id,
          productId: item.productId,
          qty: item.qty,
        },
      });

      await addStockLedgerAndUpdateBalance(tx, {
        txnType: "RECEIVING_IN",
        warehouseId,
        branchId: warehouse.branchId,
        productId: item.productId,
        qtyIn: Number(item.qty),
        qtyOut: 0,
        refType: "RECEIVING",
        refId: header.id,
        note,
        createdById: auth.user.id,
      });
    }

    return header;
  });

  await writeAuditLog({
    actorUserId: auth.user.id,
    module: "inventory.receiving",
    action: "create",
    entityType: "StockReceivingHeader",
    entityId: created.id,
    afterData: { warehouseId, note, items },
    ipAddress: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({ message: "Орлого амжилттай бүртгэгдлээ." });
}

