import "server-only";
import { d, money, sum, ZERO, type Dec } from "@/lib/decimal";
import {
  addDays,
  endOfLocalDay,
  localDayKey,
  startOfLocalDay,
  startOfLocalMonth,
  startOfNextLocalMonth,
} from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { getAccountBalances } from "./money";
import { inventoryValue } from "./inventory";

export type DashboardData = {
  todaySales: Dec;
  yesterdaySales: Dec;
  monthSales: Dec;
  todayPurchases: Dec;
  todayExpenses: Dec;
  bankBalance: Dec;
  todayCashIn: Dec;
  pendingDeposit: Dec;
  inventoryTotalValue: Dec;
  lowStockCount: number;
  varianceAmount: Dec;
  salesTrend: { day: string; label: string; amount: number }[];
  topProducts: { productId: string; name: string; quantity: Dec; revenue: Dec; profit: Dec }[];
  largestExpenses: { id: string; date: Date; category: string; amount: Dec; description: string | null }[];
  lowStockItems: {
    id: string;
    name: string;
    quantity: Dec;
    minimumStock: Dec;
    unit: string;
    value: Dec;
  }[];
  recentVariances: {
    id: string;
    countNo: string;
    date: Date;
    materialName: string;
    difference: Dec;
    variance: Dec;
  }[];
  recentActivity: {
    id: string;
    action: string;
    entityType: string;
    entityId: string | null;
    userName: string;
    createdAt: Date;
  }[];
};

