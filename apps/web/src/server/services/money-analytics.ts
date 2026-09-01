import "server-only";
import { Prisma, type Account, type MoneyTransactionType } from "@prisma/client";
import { d, money, ZERO, type Dec } from "@/lib/decimal";
import {
  addDays,
  endOfLocalDay,
  localDayKey,
  OFFSET_HOURS,
  startOfLocalDay,
  startOfLocalMonth,
  startOfNextLocalMonth,
} from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { requireOperator, requireOwner } from "@/lib/auth/guards";
import { getAccountBalances } from "./money";
import { resolveRange, type RangeKey } from "./dashboard";

/**
 * "Мөнгө" хуудасны УНШИХ талын нэгтгэлүүд.
 *
 * Дэвтрийн утга санааг ӨӨРЧЛӨХГҮЙ: үлдэгдэл нь MoneyTransaction-оос
 * л гарна, энд ямар ч бичилт хийхгүй.
 *
 * Эзэн ба менежер өөр өөр хэмжээний мэдээлэл авна — менежерийн
 * хүсэлтэд банкны үлдэгдэл, мөнгөн урсгалын шинжилгээг ТАТАХГҮЙ.
 */

// ---------------------------------------------------------------------------
// Хуваалцсан төрлүүд
// ---------------------------------------------------------------------------

/**
 * SQL доторх орон нутгийн өдрийн шилжилт. dates.ts-тэй ижил тохиргоог
 * ашиглана — эс тэгвэл график ба картын тоо өөр өдрөөр бүлэглэгдэнэ.
 */
const TZ_SHIFT = Prisma.sql`interval '1 hour' * ${OFFSET_HOURS}`;

export type FlowDay = {
  key: string;
  label: string;
  inflow: number;
  outflow: number;
  net: number;
};

export type BalancePoint = {
  key: string;
  label: string;
  cash: number;
  bank: number;
};

export type PeriodFlow = { inflow: Dec; outflow: Dec; net: Dec };

export type LedgerRow = {
  id: string;
  occurredAt: Date;
  createdAt: Date;
  type: MoneyTransactionType;
  amount: Dec;
  /** Тухайн данснаас харсан чиглэл. */
  direction: "IN" | "OUT" | "TRANSFER";
  sourceAccount: Account | null;
  destinationAccount: Account | null;
  referenceType: string;
  referenceId: string | null;
  note: string | null;
  createdByName: string;
};

export type DepositRow = {
  id: string;
  occurredAt: Date;
  amount: Dec;
  note: string | null;
  createdByName: string;
};

/** Дэвтрийн мөрийг данснаас нь хамааруулж орлого / зарлага болгож ангилна. */
function directionOf(
  source: Account | null,
  destination: Account | null,
): LedgerRow["direction"] {
  if (source && destination) return "TRANSFER";
  return destination ? "IN" : "OUT";
}

function toLedgerRow(txn: {
  id: string;
  occurredAt: Date;
  createdAt: Date;
  type: MoneyTransactionType;
  amount: Prisma.Decimal;
  sourceAccount: Account | null;
  destinationAccount: Account | null;
  referenceType: string;
  referenceId: string | null;
  note: string | null;
  createdBy: { name: string };
}): LedgerRow {
  return {
    id: txn.id,
    occurredAt: txn.occurredAt,
    createdAt: txn.createdAt,
    type: txn.type,
    amount: d(txn.amount),
    direction: directionOf(txn.sourceAccount, txn.destinationAccount),
    sourceAccount: txn.sourceAccount,
    destinationAccount: txn.destinationAccount,
    referenceType: txn.referenceType,
    referenceId: txn.referenceId,
    note: txn.note,
    createdByName: txn.createdBy.name,
  };
}

const LEDGER_SELECT = {
  id: true,
  occurredAt: true,
  createdAt: true,
  type: true,
  amount: true,
  sourceAccount: true,
  destinationAccount: true,
  referenceType: true,
  referenceId: true,
  note: true,
  createdBy: { select: { name: true } },
} as const;

