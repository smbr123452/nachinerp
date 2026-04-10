import { Prisma, StockTxnType } from "@prisma/client";

type StockLedgerInput = {
  txnType: StockTxnType;
  warehouseId: string;
  branchId: string;
  productId: string;
  qtyIn: number;
  qtyOut: number;
  refType: string;
  refId: string;
  note?: string | null;
  createdById: string;
};

export async function addStockLedgerAndUpdateBalance(tx: Prisma.TransactionClient, input: StockLedgerInput) {
  await tx.stockLedger.create({
    data: {
      txnType: input.txnType,
      warehouseId: input.warehouseId,
      branchId: input.branchId,
      productId: input.productId,
      qtyIn: new Prisma.Decimal(input.qtyIn),
      qtyOut: new Prisma.Decimal(input.qtyOut),
      refType: input.refType,
      refId: input.refId,
      note: input.note ?? null,
      createdById: input.createdById,
    },
  });

  const delta = input.qtyIn - input.qtyOut;
  const existing = await tx.stockBalance.findUnique({
    where: { warehouseId_productId: { warehouseId: input.warehouseId, productId: input.productId } },
  });

  if (!existing) {
    if (delta < 0) {
      throw new Error("Үлдэгдэл хүрэлцэхгүй байна.");
    }
    await tx.stockBalance.create({
      data: {
        warehouseId: input.warehouseId,
        branchId: input.branchId,
        productId: input.productId,
        qty: new Prisma.Decimal(delta),
      },
    });
    return;
  }

  const nextQty = Number(existing.qty) + delta;
  if (nextQty < 0) {
    throw new Error("Үлдэгдэл хүрэлцэхгүй байна.");
  }

  await tx.stockBalance.update({
    where: { id: existing.id },
    data: { qty: new Prisma.Decimal(nextQty), branchId: input.branchId },
  });
}

