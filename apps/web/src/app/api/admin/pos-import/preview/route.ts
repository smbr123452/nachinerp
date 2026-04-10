import { NextResponse } from "next/server";
import { prisma } from "@/core/db/prisma";
import { requirePermission } from "@/core/auth/rbac";
import { parsePosExcel, isCancelledRow } from "@/core/pos/excel";
import { writeAuditLog } from "@/core/audit/audit";

export async function POST(request: Request) {
  const auth = await requirePermission("pos.import.run");
  if (auth instanceof NextResponse) return auth;

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ message: "Excel файл оруулна уу." }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    return NextResponse.json({ message: "Зөвхөн .xlsx файл дэмжинэ." }, { status: 400 });
  }

  const rows = parsePosExcel(await file.arrayBuffer());
  const branchMappings = await prisma.posBranchMapping.findMany({ where: { isActive: true } });
  const productCodeMappings = await prisma.posProductMapping.findMany({ where: { isActive: true } });
  const activeProducts = await prisma.product.findMany({ where: { isActive: true } });

  const branchMap = new Map(branchMappings.map((x) => [x.posBranchName.trim().toLowerCase(), x]));
  const codeMap = new Map(productCodeMappings.map((x) => [x.productCode.trim().toLowerCase(), x.productId]));
  const nameMap = new Map(activeProducts.map((x) => [x.nameMn.trim().toLowerCase(), x.id]));

  let skippedCancelled = 0;
  let mapped = 0;
  let unmapped = 0;

  const previewRows = rows.map((r, idx) => {
    if (isCancelledRow(r.isCancelled)) {
      skippedCancelled += 1;
      return { index: idx + 1, ...r, status: "SKIPPED_CANCELLED" as const };
    }
    const branch = branchMap.get(r.branchName.trim().toLowerCase());
    const productIdByCode = codeMap.get(r.productCode.trim().toLowerCase());
    const productIdByName = nameMap.get(r.productName.trim().toLowerCase());
    const productId = productIdByCode ?? productIdByName ?? null;

    if (!branch || !productId) {
      unmapped += 1;
      return {
        index: idx + 1,
        ...r,
        status: "UNMAPPED" as const,
        branchMapped: Boolean(branch),
        productMapped: Boolean(productId),
      };
    }

    mapped += 1;
    return {
      index: idx + 1,
      ...r,
      status: "READY" as const,
      branchMapped: true,
      productMapped: true,
      mappedBranchId: branch.branchId,
      mappedWarehouseId: branch.warehouseId,
      mappedProductId: productId,
      productMatchedBy: productIdByCode ? "CODE" : "NAME",
    };
  });

  await writeAuditLog({
    actorUserId: auth.user.id,
    module: "pos.import",
    action: "preview",
    entityType: "PosImportPreview",
    afterData: {
      fileName: file.name,
      totalRows: rows.length,
      skippedCancelled,
      mapped,
      unmapped,
    },
    ipAddress: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({
    summary: {
      totalRows: rows.length,
      skippedCancelled,
      mapped,
      unmapped,
    },
    previewRows,
  });
}

