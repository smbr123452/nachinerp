import "server-only";
import { Prisma } from "@prisma/client";
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
import { requireOperator, requireOwner } from "@/lib/auth/guards";
import { unitLabel } from "@/lib/units";
import { getAccountBalances } from "./money";
import { inventoryValue } from "./inventory";
import { getDailySalesReport, type DateRange } from "./reports";

/**
 * Хянах самбарын нэгтгэлүүд.
 *
 * Эзэн ба менежер ӨӨР ӨӨР самбар хардаг. Эзний нууцлалтай үзүүлэлтийг
 * (ашиг, ашигт байдал, банкны шинжилгээ) менежерийн хүсэлтээр ТАТАХГҮЙ —
 * функц бүр өөрөө эрхээ шалгана, зөвхөн UI дээр нуухгүй.
 */

// ---------------------------------------------------------------------------
// Хугацааны сонголт
// ---------------------------------------------------------------------------

export const RANGE_KEYS = ["7d", "30d", "month", "prevMonth"] as const;
export type RangeKey = (typeof RANGE_KEYS)[number];

export const RANGE_LABEL: Record<RangeKey, string> = {
  "7d": "7 хоног",
  "30d": "30 хоног",
  month: "Энэ сар",
  prevMonth: "Өмнөх сар",
};

export function parseRangeKey(value: string | undefined): RangeKey {
  return RANGE_KEYS.includes(value as RangeKey) ? (value as RangeKey) : "30d";
}

/** Сонгосон хугацаа ба түүнтэй ижил урттай өмнөх хугацаа (харьцуулалтад). */
export function resolveRange(key: RangeKey): { current: DateRange; previous: DateRange } {
  const todayStart = startOfLocalDay();
  const tomorrow = endOfLocalDay();

  if (key === "month") {
    const from = startOfLocalMonth();
    const to = startOfNextLocalMonth();
    const prevFrom = startOfLocalMonth(addDays(from, -1));
    return { current: { from, to }, previous: { from: prevFrom, to: from } };
  }

  if (key === "prevMonth") {
    const thisMonth = startOfLocalMonth();
    const from = startOfLocalMonth(addDays(thisMonth, -1));
    const prevFrom = startOfLocalMonth(addDays(from, -1));
    return { current: { from, to: thisMonth }, previous: { from: prevFrom, to: from } };
  }

  const days = key === "7d" ? 7 : 30;
  const from = addDays(todayStart, -(days - 1));
  return {
    current: { from, to: tomorrow },
    previous: { from: addDays(from, -days), to: from },
  };
}

// ---------------------------------------------------------------------------
// Хуваалцсан төрлүүд
// ---------------------------------------------------------------------------

/** Өмнөх үетэй харьцуулсан өөрчлөлт. Суурь 0 бол харьцуулах утгагүй тул null. */
export type Comparison = { percent: number; direction: "up" | "down" } | null;

function compare(current: Dec, previous: Dec): Comparison {
  if (previous.lessThanOrEqualTo(0)) return null;
  const change = current.minus(previous).dividedBy(previous).times(100);
  const percent = Number(change.toDecimalPlaces(1).toString());
  if (percent === 0) return null;
  return { percent: Math.abs(percent), direction: percent > 0 ? "up" : "down" };
}

export type LowStockRow = {
  id: string;
  name: string;
  quantity: number;
  minimumStock: number;
  unit: string;
  /** OUT — үлдэгдэлгүй, CRITICAL — доод хэмжээний 50%-аас доош, LOW — доод хэмжээнээс доош. */
  severity: "OUT" | "CRITICAL" | "LOW";
};

export type ActivityRow = {
  id: string;
  action: string;
  entityType: string;
  userName: string;
  createdAt: Date;
};

export type AlertRow = {
  id: string;
  tone: "danger" | "warning" | "info";
  message: string;
  href: string;
};

// ---------------------------------------------------------------------------
// Хуваалцсан жижиг нэгтгэлүүд
// ---------------------------------------------------------------------------

type MaterialStockRow = {
  id: string;
  name: string;
  quantity: Prisma.Decimal;
  minimumStock: Prisma.Decimal;
  averageCost: Prisma.Decimal;
  unit: Parameters<typeof unitLabel>[0];
};