// ---------------------------------------------------------------------------
// Нэгтгэлүүд
// ---------------------------------------------------------------------------

/**
 * Хугацааны орлого / зарлага. Данс хооронд шилжсэн гүйлгээ (банкны
 * тушаалт) нь компанийн хувьд шинэ мөнгө биш тул ГАДААД урсгалд
 * тооцохгүй — эх ба хүрэх данс хоёулаа байвал алгасна.
 */
async function flowTotals(from: Date, to: Date): Promise<PeriodFlow> {
  const [inflow, outflow] = await Promise.all([
    prisma.moneyTransaction.aggregate({
      where: {
        occurredAt: { gte: from, lt: to },
        destinationAccount: { not: null },
        sourceAccount: null,
      },
      _sum: { amount: true },
    }),
    prisma.moneyTransaction.aggregate({
      where: {
        occurredAt: { gte: from, lt: to },
        sourceAccount: { not: null },
        destinationAccount: null,
      },
      _sum: { amount: true },
    }),
  ]);

  const inAmount = money(inflow._sum.amount ?? ZERO);
  const outAmount = money(outflow._sum.amount ?? ZERO);
  return { inflow: inAmount, outflow: outAmount, net: money(inAmount.minus(outAmount)) };
}

/** Өдөр тутмын мөнгөн урсгал — нэг SQL нэгтгэлээр. */
async function getCashFlowByDay(from: Date, to: Date): Promise<FlowDay[]> {
  const rows = await prisma.$queryRaw<
    { day: Date; inflow: Prisma.Decimal; outflow: Prisma.Decimal }[]
  >(Prisma.sql`
    SELECT
      date_trunc('day', "occurredAt" + ${TZ_SHIFT}) - ${TZ_SHIFT} AS day,
      COALESCE(SUM("amount") FILTER (
        WHERE "destinationAccount" IS NOT NULL AND "sourceAccount" IS NULL), 0) AS inflow,
      COALESCE(SUM("amount") FILTER (
        WHERE "sourceAccount" IS NOT NULL AND "destinationAccount" IS NULL), 0) AS outflow
    FROM "MoneyTransaction"
    WHERE "occurredAt" >= ${from} AND "occurredAt" < ${to}
    GROUP BY 1
    ORDER BY 1
  `);

  const byDay = new Map(
    rows.map((row) => [
      localDayKey(row.day),
      { inflow: d(row.inflow).toNumber(), outflow: d(row.outflow).toNumber() },
    ]),
  );

  // Гүйлгээгүй өдрийг ч тэгээр харуулна — график тасалдахгүй.
  const days: FlowDay[] = [];
  for (let cursor = startOfLocalDay(from); cursor < to; cursor = addDays(cursor, 1)) {
    const key = localDayKey(cursor);
    const row = byDay.get(key) ?? { inflow: 0, outflow: 0 };
    days.push({
      key,
      label: key.slice(5).replace("-", "/"),
      inflow: row.inflow,
      outflow: row.outflow,
      net: row.inflow - row.outflow,
    });
  }
  return days;
}

/**
 * Касс / банкны түүхэн үлдэгдэл.
 *
 * Дэвтэр нь мөнгөний ЦОРЫН ГАНЦ эх сурвалж (нээлтийн үлдэгдэл ч
 * OWNER_ADJUSTMENT бичилтээр орсон) тул хугацааны эхлэл хүртэлх
 * хуримтлалыг нэмээд өдөр бүрийн үлдэгдлийг нарийн сэргээж болно.
 */
