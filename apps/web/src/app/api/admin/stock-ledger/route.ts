import { NextResponse } from "next/server";
import { prisma } from "@/core/db/prisma";
import { requirePermission } from "@/core/auth/rbac";

export async function GET(request: Request) {
  const auth = await requirePermission("inventory.ledger.read");
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const warehouseId = searchParams.get("warehouseId") ?? undefined;
  const productId = searchParams.get("productId") ?? undefined;

  const ledger = await prisma.stockLedger.findMany({
    where: {
      warehouseId,
      productId,
    },
    orderBy: { occurredAt: "desc" },
    include: {
      warehouse: { include: { branch: true } },
      product: true,
    },
    take: 300,
  });

  return NextResponse.json({ ledger });
}

