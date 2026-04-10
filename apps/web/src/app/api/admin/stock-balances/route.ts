import { NextResponse } from "next/server";
import { prisma } from "@/core/db/prisma";
import { requirePermission } from "@/core/auth/rbac";

export async function GET(request: Request) {
  const auth = await requirePermission("inventory.balances.read");
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const branchId = searchParams.get("branchId") ?? undefined;
  const warehouseId = searchParams.get("warehouseId") ?? undefined;
  const productId = searchParams.get("productId") ?? undefined;

  const balances = await prisma.stockBalance.findMany({
    where: { branchId, warehouseId, productId },
    orderBy: [{ branchId: "asc" }, { warehouseId: "asc" }],
    include: {
      branch: true,
      warehouse: true,
      product: true,
    },
  });

  const [branches, warehouses, products] = await Promise.all([
    prisma.branch.findMany({ where: { isActive: true }, orderBy: { nameMn: "asc" } }),
    prisma.warehouse.findMany({ where: { isActive: true }, orderBy: { nameMn: "asc" }, include: { branch: true } }),
    prisma.product.findMany({ where: { isActive: true }, orderBy: { nameMn: "asc" } }),
  ]);

  return NextResponse.json({ balances, branches, warehouses, products });
}

