import { Prisma } from "@prisma/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Card, CardHeader } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { EmptyRow, Table, Td, Th, Tr } from "@/components/ui/Table";
import { DateFilter, FilterBar, FilterSelect } from "@/components/ui/SearchFilters";
import { requirePageUser } from "@/lib/auth/guards";
import { d } from "@/lib/decimal";
import { formatDate, formatDateTime, formatMoney, toDateInput } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { endOfLocalDay, parseDateInput, startOfLocalDay } from "@/lib/dates";
import { ACCOUNT_LABEL, getAccountBalances, MONEY_TYPE_LABEL } from "@/server/services/money";
import { BankDepositButton, MoneyAdjustmentButton } from "./MoneyClient";

export const metadata = { title: "Мөнгө | Начин ERP" };

type SearchParams = Promise<{ from?: string; to?: string; type?: string }>;

export default async function MoneyPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requirePageUser();
  const params = await searchParams;

  const where: Prisma.MoneyTransactionWhereInput = {};
  if (params.from || params.to) {
    where.occurredAt = {};
    if (params.from) where.occurredAt.gte = parseDateInput(params.from);
    if (params.to) where.occurredAt.lt = new Date(parseDateInput(params.to).getTime() + 86400000);
  }
  if (params.type) where.type = params.type as Prisma.MoneyTransactionWhereInput["type"];

  const todayStart = startOfLocalDay();
  const todayEnd = endOfLocalDay();

  const [balances, transactions, todayCash, todayDeposits] = await Promise.all([
    getAccountBalances(),
    prisma.moneyTransaction.findMany({
      where,
      include: { createdBy: { select: { name: true } } },
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
      take: 200,
    }),
    prisma.moneyTransaction.aggregate({
      where: { type: "SALE_CASH_IN", occurredAt: { gte: todayStart, lt: todayEnd } },
      _sum: { amount: true },
    }),
    prisma.moneyTransaction.aggregate({
      where: { type: "BANK_DEPOSIT", occurredAt: { gte: todayStart, lt: todayEnd } },
      _sum: { amount: true },
    }),
  ]);

  const pending = balances.cash.greaterThan(0) ? balances.cash : d(0);

  return (
    <>
      <PageHeader
        title="Мөнгө"
        description="Касс болон банкны үлдэгдэл гүйлгээний дэвтрээс бодогдоно."
        action={
          <>
            {user.role === "OWNER" ? <MoneyAdjustmentButton today={toDateInput(new Date())} /> : null}
            <BankDepositButton pendingAmount={pending.toFixed(0)} today={toDateInput(new Date())} />
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Банкны үлдэгдэл" value={formatMoney(balances.bank)} />
        <StatCard label="Кассын үлдэгдэл" value={formatMoney(balances.cash)} />
        <StatCard
          label="Маргааш банканд тушаах"
          value={formatMoney(pending)}
          tone={pending.greaterThan(0) ? "warning" : "default"}
          hint="Кассд байгаа бүх бэлэн мөнгө"
        />
        <StatCard
          label="Өнөөдрийн бэлэн орлого"
          value={formatMoney(todayCash._sum.amount ?? 0)}
          hint={`Өнөөдөр тушаасан: ${formatMoney(todayDeposits._sum.amount ?? 0)}`}
        />
      </div>

      <FilterBar>
        <DateFilter paramKey="from" label="Эхлэх огноо" />
        <DateFilter paramKey="to" label="Дуусах огноо" />
        <FilterSelect
          paramKey="type"
          label="Гүйлгээний төрөл"
          options={Object.entries(MONEY_TYPE_LABEL).map(([value, label]) => ({ value, label }))}
        />
      </FilterBar>

      <Card>
        <CardHeader title="Мөнгөн гүйлгээний дэвтэр" description="Сүүлийн 200 бичлэг" />
        <Table>
          <thead>
            <tr>
              <Th>Огноо</Th>
              <Th>Төрөл</Th>
              <Th>Гарсан</Th>
              <Th>Орсон</Th>
              <Th align="right">Дүн</Th>
              <Th>Тайлбар</Th>
              <Th>Бүртгэсэн</Th>
            </tr>
          </thead>
          <tbody>
            {transactions.length === 0 ? (
              <EmptyRow colSpan={7}>Гүйлгээ бүртгэгдээгүй байна.</EmptyRow>
            ) : (
              transactions.map((txn) => (
                <Tr key={txn.id}>
                  <Td className="whitespace-nowrap">{formatDate(txn.occurredAt)}</Td>
                  <Td>{MONEY_TYPE_LABEL[txn.type]}</Td>
                  <Td>
                    {txn.sourceAccount ? (
                      <Badge tone="danger">{ACCOUNT_LABEL[txn.sourceAccount]}</Badge>
                    ) : (
                      <span className="text-ink-300">-</span>
                    )}
                  </Td>
                  <Td>
                    {txn.destinationAccount ? (
                      <Badge tone="success">{ACCOUNT_LABEL[txn.destinationAccount]}</Badge>
                    ) : (
                      <span className="text-ink-300">-</span>
                    )}
                  </Td>
                  <Td align="right" className="font-medium">
                    {formatMoney(txn.amount)}
                  </Td>
                  <Td className="text-ink-500">{txn.note ?? "-"}</Td>
                  <Td className="whitespace-nowrap text-xs text-ink-400">
                    {txn.createdBy.name}
                    <br />
                    {formatDateTime(txn.createdAt)}
                  </Td>
                </Tr>
              ))
            )}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
