import type { Account, MoneyTransactionType } from "@prisma/client";
import { requirePageUser } from "@/lib/auth/guards";
import { parseDateInput } from "@/lib/dates";
import { parseRangeKey } from "@/server/services/dashboard";
import type { LedgerFilters } from "@/server/services/money-analytics";
import { OwnerMoneyView } from "./OwnerMoneyView";
import { ManagerMoneyView } from "./ManagerMoneyView";

export const metadata = { title: "Мөнгө" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  range?: string;
  from?: string;
  to?: string;
  account?: string;
  type?: string;
  direction?: string;
}>;

const ACCOUNTS = new Set(["CASH", "BANK"]);
const TYPES = new Set([
  "SALE_CASH_IN",
  "SALE_BANK_IN",
  "PURCHASE_PAYMENT_OUT",
  "EXPENSE_OUT",
  "BANK_DEPOSIT",
  "OWNER_ADJUSTMENT",
  "OTHER_IN",
  "OTHER_OUT",
]);

/** Хүсэлтийн шүүлтүүрийг найдвартай утга болгон хөрвүүлнэ. */
function parseFilters(params: Awaited<SearchParams>): LedgerFilters {
  const filters: LedgerFilters = {};
  if (params.from) filters.from = parseDateInput(params.from);
  if (params.to) filters.to = new Date(parseDateInput(params.to).getTime() + 86_400_000);
  if (params.account && ACCOUNTS.has(params.account)) filters.account = params.account as Account;
  if (params.type && TYPES.has(params.type)) filters.type = params.type as MoneyTransactionType;
  if (params.direction === "IN" || params.direction === "OUT") filters.direction = params.direction;
  return filters;
}

/**
 * "Мөнгө" хуудсыг эрхээр нь салгаж рендэрлэнэ.
 * Эзний санхүүгийн шинжилгээг менежерийн хүсэлтэд ТАТАХГҮЙ —
 * нэгтгэлийн функц бүр сервер талдаа эрхээ дахин шалгана.
 */
export default async function MoneyPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requirePageUser();
  const params = await searchParams;
  const filters = parseFilters(params);

  if (user.role === "OWNER") {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value) query.set(key, value);
    }
    // Мөнгөний хяналтад 7 хоног нь ажлын анхдагч хэмжүүр; бусад хугацаа
    // таб дээр нээлттэй хэвээр.
    return (
      <OwnerMoneyView
        rangeKey={parseRangeKey(params.range ?? "7d")}
        filters={filters}
        query={query}
      />
    );
  }

  return <ManagerMoneyView filters={filters} />;
}