/** Идэвхтэй материалын нөөцийн төлөв — нэг удаагийн уншилтаас бүгдийг гаргана. */
function summariseStock(materials: MaterialStockRow[]) {
  const lowStock: LowStockRow[] = [];
  let outOfStockCount = 0;

  for (const material of materials) {
    const quantity = d(material.quantity);
    const minimum = d(material.minimumStock);
    const isOut = quantity.lessThanOrEqualTo(0);
    const isLow = minimum.greaterThan(0) && quantity.lessThan(minimum);
    if (isOut) outOfStockCount += 1;
    if (!isOut && !isLow) continue;

    lowStock.push({
      id: material.id,
      name: material.name,
      quantity: quantity.toNumber(),
      minimumStock: minimum.toNumber(),
      unit: unitLabel(material.unit),
      severity: isOut
        ? "OUT"
        : minimum.greaterThan(0) && quantity.lessThan(minimum.times(0.5))
          ? "CRITICAL"
          : "LOW",
    });
  }

  const severityRank = { OUT: 0, CRITICAL: 1, LOW: 2 } as const;
  lowStock.sort(
    (a, b) =>
      severityRank[a.severity] - severityRank[b.severity] || a.name.localeCompare(b.name, "mn"),
  );

  return {
    lowStock,
    outOfStockCount,
    lowStockCount: lowStock.filter((row) => row.severity !== "OUT").length,
    totalValue: money(sum(materials.map((m) => inventoryValue(m.quantity, m.averageCost)))),
  };
}

const STOCK_SELECT = {
  id: true,
  name: true,
  quantity: true,
  minimumStock: true,
  averageCost: true,
  unit: true,
} as const;

/** Сүүлийн баталгаажсан тооллогын зөрүү. */
async function getLastCountVariance() {
  const lastCount = await prisma.inventoryCount.findFirst({
    where: { status: "POSTED" },
    orderBy: [{ completedAt: "desc" }, { date: "desc" }],
    select: {
      id: true,
      countNo: true,
      date: true,
      completedAt: true,
      items: {
        where: { NOT: { differenceQuantity: 0 } },
        select: {
          id: true,
          differenceQuantity: true,
          varianceAmount: true,
          systemQuantity: true,
          countedQuantity: true,
          rawMaterial: { select: { name: true, unit: true } },
        },
        orderBy: { varianceAmount: "asc" },
        take: 6,
      },
    },
  });

  if (!lastCount) return null;

  // Нийт зөрүүг бүх мөрөөс тооцно (дээрх take нь зөвхөн харуулах мөрүүд).
  const totals = await prisma.inventoryCountItem.aggregate({
    where: { countId: lastCount.id },
    _sum: { varianceAmount: true },
  });

  return {
    id: lastCount.id,
    countNo: lastCount.countNo,
    date: lastCount.completedAt ?? lastCount.date,
    totalVariance: money(totals._sum.varianceAmount ?? ZERO),
    items: lastCount.items.map((item) => ({
      id: item.id,
      materialName: item.rawMaterial.name,
      unit: unitLabel(item.rawMaterial.unit),
      systemQuantity: d(item.systemQuantity).toNumber(),
      countedQuantity: d(item.countedQuantity).toNumber(),
      difference: d(item.differenceQuantity).toNumber(),
      varianceAmount: d(item.varianceAmount).toNumber(),
    })),
  };
}

// ---------------------------------------------------------------------------
// ЭЗНИЙ САМБАР
// ---------------------------------------------------------------------------

export type OwnerDashboard = {
  rangeKey: RangeKey;
  range: DateRange;
  kpi: {
    todaySales: Dec;
    todayVsYesterday: Comparison;
    monthSales: Dec;
    monthSalesVsPrev: Comparison;
    monthCogs: Dec;
    monthGrossProfit: Dec;
    monthGrossProfitVsPrev: Comparison;
    monthGrossMargin: Dec | null;
    bankBalance: Dec;
    pendingDeposit: Dec;
    inventoryValue: Dec;
  };
  /** Сонгосон хугацааны өдөр тутмын орлого / өртөг / ашиг. */
  trend: { label: string; revenue: number; cogs: number; grossProfit: number }[];
  /** Орлого ба зардлыг өдрөөр харьцуулсан (бүгд ₮ тул нэг тэнхлэгт зохино). */
  incomeVsSpend: { label: string; sales: number; purchases: number; expenses: number }[];
  paymentMix: { key: string; label: string; amount: number }[];
  topProducts: {
    productId: string;
    name: string;
    quantity: number;
    revenue: number;
    grossProfit: number;
  }[];
  profitability: {
    productId: string;
    name: string;
    revenue: Dec;
    cogs: Dec;
    grossProfit: Dec;
    grossMargin: Dec;
  }[];
  inventory: {
    lowStockCount: number;
    outOfStockCount: number;
    totalValue: Dec;
    lowStock: LowStockRow[];
  };
  lastCount: Awaited<ReturnType<typeof getLastCountVariance>>;
  expenseMix: { id: string; name: string; amount: Dec; share: number }[];
  priceMovements: {
    id: string;
    name: string;
    unit: string;
    previousCost: number;
    latestCost: number;
    changePercent: number;
  }[];
  alerts: AlertRow[];
  activity: ActivityRow[];
};

