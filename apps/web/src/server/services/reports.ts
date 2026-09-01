import "server-only";
import { Prisma } from "@prisma/client";
import { d, money, sum, ZERO, type Dec } from "@/lib/decimal";
import { addDays, startOfLocalDay, startOfLocalMonth, startOfNextLocalMonth } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { inventoryValue } from "./inventory";

export type DateRange = { from: Date; to: Date };

/** Анхдагч хугацаа — энэ сар. */
export function defaultRange(): DateRange {
  return { from: startOfLocalMonth(), to: startOfNextLocalMonth() };
}

export function rangeFromInputs(from?: string, to?: string): DateRange {
  const parse = (value: string) => {
    const [y, m, day] = value.split("-").map(Number);
    return new Date(Date.UTC(y!, (m ?? 1) - 1, day ?? 1));
  };
  const fallback = defaultRange();
  return {
    from: from ? startOfLocalDay(parse(from)) : fallback.from,
    to: to ? addDays(startOfLocalDay(parse(to)), 1) : fallback.to,
  };
}

// A / B — Борлуулалтын тайлан ---------------------------------------------

export type SalesSummary = {
  revenue: Dec;
  cash: Dec;
  cardQr: Dec;
  bankTransfer: Dec;
  other: Dec;
  itemsSold: Dec;
  cogs: Dec;
  grossProfit: Dec;
  batchCount: number;
};

export async function getSalesSummary(range: DateRange): Promise<SalesSummary> {
  const where: Prisma.SaleBatchWhereInput = {
    status: "POSTED",
    date: { gte: range.from, lt: range.to },
  };

  const [aggregate, itemAggregate] = await Promise.all([
    prisma.saleBatch.aggregate({
      where,
      _sum: {
        totalRevenue: true,
        totalCogs: true,
        grossProfit: true,
        cashAmount: true,
        cardAmount: true,
        qrAmount: true,
        bankTransferAmount: true,
        otherAmount: true,
      },
      _count: true,
    }),
    prisma.saleItem.aggregate({
      where: { saleBatch: where },
      _sum: { quantity: true },
    }),
  ]);

  const s = aggregate._sum;
  return {
    revenue: money(s.totalRevenue ?? ZERO),
    cash: money(s.cashAmount ?? ZERO),
    cardQr: money(d(s.cardAmount ?? 0).plus(d(s.qrAmount ?? 0))),
    bankTransfer: money(s.bankTransferAmount ?? ZERO),
    other: money(s.otherAmount ?? ZERO),
    itemsSold: d(itemAggregate._sum.quantity ?? 0),
    cogs: money(s.totalCogs ?? ZERO),
    grossProfit: money(s.grossProfit ?? ZERO),
    batchCount: aggregate._count,
  };
}

export type DailySalesRow = {
  date: Date;
  revenue: Dec;
  cogs: Dec;
  grossProfit: Dec;
  cash: Dec;
  bank: Dec;
};

export async function getDailySalesReport(range: DateRange): Promise<DailySalesRow[]> {
  const batches = await prisma.saleBatch.groupBy({
    by: ["date"],
    where: { status: "POSTED", date: { gte: range.from, lt: range.to } },
    _sum: {
      totalRevenue: true,
      totalCogs: true,
      grossProfit: true,
      cashAmount: true,
      cardAmount: true,
      qrAmount: true,
      bankTransferAmount: true,
      otherAmount: true,
    },
    orderBy: { date: "desc" },
  });

  return batches.map((row) => ({
    date: row.date,
    revenue: money(row._sum.totalRevenue ?? ZERO),
    cogs: money(row._sum.totalCogs ?? ZERO),
    grossProfit: money(row._sum.grossProfit ?? ZERO),
    cash: money(row._sum.cashAmount ?? ZERO),
    bank: money(
      sum([
        row._sum.cardAmount ?? 0,
        row._sum.qrAmount ?? 0,
        row._sum.bankTransferAmount ?? 0,
        row._sum.otherAmount ?? 0,
      ]),
    ),
  }));
}