async function getRunningBalances(from: Date, to: Date): Promise<BalancePoint[]> {
  const [opening, rows] = await Promise.all([
    // Хугацааны өмнөх бүх гүйлгээний цэвэр дүн = нээлтийн үлдэгдэл.
    prisma.$queryRaw<{ cash: Prisma.Decimal; bank: Prisma.Decimal }[]>(Prisma.sql`
      SELECT
        COALESCE(SUM(CASE WHEN "destinationAccount" = 'CASH' THEN "amount" ELSE 0 END)
               - SUM(CASE WHEN "sourceAccount"      = 'CASH' THEN "amount" ELSE 0 END), 0) AS cash,
        COALESCE(SUM(CASE WHEN "destinationAccount" = 'BANK' THEN "amount" ELSE 0 END)
               - SUM(CASE WHEN "sourceAccount"      = 'BANK' THEN "amount" ELSE 0 END), 0) AS bank
      FROM "MoneyTransaction"
      WHERE "occurredAt" < ${from}
    `),
    prisma.$queryRaw<{ day: Date; cash: Prisma.Decimal; bank: Prisma.Decimal }[]>(Prisma.sql`
      SELECT
        date_trunc('day', "occurredAt" + ${TZ_SHIFT}) - ${TZ_SHIFT} AS day,
        COALESCE(SUM(CASE WHEN "destinationAccount" = 'CASH' THEN "amount" ELSE 0 END)
               - SUM(CASE WHEN "sourceAccount"      = 'CASH' THEN "amount" ELSE 0 END), 0) AS cash,
        COALESCE(SUM(CASE WHEN "destinationAccount" = 'BANK' THEN "amount" ELSE 0 END)
               - SUM(CASE WHEN "sourceAccount"      = 'BANK' THEN "amount" ELSE 0 END), 0) AS bank
      FROM "MoneyTransaction"
      WHERE "occurredAt" >= ${from} AND "occurredAt" < ${to}
      GROUP BY 1
      ORDER BY 1
    `),
  ]);

  const deltas = new Map(
    rows.map((row) => [localDayKey(row.day), { cash: d(row.cash), bank: d(row.bank) }]),
  );

  let cash = d(opening[0]?.cash ?? 0);
  let bank = d(opening[0]?.bank ?? 0);
  const points: BalancePoint[] = [];

  for (let cursor = startOfLocalDay(from); cursor < to; cursor = addDays(cursor, 1)) {
    const key = localDayKey(cursor);
    const delta = deltas.get(key);
    if (delta) {
      cash = cash.plus(delta.cash);
      bank = bank.plus(delta.bank);
    }
    points.push({
      key,
      label: key.slice(5).replace("-", "/"),
      cash: money(cash).toNumber(),
      bank: money(bank).toNumber(),
    });
  }

  return points;
}

// ---------------------------------------------------------------------------
// Дэвтрийн шүүлтүүр
// ---------------------------------------------------------------------------

/**
 * Дэвтрийн хуудсанд харуулах мөрийн тоо. Энэ хуудас нь санхүүгийн
 * хяналтын самбар болохоос гүйлгээний бүрэн жагсаалт биш — дэлгэрэнгүйг
 * огноо / данс / төрлийн шүүлтүүрээр нарийсгана.
 */
const LEDGER_PAGE_SIZE = 25;

export type LedgerFilters = {
  from?: Date;
  to?: Date;
  account?: Account;
  type?: MoneyTransactionType;
  direction?: "IN" | "OUT";
};

function buildLedgerWhere(filters: LedgerFilters): Prisma.MoneyTransactionWhereInput {
  const where: Prisma.MoneyTransactionWhereInput = {};

  if (filters.from || filters.to) {
    where.occurredAt = {};
    if (filters.from) where.occurredAt.gte = filters.from;
    if (filters.to) where.occurredAt.lt = filters.to;
  }
  if (filters.type) where.type = filters.type;

  // Данс — тухайн данс оролцсон бүх гүйлгээ (орсон ч, гарсан ч).
  if (filters.account) {
    where.OR = [
      { sourceAccount: filters.account },
      { destinationAccount: filters.account },
    ];
  }

  // Чиглэл — данс хоорондын шилжүүлгийг аль нэг тал руу тооцохгүй.
  if (filters.direction === "IN") {
    where.destinationAccount = { not: null };
    where.sourceAccount = null;
  } else if (filters.direction === "OUT") {
    where.sourceAccount = { not: null };
    where.destinationAccount = null;
  }

  return where;
}

