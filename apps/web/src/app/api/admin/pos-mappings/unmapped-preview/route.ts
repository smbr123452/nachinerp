import { NextResponse } from "next/server";
import { prisma } from "@/core/db/prisma";
import { requirePermission } from "@/core/auth/rbac";
import { parsePosExcel, isCancelledRow } from "@/core/pos/excel";

export async function POST(request: Request) {
  const auth = await requirePermission("pos.mapping.read");
  if (auth instanceof NextResponse) return auth;

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) return NextResponse.json({ message: "Excel файл оруулна уу." }, { status: 400 });
  if (!file.name.toLowerCase().endsWith(".xlsx")) return NextResponse.json({ message: "Зөвхөн .xlsx файл дэмжинэ." }, { status: 400 });

  const rows = parsePosExcel(await file.arrayBuffer()).filter((r) => !isCancelledRow(r.isCancelled));
  const [branchMappings, codeMappings, nameMappings, products] = await Promise.all([
    prisma.posBranchMapping.findMany({ where: { isActive: true } }),
    prisma.posProductMapping.findMany({ where: { isActive: true } }),
    prisma.posProductNameMapping.findMany({ where: { isActive: true } }),
    prisma.product.findMany({ where: { isActive: true }, select: { id: true, nameMn: true } }),
  ]);

  const branchSet = new Set(branchMappings.map((x) => x.posBranchName.trim().toLowerCase()));
  const codeSet = new Set(codeMappings.map((x) => x.productCode.trim().toLowerCase()));
  const nameSet = new Set(nameMappings.map((x) => x.productName.trim().toLowerCase()));
  const productNameSet = new Set(products.map((x) => x.nameMn.trim().toLowerCase()));

  const unmappedBranches = Array.from(new Set(rows.map((r) => r.branchName).filter((x) => x && !branchSet.has(x.trim().toLowerCase()))));
  const unmappedProductCodes = Array.from(new Set(rows.map((r) => r.productCode).filter((x) => x && !codeSet.has(x.trim().toLowerCase()))));
  const unmappedProductNames = Array.from(
    new Set(
      rows
        .map((r) => r.productName)
        .filter((x) => x && !nameSet.has(x.trim().toLowerCase()) && !productNameSet.has(x.trim().toLowerCase())),
    ),
  );

  return NextResponse.json({
    totalRows: rows.length,
    unmappedBranches,
    unmappedProductCodes,
    unmappedProductNames,
  });
}