// C — Бүтээгдэхүүний тайлан ------------------------------------------------

export type ProductSalesRow = {
  productId: string;
  name: string;
  sku: string;
  quantity: Dec;
  revenue: Dec;
  cogs: Dec;
  grossProfit: Dec;
  grossMargin: Dec;
};

export async function getProductSalesReport(range: DateRange): Promise<ProductSalesRow[]> {
  const grouped = await prisma.saleItem.groupBy({
    by: ["productId"],
    where: { saleBatch: { status: "POSTED", date: { gte: range.from, lt: range.to } } },
    _sum: { quantity: true, total: true, totalCost: true },
    orderBy: { _sum: { total: "desc" } },
  });

  const products = await prisma.product.findMany({
    where: { id: { in: grouped.map((g) => g.productId) } },
    select: { id: true, name: true, sku: true },
  });
  const byId = new Map(products.map((p) => [p.id, p]));

  return grouped.map((row) => {
    const revenue = money(row._sum.total ?? ZERO);
    const cogs = money(row._sum.totalCost ?? ZERO);
    const grossProfit = money(revenue.minus(cogs));
    const product = byId.get(row.productId);
    return {
      productId: row.productId,
      name: product?.name ?? "-",
      sku: product?.sku ?? "-",
      quantity: d(row._sum.quantity ?? 0),
      revenue,
      cogs,
      grossProfit,
      grossMargin: revenue.greaterThan(0)
        ? grossProfit.dividedBy(revenue).times(100).toDecimalPlaces(1)
        : ZERO,
    };
  });
}

// D — Зардлын тайлан -------------------------------------------------------

export type ExpenseReportRow = { categoryId: string; name: string; amount: Dec; count: number };

export async function getExpenseReport(range: DateRange): Promise<ExpenseReportRow[]> {
  const grouped = await prisma.expense.groupBy({
    by: ["categoryId"],
    where: { status: "POSTED", date: { gte: range.from, lt: range.to } },
    _sum: { amount: true },
    _count: true,
    orderBy: { _sum: { amount: "desc" } },
  });

  const categories = await prisma.expenseCategory.findMany({
    where: { id: { in: grouped.map((g) => g.categoryId) } },
  });
  const byId = new Map(categories.map((c) => [c.id, c.name]));

  return grouped.map((row) => ({
    categoryId: row.categoryId,
    name: byId.get(row.categoryId) ?? "-",
    amount: money(row._sum.amount ?? ZERO),
    count: row._count,
  }));
}

// E — Худалдан авалтын тайлан ---------------------------------------------

export type PurchaseReportRow = {
  rawMaterialId: string;
  name: string;
  unit: string;
  quantity: Dec;
  amount: Dec;
  averagePrice: Dec;
};

export async function getPurchaseReport(range: DateRange): Promise<PurchaseReportRow[]> {
  const items = await prisma.purchaseItem.findMany({
    where: { purchase: { status: "POSTED", date: { gte: range.from, lt: range.to } } },
    include: { rawMaterial: { select: { id: true, name: true, unit: true } } },
  });

  const { unitLabel } = await import("@/lib/units");
  const map = new Map<string, PurchaseReportRow>();

  for (const item of items) {
    const key = item.rawMaterialId;
    const existing = map.get(key);
    const quantity = d(item.baseQuantity);
    const amount = d(item.subtotal);
    if (existing) {
      existing.quantity = existing.quantity.plus(quantity);
      existing.amount = existing.amount.plus(amount);
    } else {
      map.set(key, {
        rawMaterialId: key,
        name: item.rawMaterial.name,
        unit: unitLabel(item.rawMaterial.unit),
        quantity,
        amount,
        averagePrice: ZERO,
      });
    }
  }

  return [...map.values()]
    .map((row) => ({
      ...row,
      amount: money(row.amount),
      averagePrice: row.quantity.greaterThan(0)
        ? row.amount.dividedBy(row.quantity).toDecimalPlaces(2)
        : ZERO,
    }))
    .sort((a, b) => b.amount.comparedTo(a.amount));
}

