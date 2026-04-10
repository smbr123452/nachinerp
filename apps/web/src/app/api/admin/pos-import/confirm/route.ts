import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/core/db/prisma";
import { requirePermission } from "@/core/auth/rbac";
import { writeAuditLog } from "@/core/audit/audit";
import { parsePosExcel, isCancelledRow } from "@/core/pos/excel";
import { addStockLedgerAndUpdateBalance } from "@/core/inventory/stock";

type NormalizedRow = {
  branchId: string;
  warehouseId: string;
  productId: string;
  saleDate: Date;
  saleTime: string;
  receiptNo: string;
  receiptSequence: number;
  lineSequence: number;
  productCode: string;
  productName: string;
  barcode: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  cashierName: string;
  orderType: string;
  productGroup: string;
  productCategory: string;
};

export async function POST(request: Request) {
  const auth = await requirePermission("pos.import.run");
  if (auth instanceof NextResponse) return auth;

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) return NextResponse.json({ message: "Excel файл оруулна уу." }, { status: 400 });
  if (!file.name.toLowerCase().endsWith(".xlsx")) return NextResponse.json({ message: "Зөвхөн .xlsx файл дэмжинэ." }, { status: 400 });

  const rows = parsePosExcel(await file.arrayBuffer());
  const branchMappings = await prisma.posBranchMapping.findMany({ where: { isActive: true } });
  const productCodeMappings = await prisma.posProductMapping.findMany({ where: { isActive: true } });
  const activeProducts = await prisma.product.findMany({ where: { isActive: true } });

  const branchMap = new Map(branchMappings.map((x) => [x.posBranchName.trim().toLowerCase(), x]));
  const codeMap = new Map(productCodeMappings.map((x) => [x.productCode.trim().toLowerCase(), x.productId]));
  const nameMap = new Map(activeProducts.map((x) => [x.nameMn.trim().toLowerCase(), x.id]));

  const normalized: NormalizedRow[] = [];
  let skippedCancelled = 0;
  let failedRows = 0;

  for (const r of rows) {
    if (isCancelledRow(r.isCancelled)) {
      skippedCancelled += 1;
      continue;
    }
    const branch = branchMap.get(r.branchName.trim().toLowerCase());
    const productId = codeMap.get(r.productCode.trim().toLowerCase()) ?? nameMap.get(r.productName.trim().toLowerCase()) ?? null;
    if (!branch || !productId) {
      failedRows += 1;
      continue;
    }

    const saleDate = new Date(`${r.saleDate}T00:00:00`);
    if (Number.isNaN(saleDate.getTime()) || r.receiptSequence <= 0 || r.lineSequence <= 0 || r.quantity <= 0) {
      failedRows += 1;
      continue;
    }

    normalized.push({
      branchId: branch.branchId,
      warehouseId: branch.warehouseId,
      productId,
      saleDate,
      saleTime: r.saleTime,
      receiptNo: r.receiptNo,
      receiptSequence: r.receiptSequence,
      lineSequence: r.lineSequence,
      productCode: r.productCode,
      productName: r.productName,
      barcode: r.barcode,
      unitPrice: r.unitPrice,
      quantity: r.quantity,
      lineTotal: r.lineTotal,
      cashierName: r.cashierName,
      orderType: r.orderType,
      productGroup: r.productGroup,
      productCategory: r.productCategory,
    });
  }

  const importNo = `POS-${Date.now()}`;
  let duplicateRows = 0;
  let importedRows = 0;

  const result = await prisma.$transaction(async (tx) => {
    const batch = await tx.posImportBatch.create({
      data: {
        importNo,
        originalFileName: file.name,
        totalRows: rows.length,
        skippedCancelledRows: skippedCancelled,
        status: "PROCESSING",
        createdById: auth.user.id,
      },
    });

    const saleKeyToId = new Map<string, string>();

    for (const row of normalized) {
      const exists = await tx.posSaleItem.findUnique({
        where: {
          branchId_saleDate_receiptSequence_lineSequence: {
            branchId: row.branchId,
            saleDate: row.saleDate,
            receiptSequence: row.receiptSequence,
            lineSequence: row.lineSequence,
          },
        },
      });
      if (exists) {
        duplicateRows += 1;
        continue;
      }

      const saleKey = `${row.branchId}|${row.saleDate.toISOString().slice(0, 10)}|${row.receiptSequence}|${row.receiptNo}`;
      let saleId = saleKeyToId.get(saleKey);
      if (!saleId) {
        const sale = await tx.posSale.create({
          data: {
            importBatchId: batch.id,
            branchId: row.branchId,
            receiptNo: row.receiptNo,
            saleDate: row.saleDate,
            saleTime: row.saleTime || null,
            receiptSequence: row.receiptSequence,
            cashierName: row.cashierName || null,
            orderType: row.orderType || null,
          },
        });
        saleId = sale.id;
        saleKeyToId.set(saleKey, saleId);
      }

      await tx.posSaleItem.create({
        data: {
          posSaleId: saleId,
          branchId: row.branchId,
          saleDate: row.saleDate,
          receiptSequence: row.receiptSequence,
          lineSequence: row.lineSequence,
          productId: row.productId,
          productCode: row.productCode || null,
          productName: row.productName,
          barcode: row.barcode || null,
          unitPrice: new Prisma.Decimal(row.unitPrice),
          quantity: new Prisma.Decimal(row.quantity),
          lineTotal: new Prisma.Decimal(row.lineTotal),
          productGroup: row.productGroup || null,
          productCategory: row.productCategory || null,
        },
      });

      const warehouse = await tx.warehouse.findUnique({ where: { id: row.warehouseId } });
      if (!warehouse) {
        failedRows += 1;
        continue;
      }

      await addStockLedgerAndUpdateBalance(tx, {
        txnType: "POS_SALE_OUT",
        warehouseId: row.warehouseId,
        branchId: row.branchId,
        productId: row.productId,
        qtyIn: 0,
        qtyOut: row.quantity,
        refType: "POS_SALE_ITEM",
        refId: `${row.branchId}-${row.saleDate.toISOString().slice(0, 10)}-${row.receiptSequence}-${row.lineSequence}`,
        note: `Receipt ${row.receiptNo}`,
        createdById: auth.user.id,
      });

      importedRows += 1;
    }

    const finalStatus = failedRows > 0 ? "PARTIAL" : "SUCCESS";
    await tx.posImportBatch.update({
      where: { id: batch.id },
      data: {
        duplicateRows,
        importedRows,
        failedRows,
        status: finalStatus,
      },
    });

    return { batchId: batch.id, finalStatus };
  });

  await writeAuditLog({
    actorUserId: auth.user.id,
    module: "pos.import",
    action: "confirm_import",
    entityType: "PosImportBatch",
    entityId: result.batchId,
    afterData: {
      totalRows: rows.length,
      skippedCancelled,
      duplicateRows,
      importedRows,
      failedRows,
      status: result.finalStatus,
    },
    ipAddress: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({
    message: "POS импорт дууслаа.",
    summary: {
      totalRows: rows.length,
      skippedCancelled,
      duplicateRows,
      importedRows,
      failedRows,
      status: result.finalStatus,
    },
  });
}