/** Тухайн хугацааны худалдан авалт / зардлыг өдрөөр нэгтгэнэ. */
async function getSpendByDay(range: DateRange) {
  const [purchases, expenses] = await Promise.all([
    prisma.purchase.groupBy({
      by: ["date"],
      where: { status: "POSTED", date: { gte: range.from, lt: range.to } },
      _sum: { totalAmount: true },
    }),
    prisma.expense.groupBy({
      by: ["date"],
      where: { status: "POSTED", date: { gte: range.from, lt: range.to } },
      _sum: { amount: true },
    }),
  ]);

  const purchaseByDay = new Map(
    purchases.map((row) => [localDayKey(row.date), d(row._sum.totalAmount ?? 0).toNumber()]),
  );
  const expenseByDay = new Map(
    expenses.map((row) => [localDayKey(row.date), d(row._sum.amount ?? 0).toNumber()]),
  );
  return { purchaseByDay, expenseByDay };
}

/**
 * Түүхий эдийн сүүлийн авалтын үнэ өмнөх авалтаас хэр өссөнийг гаргана.
 * Зөвхөн 2-оос дээш удаа авсан материалыг харуулна — өөр тохиолдолд
 * харьцуулах суурь байхгүй тул огт үзүүлэхгүй (хуурамч өсөлт гаргахгүй).
 */
async function getPriceMovements(limit = 5) {
  const rows = await prisma.$queryRaw<
    {
      id: string;
      name: string;
      unit: string;
      latest_cost: Prisma.Decimal;
      previous_cost: Prisma.Decimal;
    }[]
  >(Prisma.sql`
    WITH ranked AS (
      SELECT
        pi."rawMaterialId"                                            AS material_id,
        pi."baseUnitCost"                                             AS unit_cost,
        ROW_NUMBER() OVER (
          PARTITION BY pi."rawMaterialId"
          ORDER BY p."date" DESC, p."createdAt" DESC, pi."id" DESC
        )                                                             AS rn
      FROM "PurchaseItem" pi
      JOIN "Purchase" p ON p."id" = pi."purchaseId"
      WHERE p."status" = 'POSTED'
    )
    SELECT
      rm."id"                       AS id,
      rm."name"                     AS name,
      rm."unit"::text               AS unit,
      latest."unit_cost"            AS latest_cost,
      previous."unit_cost"          AS previous_cost
    FROM ranked latest
    JOIN ranked previous
      ON previous."material_id" = latest."material_id" AND previous."rn" = 2
    JOIN "RawMaterial" rm ON rm."id" = latest."material_id"
    WHERE latest."rn" = 1
      AND rm."isActive" = true
      AND previous."unit_cost" > 0
      AND latest."unit_cost" > previous."unit_cost"
    ORDER BY (latest."unit_cost" - previous."unit_cost") / previous."unit_cost" DESC
    LIMIT ${limit}
  `);

  return rows.map((row) => {
    const previous = d(row.previous_cost);
    const latest = d(row.latest_cost);
    return {
      id: row.id,
      name: row.name,
      unit: unitLabel(row.unit as Parameters<typeof unitLabel>[0]),
      previousCost: previous.toNumber(),
      latestCost: latest.toNumber(),
      changePercent: Number(
        latest.minus(previous).dividedBy(previous).times(100).toDecimalPlaces(1).toString(),
      ),
    };
  });
}