// F — Нөөцийн тайлан -------------------------------------------------------

export type InventoryReportRow = {
  id: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  quantity: Dec;
  minimumStock: Dec;
  averageCost: Dec;
  value: Dec;
  isLow: boolean;
};

export async function getInventoryReport(): Promise<InventoryReportRow[]> {
  const materials = await prisma.rawMaterial.findMany({
    where: { isActive: true },
    include: { category: true },
    orderBy: { name: "asc" },
  });
  const { unitLabel } = await import("@/lib/units");

  return materials.map((m) => ({
    id: m.id,
    sku: m.sku,
    name: m.name,
    category: m.category?.name ?? "-",
    unit: unitLabel(m.unit),
    quantity: d(m.quantity),
    minimumStock: d(m.minimumStock),
    averageCost: d(m.averageCost),
    value: inventoryValue(m.quantity, m.averageCost),
    isLow: d(m.minimumStock).greaterThan(0) && d(m.quantity).lessThan(m.minimumStock),
  }));
}

// G — Тооллогын зөрүүний тайлан -------------------------------------------

export type VarianceReportRow = {
  id: string;
  countNo: string;
  date: Date;
  materialName: string;
  systemQuantity: Dec;
  countedQuantity: Dec;
  difference: Dec;
  unitCost: Dec;
  variance: Dec;
};

export async function getVarianceReport(range: DateRange): Promise<VarianceReportRow[]> {
  const items = await prisma.inventoryCountItem.findMany({
    where: {
      count: { status: "POSTED", date: { gte: range.from, lt: range.to } },
      NOT: { differenceQuantity: 0 },
    },
    include: {
      rawMaterial: { select: { name: true } },
      count: { select: { countNo: true, date: true } },
    },
    orderBy: { count: { date: "desc" } },
  });

  return items.map((item) => ({
    id: item.id,
    countNo: item.count.countNo,
    date: item.count.date,
    materialName: item.rawMaterial.name,
    systemQuantity: d(item.systemQuantity),
    countedQuantity: d(item.countedQuantity),
    difference: d(item.differenceQuantity),
    unitCost: d(item.weightedAverageCost),
    variance: d(item.varianceAmount),
  }));
}

// H — Түүхий эдийн үнийн түүх ---------------------------------------------

export type PriceHistoryRow = {
  id: string;
  date: Date;
  purchaseId: string;
  purchaseNo: string;
  materialId: string;
  materialName: string;
  unit: string;
  unitCost: Dec;
  quantity: Dec;
};

export async function getPriceHistoryReport(
  range: DateRange,
  rawMaterialId?: string,
): Promise<PriceHistoryRow[]> {
  const items = await prisma.purchaseItem.findMany({
    where: {
      ...(rawMaterialId ? { rawMaterialId } : {}),
      purchase: { status: "POSTED", date: { gte: range.from, lt: range.to } },
    },
    include: {
      rawMaterial: { select: { id: true, name: true, unit: true } },
      purchase: { select: { id: true, purchaseNo: true, date: true } },
    },
    orderBy: [{ purchase: { date: "desc" } }],
    take: 300,
  });

  const { unitLabel } = await import("@/lib/units");

  return items.map((item) => ({
    id: item.id,
    date: item.purchase.date,
    purchaseId: item.purchase.id,
    purchaseNo: item.purchase.purchaseNo,
    materialId: item.rawMaterial.id,
    materialName: item.rawMaterial.name,
    unit: unitLabel(item.rawMaterial.unit),
    unitCost: d(item.baseUnitCost),
    quantity: d(item.baseQuantity),
  }));
}