/** Хянах самбарын бүх үзүүлэлтийг нэг дор бэлдэнэ. */
export async function getDashboardData(): Promise<DashboardData> {
  const todayStart = startOfLocalDay();
  const todayEnd = endOfLocalDay();
  const yesterdayStart = addDays(todayStart, -1);
  const monthStart = startOfLocalMonth();
  const monthEnd = startOfNextLocalMonth();
  const trendStart = addDays(todayStart, -6);

  const [
    todayAgg,
    yesterdayAgg,
    monthAgg,
    purchaseAgg,
    expenseAgg,
    balances,
    cashInAgg,
    materials,
    trendBatches,
    topItems,
    largestExpenseRows,
    varianceRows,
    activity,
  ] = await Promise.all([
    prisma.saleBatch.aggregate({
      where: { status: "POSTED", date: { gte: todayStart, lt: todayEnd } },
      _sum: { totalRevenue: true },
    }),
    prisma.saleBatch.aggregate({
      where: { status: "POSTED", date: { gte: yesterdayStart, lt: todayStart } },
      _sum: { totalRevenue: true },
    }),
    prisma.saleBatch.aggregate({
      where: { status: "POSTED", date: { gte: monthStart, lt: monthEnd } },
      _sum: { totalRevenue: true },
    }),
    prisma.purchase.aggregate({
      where: { status: "POSTED", date: { gte: todayStart, lt: todayEnd } },
      _sum: { totalAmount: true },
    }),
    prisma.expense.aggregate({
      where: { status: "POSTED", date: { gte: todayStart, lt: todayEnd } },
      _sum: { amount: true },
    }),
    getAccountBalances(),
    prisma.moneyTransaction.aggregate({
      where: { type: "SALE_CASH_IN", occurredAt: { gte: todayStart, lt: todayEnd } },
      _sum: { amount: true },
    }),
    prisma.rawMaterial.findMany({
      where: { isActive: true },
      select: { id: true, name: true, quantity: true, minimumStock: true, averageCost: true, unit: true },
    }),
    prisma.saleBatch.findMany({
      where: { status: "POSTED", date: { gte: trendStart, lt: todayEnd } },
      select: { date: true, totalRevenue: true },
    }),
    prisma.saleItem.groupBy({
      by: ["productId"],
      where: { saleBatch: { status: "POSTED", date: { gte: monthStart, lt: monthEnd } } },
      _sum: { quantity: true, total: true, totalCost: true },
      orderBy: { _sum: { total: "desc" } },
      take: 5,
    }),
    prisma.expense.findMany({
      where: { status: "POSTED", date: { gte: monthStart, lt: monthEnd } },
      include: { category: true },
      orderBy: { amount: "desc" },
      take: 5,
    }),
    prisma.inventoryCountItem.findMany({
      where: { count: { status: "POSTED" }, NOT: { differenceQuantity: 0 } },
      include: {
        rawMaterial: { select: { name: true } },
        count: { select: { countNo: true, date: true, completedAt: true } },
      },
      orderBy: { count: { completedAt: "desc" } },
      take: 8,
    }),
    prisma.auditLog.findMany({
      where: { user: { role: "MANAGER" } },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  const { unitLabel } = await import("@/lib/units");

  const lowStockItems = materials
    .filter((m) => d(m.minimumStock).greaterThan(0) && d(m.quantity).lessThan(m.minimumStock))
    .map((m) => ({
      id: m.id,
      name: m.name,
      quantity: d(m.quantity),
      minimumStock: d(m.minimumStock),
      unit: unitLabel(m.unit),
      value: inventoryValue(m.quantity, m.averageCost),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "mn"));

  const inventoryTotalValue = money(
    sum(materials.map((m) => inventoryValue(m.quantity, m.averageCost))),
  );

  // Сүүлийн 7 хоногийн борлуулалт
  const trendMap = new Map<string, number>();
  for (let i = 6; i >= 0; i -= 1) {
    trendMap.set(localDayKey(addDays(todayStart, -i)), 0);
  }
  for (const batch of trendBatches) {
    const key = localDayKey(batch.date);
    if (trendMap.has(key)) {
      trendMap.set(key, (trendMap.get(key) ?? 0) + d(batch.totalRevenue).toNumber());
    }
  }
  const salesTrend = [...trendMap.entries()].map(([day, amount]) => ({
    day,
    label: day.slice(5).replace("-", "/"),
    amount,
  }));

  const productIds = topItems.map((item) => item.productId);
  const productNames = new Map(
    (
      await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, name: true },
      })
    ).map((p) => [p.id, p.name]),
  );

  const topProducts = topItems.map((item) => {
    const revenue = d(item._sum.total ?? 0);
    const cost = d(item._sum.totalCost ?? 0);
    return {
      productId: item.productId,
      name: productNames.get(item.productId) ?? "-",
      quantity: d(item._sum.quantity ?? 0),
      revenue,
      profit: revenue.minus(cost),
    };
  });

  const varianceAmount = money(sum(varianceRows.map((row) => row.varianceAmount)));

  return {
    todaySales: money(todayAgg._sum.totalRevenue ?? ZERO),
    yesterdaySales: money(yesterdayAgg._sum.totalRevenue ?? ZERO),
    monthSales: money(monthAgg._sum.totalRevenue ?? ZERO),
    todayPurchases: money(purchaseAgg._sum.totalAmount ?? ZERO),
    todayExpenses: money(expenseAgg._sum.amount ?? ZERO),
    bankBalance: balances.bank,
    todayCashIn: money(cashInAgg._sum.amount ?? ZERO),
    pendingDeposit: balances.cash.greaterThan(0) ? balances.cash : ZERO,
    inventoryTotalValue,
    lowStockCount: lowStockItems.length,
    varianceAmount,
    salesTrend,
    topProducts,
    largestExpenses: largestExpenseRows.map((expense) => ({
      id: expense.id,
      date: expense.date,
      category: expense.category.name,
      amount: d(expense.amount),
      description: expense.description,
    })),
    lowStockItems: lowStockItems.slice(0, 8),
    recentVariances: varianceRows.map((row) => ({
      id: row.id,
      countNo: row.count.countNo,
      date: row.count.completedAt ?? row.count.date,
      materialName: row.rawMaterial.name,
      difference: d(row.differenceQuantity),
      variance: d(row.varianceAmount),
    })),
    recentActivity: activity.map((log) => ({
      id: log.id,
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId,
      userName: log.user?.name ?? "-",
      createdAt: log.createdAt,
    })),
  };
}