// ---------------------------------------------------------------------------
// ЭЗНИЙ ХАРАГДАЦ
// ---------------------------------------------------------------------------

export type OwnerMoneyView = {
  rangeKey: RangeKey;
  balances: { cash: Dec; bank: Dec; pendingDeposit: Dec; totalAvailable: Dec };
  today: PeriodFlow;
  month: PeriodFlow;
  range: PeriodFlow;
  flow: FlowDay[];
  balanceHistory: BalancePoint[];
  recentDeposits: DepositRow[];
  /** Одоо кассд байгаа мөнгө хамгийн сүүлд хэзээнээс хойш хуримтлагдсан. */
  pendingSince: Date | null;
  ledger: LedgerRow[];
  ledgerTotals: { inflow: Dec; outflow: Dec; count: number };
};

/** ЭЗНИЙ бүрэн санхүүгийн харагдац. Эрхээ өөрөө шалгана. */
export async function getOwnerMoneyView(
  rangeKey: RangeKey,
  filters: LedgerFilters,
): Promise<OwnerMoneyView> {
  await requireOwner();

  const { current } = resolveRange(rangeKey);
  const todayStart = startOfLocalDay();
  const todayEnd = endOfLocalDay();
  const monthStart = startOfLocalMonth();
  const monthEnd = startOfNextLocalMonth();
  const where = buildLedgerWhere(filters);

  const [
    balances,
    today,
    month,
    range,
    flow,
    balanceHistory,
    deposits,
    lastDeposit,
    ledger,
    inflowAgg,
    outflowAgg,
    ledgerCount,
  ] = await Promise.all([
    getAccountBalances(),
    flowTotals(todayStart, todayEnd),
    flowTotals(monthStart, monthEnd),
    flowTotals(current.from, current.to),
    getCashFlowByDay(current.from, current.to),
    getRunningBalances(current.from, current.to),
    prisma.moneyTransaction.findMany({
      where: { type: "BANK_DEPOSIT" },
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
      take: 5,
      select: { id: true, occurredAt: true, amount: true, note: true, createdBy: { select: { name: true } } },
    }),
    prisma.moneyTransaction.findFirst({
      where: { type: "BANK_DEPOSIT" },
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
      select: { occurredAt: true },
    }),
    prisma.moneyTransaction.findMany({
      where,
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
      take: LEDGER_PAGE_SIZE,
      select: LEDGER_SELECT,
    }),
    prisma.moneyTransaction.aggregate({
      where: { ...where, destinationAccount: { not: null }, sourceAccount: null },
      _sum: { amount: true },
    }),
    prisma.moneyTransaction.aggregate({
      where: { ...where, sourceAccount: { not: null }, destinationAccount: null },
      _sum: { amount: true },
    }),
    prisma.moneyTransaction.count({ where }),
  ]);

  const pendingDeposit = balances.cash.greaterThan(0) ? balances.cash : ZERO;

  return {
    rangeKey,
    balances: {
      cash: balances.cash,
      bank: balances.bank,
      pendingDeposit,
      // Боломжит мөнгө = банк + касс. Өглөгийг ХАСАХГҮЙ.
      totalAvailable: money(balances.bank.plus(balances.cash)),
    },
    today,
    month,
    range,
    flow,
    balanceHistory,
    recentDeposits: deposits.map((row) => ({
      id: row.id,
      occurredAt: row.occurredAt,
      amount: d(row.amount),
      note: row.note,
      createdByName: row.createdBy.name,
    })),
    pendingSince: lastDeposit?.occurredAt ?? null,
    ledger: ledger.map(toLedgerRow),
    ledgerTotals: {
      inflow: money(inflowAgg._sum.amount ?? ZERO),
      outflow: money(outflowAgg._sum.amount ?? ZERO),
      count: ledgerCount,
    },
  };
}