/** Ашгийн хувь энэ түвшнээс доош бүтээгдэхүүнийг анхааруулгад оруулна. */
const LOW_MARGIN_THRESHOLD = 20;

/**
 * ЭЗНИЙ хянах самбар. Дуудахаас өмнө эрхийг ӨӨРӨӨ шалгана — менежер
 * шууд дуудсан ч өгөгдөл буцаахгүй.
 */
export async function getOwnerDashboard(rangeKey: RangeKey): Promise<OwnerDashboard> {
  await requireOwner();

  const { current, previous } = resolveRange(rangeKey);
  const todayStart = startOfLocalDay();
  const todayEnd = endOfLocalDay();
  const yesterdayStart = addDays(todayStart, -1);
  const monthStart = startOfLocalMonth();
  const monthEnd = startOfNextLocalMonth();
  const prevMonthStart = startOfLocalMonth(addDays(monthStart, -1));

  const [
    todayAgg,
    yesterdayAgg,
    monthAgg,
    prevMonthAgg,
    balances,
    materials,
    dailySales,
    spend,
    paymentAgg,
    productRows,
    expenseGroups,
    priceMovements,
    lastCount,
    activity,
    draftCountCount,
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
      _sum: { totalRevenue: true, totalCogs: true, grossProfit: true },
    }),
    prisma.saleBatch.aggregate({
      where: { status: "POSTED", date: { gte: prevMonthStart, lt: monthStart } },
      _sum: { totalRevenue: true, grossProfit: true },
    }),
    getAccountBalances(),
    prisma.rawMaterial.findMany({ where: { isActive: true }, select: STOCK_SELECT }),
    getDailySalesReport(current),
    getSpendByDay(current),
    prisma.saleBatch.aggregate({
      where: { status: "POSTED", date: { gte: current.from, lt: current.to } },
      _sum: {
        cashAmount: true,
        cardAmount: true,
        qrAmount: true,
        bankTransferAmount: true,
        otherAmount: true,
      },
    }),
    prisma.saleItem.groupBy({
      by: ["productId"],
      where: { saleBatch: { status: "POSTED", date: { gte: current.from, lt: current.to } } },
      _sum: { quantity: true, total: true, totalCost: true },
      orderBy: { _sum: { total: "desc" } },
      take: 10,
    }),
    prisma.expense.groupBy({
      by: ["categoryId"],
      where: { status: "POSTED", date: { gte: current.from, lt: current.to } },
      _sum: { amount: true },
      orderBy: { _sum: { amount: "desc" } },
      take: 8,
    }),
    getPriceMovements(),
    getLastCountVariance(),
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 12,
      select: {
        id: true,
        action: true,
        entityType: true,
        createdAt: true,
        user: { select: { name: true } },
      },
    }),
    prisma.inventoryCount.count({ where: { status: "DRAFT" } }),
  ]);

  // Нэр шаардлагатай сурвалжуудыг нэг удаа уншина (N+1-ээс сэргийлнэ).
  const [products, categories] = await Promise.all([
    prisma.product.findMany({
      where: { id: { in: productRows.map((row) => row.productId) } },
      select: { id: true, name: true },
    }),
    prisma.expenseCategory.findMany({
      where: { id: { in: expenseGroups.map((row) => row.categoryId) } },
      select: { id: true, name: true },
    }),
  ]);
  const productName = new Map(products.map((p) => [p.id, p.name]));
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));

  const stock = summariseStock(materials);

  const monthSales = money(monthAgg._sum.totalRevenue ?? ZERO);
  const monthCogs = money(monthAgg._sum.totalCogs ?? ZERO);
  const monthGrossProfit = money(monthAgg._sum.grossProfit ?? ZERO);
  const monthGrossMargin = monthSales.greaterThan(0)
    ? monthGrossProfit.dividedBy(monthSales).times(100).toDecimalPlaces(1)
    : null;

  // Борлуулалтгүй өдрийг ч гулсуулахгүй тул хугацааны бүх өдрийг сийрүүлж,
  // дараа нь бодит утгуудаар дүүргэнэ (график тасалдалгүй, үнэн байна).
  const salesByDay = new Map(dailySales.map((row) => [localDayKey(row.date), row]));
  const days: string[] = [];
  for (
    let cursor = startOfLocalDay(current.from);
    cursor < current.to;
    cursor = addDays(cursor, 1)
  ) {
    days.push(localDayKey(cursor));
  }

  const trend = days.map((key) => {
    const row = salesByDay.get(key);
    return {
      label: key.slice(5).replace("-", "/"),
      revenue: row ? row.revenue.toNumber() : 0,
      cogs: row ? row.cogs.toNumber() : 0,
      grossProfit: row ? row.grossProfit.toNumber() : 0,
    };
  });

  const incomeVsSpend = days.map((key, index) => ({
    label: trend[index]!.label,
    sales: trend[index]!.revenue,
    purchases: spend.purchaseByDay.get(key) ?? 0,
    expenses: spend.expenseByDay.get(key) ?? 0,
  }));

  const paymentMix = [
    { key: "cash", label: "Бэлэн", amount: d(paymentAgg._sum.cashAmount ?? 0).toNumber() },
    {
      key: "cardQr",
      label: "Карт / QR",
      amount: d(paymentAgg._sum.cardAmount ?? 0)
        .plus(d(paymentAgg._sum.qrAmount ?? 0))
        .toNumber(),
    },
    { key: "bank", label: "Банк", amount: d(paymentAgg._sum.bankTransferAmount ?? 0).toNumber() },
    { key: "other", label: "Бусад", amount: d(paymentAgg._sum.otherAmount ?? 0).toNumber() },
  ].filter((slice) => slice.amount > 0);

  const profitability = productRows
    .map((row) => {
      const revenue = money(row._sum.total ?? ZERO);
      const cogs = money(row._sum.totalCost ?? ZERO);
      const grossProfit = money(revenue.minus(cogs));
      return {
        productId: row.productId,
        name: productName.get(row.productId) ?? "-",
        revenue,
        cogs,
        grossProfit,
        grossMargin: revenue.greaterThan(0)
          ? grossProfit.dividedBy(revenue).times(100).toDecimalPlaces(1)
          : ZERO,
      };
    })
    .filter((row) => row.revenue.greaterThan(0));

  const quantityByProduct = new Map(
    productRows.map((row) => [row.productId, d(row._sum.quantity ?? 0).toNumber()]),
  );
  const topProducts = profitability.map((row) => ({
    productId: row.productId,
    name: row.name,
    quantity: quantityByProduct.get(row.productId) ?? 0,
    revenue: row.revenue.toNumber(),
    grossProfit: row.grossProfit.toNumber(),
  }));

  const expenseTotal = sum(expenseGroups.map((row) => row._sum.amount ?? 0));
  const expenseMix = expenseGroups.map((row) => {
    const amount = money(row._sum.amount ?? ZERO);
    return {
      id: row.categoryId,
      name: categoryName.get(row.categoryId) ?? "-",
      amount,
      share: expenseTotal.greaterThan(0)
        ? Number(amount.dividedBy(expenseTotal).times(100).toDecimalPlaces(1).toString())
        : 0,
    };
  });

  // Анхаарах зүйлс — зөвхөн бодитоор биелсэн нөхцөл.
  const alerts: AlertRow[] = [];
  if (stock.outOfStockCount > 0) {
    alerts.push({
      id: "out-of-stock",
      tone: "danger",
      message: `${stock.outOfStockCount} бараа нөөцгүй болсон`,
      href: "/materials?status=low",
    });
  }
  if (stock.lowStockCount > 0) {
    alerts.push({
      id: "low-stock",
      tone: "warning",
      message: `${stock.lowStockCount} бараа доод хэмжээнээс доош орсон`,
      href: "/materials?status=low",
    });
  }
  if (balances.cash.greaterThan(0)) {
    alerts.push({
      id: "pending-deposit",
      tone: "warning",
      message: `${balances.cash.toFixed(0)} ₮ банканд тушаагдаагүй байна`,
      href: "/money",
    });
  }
  if (lastCount && lastCount.totalVariance.lessThan(0)) {
    alerts.push({
      id: "count-variance",
      tone: "danger",
      message: `Сүүлийн тооллогоор ${lastCount.totalVariance.abs().toFixed(0)} ₮ дутагдал гарсан`,
      href: `/counts/${lastCount.id}`,
    });
  }
  const lowMarginProducts = profitability.filter((row) =>
    row.grossMargin.lessThan(LOW_MARGIN_THRESHOLD),
  );
  if (lowMarginProducts.length > 0) {
    alerts.push({
      id: "low-margin",
      tone: "warning",
      message: `${lowMarginProducts.length} бүтээгдэхүүний ашгийн хувь ${LOW_MARGIN_THRESHOLD}%-иас доош`,
      href: "/reports?report=products",
    });
  }
  if (draftCountCount > 0) {
    alerts.push({
      id: "draft-count",
      tone: "info",
      message: `${draftCountCount} тооллого дуусаагүй байна`,
      href: "/counts",
    });
  }

  return {
    rangeKey,
    range: current,
    kpi: {
      todaySales: money(todayAgg._sum.totalRevenue ?? ZERO),
      todayVsYesterday: compare(
        money(todayAgg._sum.totalRevenue ?? ZERO),
        money(yesterdayAgg._sum.totalRevenue ?? ZERO),
      ),
      monthSales,
      monthSalesVsPrev: compare(monthSales, money(prevMonthAgg._sum.totalRevenue ?? ZERO)),
      monthCogs,
      monthGrossProfit,
      monthGrossProfitVsPrev: compare(
        monthGrossProfit,
        money(prevMonthAgg._sum.grossProfit ?? ZERO),
      ),
      monthGrossMargin,
      bankBalance: balances.bank,
      pendingDeposit: balances.cash.greaterThan(0) ? balances.cash : ZERO,
      inventoryValue: stock.totalValue,
    },
    trend,
    incomeVsSpend,
    paymentMix,
    topProducts,
    profitability,
    inventory: {
      lowStockCount: stock.lowStockCount,
      outOfStockCount: stock.outOfStockCount,
      totalValue: stock.totalValue,
      lowStock: stock.lowStock.slice(0, 6),
    },
    lastCount,
    expenseMix,
    priceMovements,
    alerts,
    activity: activity.map((log) => ({
      id: log.id,
      action: log.action,
      entityType: log.entityType,
      userName: log.user?.name ?? "—",
      createdAt: log.createdAt,
    })),
  };
}

