import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/core/db/prisma";
import { requirePermission } from "@/core/auth/rbac";
import { writeAuditLog } from "@/core/audit/audit";
import { addStockLedgerAndUpdateBalance } from "@/core/inventory/stock";

export async function GET() {
  const auth = await requirePermission("inventory.adjustment.read");
  if (auth instanceof NextResponse) return auth;

  const adjustments = await prisma.stockAdjustmentHeader.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      warehouse: { include: { branch: true } },
      items: { include: { product: true } },
      stockCount: true,
    },
    take: 100,
  });

  return NextResponse.json({ adjustments });
}

export async function PATCH(request: NextRequest) {
  const auth = await requirePermission("inventory.adjustment.approve");
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const adjustmentId = String(body.adjustmentId ?? "").trim();
  const action = String(body.action ?? "").trim();

  if (!adjustmentId || action !== "approve") {
    return NextResponse.json({ message: "adjustmentId болон зөв action шаардлагатай." }, { status: 400 });
  }

  const adjustment = await prisma.stockAdjustmentHeader.findUnique({
    where: { id: adjustmentId },
    include: {
      warehouse: true,
      items: true,
    },
  });
  if (!adjustment) {
    return NextResponse.json({ message: "Тохируулга олдсонгүй." }, { status: 404 });
  }
  if (adjustment.status !== "PENDING_APPROVAL") {
    return NextResponse.json({ message: "Зөвхөн PENDING_APPROVAL тохируулга батлагдана." }, { status: 400 });
  }

  await prisma.$transaction(async (tx) => {
    for (const item of adjustment.items) {
      const variance = Number(item.varianceQty);
      if (variance === 0) continue;
      if (variance > 0) {
        await addStockLedgerAndUpdateBalance(tx, {
          txnType: "ADJUSTMENT_IN",
          warehouseId: adjustment.warehouseId,
          branchId: adjustment.warehouse.branchId,
          productId: item.productId,
          qtyIn: variance,
          qtyOut: 0,
          refType: "ADJUSTMENT",
          refId: adjustment.id,
          note: adjustment.note,
          createdById: auth.user.id,
        });
      } else {
        await addStockLedgerAndUpdateBalance(tx, {
          txnType: "ADJUSTMENT_OUT",
          warehouseId: adjustment.warehouseId,
          branchId: adjustment.warehouse.branchId,
          productId: item.productId,
          qtyIn: 0,
          qtyOut: Math.abs(variance),
          refType: "ADJUSTMENT",
          refId: adjustment.id,
          note: adjustment.note,
          createdById: auth.user.id,
        });
      }
    }

    await tx.stockAdjustmentHeader.update({
      where: { id: adjustment.id },
      data: {
        status: "APPROVED",
        approvedById: auth.user.id,
        approvedAt: new Date(),
      },
    });
  });

  await writeAuditLog({
    actorUserId: auth.user.id,
    module: "inventory.adjustment",
    action: "approve",
    entityType: "StockAdjustmentHeader",
    entityId: adjustment.id,
    beforeData: { status: adjustment.status },
    afterData: { status: "APPROVED" },
    ipAddress: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({ message: "Тохируулга батлагдаж, ledger-д бичигдлээ." });
}