// ---------------------------------------------------------------------------
// МЕНЕЖЕРИЙН ХАРАГДАЦ
// ---------------------------------------------------------------------------

/**
 * Менежерт ЗӨВХӨН өдөр тутмын кассын ажилд шаардлагатай мэдээлэл.
 * Банкны үлдэгдэл, мөнгөн урсгалын шинжилгээ, түүхэн үлдэгдэл ЭНД
 * ОГТ УНШИГДАХГҮЙ (UI дээр нуух биш — өгөгдөл нь ирэхгүй).
 */
export type ManagerMoneyView = {
  todayCashIn: Dec;
  todayCardQrIn: Dec;
  todayDeposited: Dec;
  pendingDeposit: Dec;
  pendingSince: Date | null;
  recentDeposits: DepositRow[];
  /** Зөвхөн КАССЫН гүйлгээ. */
  cashLedger: LedgerRow[];
};

export async function getManagerMoneyView(filters: LedgerFilters): Promise<ManagerMoneyView> {
  await requireOperator();

  const todayStart = startOfLocalDay();
  const todayEnd = endOfLocalDay();

  const cashOnly: Prisma.MoneyTransactionWhereInput = {
    ...buildLedgerWhere({ ...filters, account: "CASH" }),
  };

  const [balances, cashInAgg, cardQrAgg, depositedAgg, deposits, lastDeposit, cashLedger] =
    await Promise.all([
      getAccountBalances(),
      prisma.moneyTransaction.aggregate({
        where: { type: "SALE_CASH_IN", occurredAt: { gte: todayStart, lt: todayEnd } },
        _sum: { amount: true },
      }),
      prisma.saleBatch.aggregate({
        where: { status: "POSTED", date: { gte: todayStart, lt: todayEnd } },
        _sum: { cardAmount: true, qrAmount: true },
      }),
      prisma.moneyTransaction.aggregate({
        where: { type: "BANK_DEPOSIT", occurredAt: { gte: todayStart, lt: todayEnd } },
        _sum: { amount: true },
      }),
      prisma.moneyTransaction.findMany({
        where: { type: "BANK_DEPOSIT" },
        orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
        take: 5,
        select: { id: true, occurredAt: true, amount: true, note: true, createdBy: { select: { name: true } } },
      }),
      prisma.moneyTransaction.findFirst({
        where: { type: "BANK_DEPOSIT" },
        orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
        select: { occurredAt: true },
      }),
      prisma.moneyTransaction.findMany({
        where: cashOnly,
        orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
        take: LEDGER_PAGE_SIZE,
        select: LEDGER_SELECT,
      }),
    ]);

  return {
    todayCashIn: money(cashInAgg._sum.amount ?? ZERO),
    todayCardQrIn: money(
      d(cardQrAgg._sum.cardAmount ?? 0).plus(d(cardQrAgg._sum.qrAmount ?? 0)),
    ),
    todayDeposited: money(depositedAgg._sum.amount ?? ZERO),
    // Тушаах мөнгө = кассын үлдэгдэл. Банкны үлдэгдлийг буцаахгүй.
    pendingDeposit: balances.cash.greaterThan(0) ? balances.cash : ZERO,
    pendingSince: lastDeposit?.occurredAt ?? null,
    recentDeposits: deposits.map((row) => ({
      id: row.id,
      occurredAt: row.occurredAt,
      amount: d(row.amount),
      note: row.note,
      createdByName: row.createdBy.name,
    })),
    cashLedger: cashLedger.map(toLedgerRow),
  };
}