// ---------------------------------------------------------------------------
// МЕНЕЖЕРИЙН САМБАР
// ---------------------------------------------------------------------------

/**
 * Менежерийн самбар нь ҮЙЛ АЖИЛЛАГААНЫ шинжтэй.
 * Компанийн бохир ашиг, ашгийн хувь, бүтээгдэхүүний ашигт байдал,
 * банкны нийт үлдэгдэл зэрэг эзний үзүүлэлтийг ЭНД ОГТ ТАТАХГҮЙ.
 */
export type ManagerDashboard = {
  kpi: {
    todaySales: Dec;
    todayItemsSold: Dec;
    todayCashIn: Dec;
    todayCardQrIn: Dec;
    pendingDeposit: Dec;
    lowStockCount: number;
    outOfStockCount: number;
  };
  salesTrend: { label: string; amount: number }[];
  lowStock: LowStockRow[];
  tasks: AlertRow[];
  recentOperations: {
    id: string;
    kind: "SALE" | "PURCHASE" | "EXPENSE";
    label: string;
    reference: string;
    href: string;
    amount: Dec;
    date: Date;
  }[];
};

export async function getManagerDashboard(): Promise<ManagerDashboard> {
  await requireOperator();

  const todayStart = startOfLocalDay();
  const todayEnd = endOfLocalDay();
  const trendStart = addDays(todayStart, -6);

  const [
    todayAgg,
    todayItemsAgg,
    cashInAgg,
    cardQrAgg,
    balances,
    materials,
    trendRows,
    recentSales,
    recentPurchases,
    recentExpenses,
    draftCountCount,
  ] = await Promise.all([
    prisma.saleBatch.aggregate({
      where: { status: "POSTED", date: { gte: todayStart, lt: todayEnd } },
      _sum: { totalRevenue: true, cashAmount: true },
    }),
    prisma.saleItem.aggregate({
      where: {
        saleBatch: { status: "POSTED", date: { gte: todayStart, lt: todayEnd } },
      },
      _sum: { quantity: true },
    }),
    prisma.moneyTransaction.aggregate({
      where: { type: "SALE_CASH_IN", occurredAt: { gte: todayStart, lt: todayEnd } },
      _sum: { amount: true },
    }),
    prisma.saleBatch.aggregate({
      where: { status: "POSTED", date: { gte: todayStart, lt: todayEnd } },
      _sum: { cardAmount: true, qrAmount: true },
    }),
    getAccountBalances(),
    prisma.rawMaterial.findMany({ where: { isActive: true }, select: STOCK_SELECT }),
    prisma.saleBatch.groupBy({
      by: ["date"],
      where: { status: "POSTED", date: { gte: trendStart, lt: todayEnd } },
      _sum: { totalRevenue: true },
    }),
    prisma.saleBatch.findMany({
      where: { status: "POSTED" },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 5,
      select: { id: true, batchNo: true, date: true, totalRevenue: true },
    }),
    prisma.purchase.findMany({
      where: { status: "POSTED" },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 5,
      select: { id: true, purchaseNo: true, date: true, totalAmount: true },
    }),
    prisma.expense.findMany({
      where: { status: "POSTED" },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 5,
      select: {
        id: true,
        date: true,
        amount: true,
        category: { select: { name: true } },
      },
    }),
    prisma.inventoryCount.count({ where: { status: "DRAFT" } }),
  ]);

  const stock = summariseStock(materials);

  // Сүүлийн 7 хоног — өдөр бүрийг (борлуулалтгүй өдрийг ч) харуулна.
  const revenueByDay = new Map(
    trendRows.map((row) => [localDayKey(row.date), d(row._sum.totalRevenue ?? 0).toNumber()]),
  );
  const salesTrend = Array.from({ length: 7 }, (_, index) => {
    const day = addDays(todayStart, -(6 - index));
    const key = localDayKey(day);
    return { label: key.slice(5).replace("-", "/"), amount: revenueByDay.get(key) ?? 0 };
  });

  const pendingDeposit = balances.cash.greaterThan(0) ? balances.cash : ZERO;

  const tasks: AlertRow[] = [];
  if (pendingDeposit.greaterThan(0)) {
    tasks.push({
      id: "deposit",
      tone: "warning",
      message: `${pendingDeposit.toFixed(0)} ₮ банканд тушаах шаардлагатай`,
      href: "/money",
    });
  }
  if (stock.outOfStockCount > 0) {
    tasks.push({
      id: "out-of-stock",
      tone: "danger",
      message: `${stock.outOfStockCount} бараа нөөцгүй — яаралтай нөхнө үү`,
      href: "/materials?status=low",
    });
  }
  if (stock.lowStockCount > 0) {
    tasks.push({
      id: "low-stock",
      tone: "warning",
      message: `${stock.lowStockCount} бараа доод хэмжээнээс доош орсон`,
      href: "/materials?status=low",
    });
  }
  if (draftCountCount > 0) {
    tasks.push({
      id: "draft-count",
      tone: "info",
      message: `${draftCountCount} тооллого ноорог хэвээр байна`,
      href: "/counts",
    });
  }

  const recentOperations = [
    ...recentSales.map((row) => ({
      id: `sale-${row.id}`,
      kind: "SALE" as const,
      label: "Борлуулалт",
      reference: row.batchNo,
      href: `/sales/${row.id}`,
      amount: d(row.totalRevenue),
      date: row.date,
    })),
    ...recentPurchases.map((row) => ({
      id: `purchase-${row.id}`,
      kind: "PURCHASE" as const,
      label: "Худалдан авалт",
      reference: row.purchaseNo,
      href: `/purchases/${row.id}`,
      amount: d(row.totalAmount),
      date: row.date,
    })),
    ...recentExpenses.map((row) => ({
      id: `expense-${row.id}`,
      kind: "EXPENSE" as const,
      label: "Зардал",
      reference: row.category.name,
      href: "/expenses",
      amount: d(row.amount),
      date: row.date,
    })),
  ]
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 8);

  return {
    kpi: {
      todaySales: money(todayAgg._sum.totalRevenue ?? ZERO),
      todayItemsSold: d(todayItemsAgg._sum.quantity ?? 0),
      todayCashIn: money(cashInAgg._sum.amount ?? ZERO),
      todayCardQrIn: money(
        d(cardQrAgg._sum.cardAmount ?? 0).plus(d(cardQrAgg._sum.qrAmount ?? 0)),
      ),
      pendingDeposit,
      lowStockCount: stock.lowStockCount,
      outOfStockCount: stock.outOfStockCount,
    },
    salesTrend,
    lowStock: stock.lowStock.slice(0, 8),
    tasks,
    recentOperations,
  };
}
