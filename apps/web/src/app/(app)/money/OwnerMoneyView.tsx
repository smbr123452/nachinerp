import Link from "next/link";
import { ArrowRight, Banknote, Info, Landmark, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { CashFlowChart } from "@/components/ui/CashFlowChart";
import { CompositionBars } from "@/components/ui/CompositionBars";
import { LineChart } from "@/components/ui/LineChart";
import { StatCard } from "@/components/ui/StatCard";
import { EmptyRow, Table, Td, Th, Tr } from "@/components/ui/Table";
import { Tabs } from "@/components/ui/Tabs";
import { DateFilter, FilterBar, FilterSelect } from "@/components/ui/SearchFilters";
import { formatDate, formatMoney, toDateInput } from "@/lib/format";
import { ACCOUNT_LABEL, MONEY_TYPE_LABEL } from "@/server/services/money";
import { RANGE_KEYS, RANGE_LABEL, type RangeKey } from "@/server/services/dashboard";
import {
  getOwnerMoneyView,
  type LedgerFilters,
} from "@/server/services/money-analytics";
import { PayablesSection, type PayableParams } from "./PayablesSection";
import { BankDepositButton, MoneyAdjustmentButton } from "./MoneyClient";
import { LedgerTable } from "./LedgerTable";

/** Хугацааны нэгтгэлийн жижиг мөр. */
function FlowSummary({
  title,
  inflow,
  outflow,
  net,
}: {
  title: string;
  inflow: string;
  outflow: string;
  net: string;
}) {
  const negative = net.trim().startsWith("-");
  return (
    <div className="rounded-lg border border-ink-200 bg-white p-4">
      <p className="text-[13px] font-medium text-ink-500">{title}</p>
      <dl className="mt-2.5 space-y-1.5">
        <div className="flex items-baseline justify-between gap-3 text-[13px]">
          <dt className="text-ink-500">Орлого</dt>
          <dd className="tabular font-medium text-emerald-700">{inflow}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3 text-[13px]">
          <dt className="text-ink-500">Зарлага</dt>
          <dd className="tabular font-medium text-red-700">{outflow}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3 border-t border-ink-100 pt-1.5 text-[13px]">
          <dt className="font-medium text-ink-700">Цэвэр урсгал</dt>
          <dd className={`tabular font-semibold ${negative ? "text-red-700" : "text-ink-900"}`}>
            {net}
          </dd>
        </div>
      </dl>
    </div>
  );
}

/** ЭЗНИЙ бүрэн санхүүгийн байдлын харагдац. */
export async function OwnerMoneyView({
  rangeKey,
  filters,
  query,
  payableParams,
}: {
  rangeKey: RangeKey;
  filters: LedgerFilters;
  query: URLSearchParams;
  payableParams: PayableParams;
}) {
  const data = await getOwnerMoneyView(rangeKey, filters);
  const today = toDateInput(new Date());

  const rangeHref = (key: string) => {
    const next = new URLSearchParams(query);
    next.set("range", key);
    return `/money?${next.toString()}`;
  };

  return (
    <>
      <PageHeader
        title="Мөнгө"
        description="Бүх үлдэгдэл, урсгал нь мөнгөн гүйлгээний дэвтрээс бодогдоно."
        action={
          <>
            <MoneyAdjustmentButton today={today} />
            <BankDepositButton pendingAmount={data.balances.pendingDeposit.toFixed(0)} today={today} />
          </>
        }
      />

      {/* Санхүүгийн байдал */}
      <section className="mb-3 grid auto-rows-fr gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          emphasis
          label="Нийт бэлэн боломжит мөнгө"
          value={formatMoney(data.balances.totalAvailable)}
          hint="Банк + Касс"
          icon={<Wallet />}
          tone="brand"
        />
        <StatCard label="Банкны үлдэгдэл" value={formatMoney(data.balances.bank)} icon={<Landmark />} />
        <StatCard
          label="Кассын үлдэгдэл"
          value={formatMoney(data.balances.cash)}
          tone={data.balances.cash.isNegative() ? "negative" : "default"}
          hint={data.balances.cash.isNegative() ? "Дэвтрээр хасах гарсан — тулгалт шаардлагатай" : undefined}
          icon={<Banknote />}
        />
        <StatCard
          label="Банканд тушаах мөнгө"
          value={formatMoney(data.balances.pendingDeposit)}
          tone={data.balances.pendingDeposit.greaterThan(0) ? "warning" : "default"}
          hint={
            data.pendingSince
              ? `Сүүлийн тушаалт: ${formatDate(data.pendingSince)}`
              : "Тушаалт хийгдээгүй"
          }
          icon={<Landmark />}
        />
      </section>

      {/* Өнөөдөр / энэ сар */}
      <section className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <FlowSummary
          title="Өнөөдөр"
          inflow={formatMoney(data.today.inflow)}
          outflow={formatMoney(data.today.outflow)}
          net={formatMoney(data.today.net)}
        />
        <FlowSummary
          title="Энэ сар"
          inflow={formatMoney(data.month.inflow)}
          outflow={formatMoney(data.month.outflow)}
          net={formatMoney(data.month.net)}
        />
        <FlowSummary
          title={RANGE_LABEL[rangeKey]}
          inflow={formatMoney(data.range.inflow)}
          outflow={formatMoney(data.range.outflow)}
          net={formatMoney(data.range.net)}
        />
      </section>

      <div className="mb-4">
        <Tabs
          active={rangeKey}
          items={RANGE_KEYS.map((key) => ({
            key,
            label: RANGE_LABEL[key],
            href: rangeHref(key),
          }))}
        />
      </div>

      <Card className="mb-4">
        <CardHeader
          title="Мөнгөний урсгал"
          description={`${RANGE_LABEL[rangeKey]} · орсон, гарсан, цэвэр урсгал`}
        />
        <CardBody>
          <CashFlowChart data={data.flow} />
          <p className="mt-3 text-xs leading-5 text-ink-500">
            Данс хооронд шилжсэн мөнгө (банкны тушаалт) нь шинэ орлого, зарлага биш тул
            урсгалд тооцоогүй.
          </p>
        </CardBody>
      </Card>

      <div className="mb-4 grid items-start gap-3 xl:grid-cols-3">
        <Card>
          <CardHeader title="Мөнгөний бүтэц" description="Данс тус бүрийн одоогийн байдал" />
          <CardBody>
            <CompositionBars
              rows={[
                { key: "bank", label: "Банк", amount: data.balances.bank.toNumber() },
                { key: "cash", label: "Касс", amount: data.balances.cash.toNumber() },
                {
                  key: "pending",
                  label: "Банканд тушаах",
                  amount: data.balances.pendingDeposit.toNumber(),
                  note: "кассын дотор",
                  subset: true,
                },
              ]}
            />
            <p className="mt-4 border-t border-ink-100 pt-3 text-xs leading-5 text-ink-500">
              &quot;Банканд тушаах&quot; нь кассын үлдэгдлийн нэг хэсэг тул нийт дүнд давхар
              тооцогдохгүй.
            </p>
          </CardBody>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader
            title="Касс ба банкны хөдөлгөөн"
            description={`${RANGE_LABEL[rangeKey]} · өдөр бүрийн эцсийн үлдэгдэл`}
          />
          <CardBody>
            <LineChart
              height={240}
              labels={data.balanceHistory.map((row) => row.label)}
              series={[
                { key: "bank", label: "Банк", values: data.balanceHistory.map((r) => r.bank) },
                { key: "cash", label: "Касс", values: data.balanceHistory.map((r) => r.cash) },
              ]}
            />
          </CardBody>
        </Card>
      </div>

      {/* Нийлүүлэгчийн өглөг. Мөнгөн байр суурийг өрөөр нь тохируулж харуулна —
          цэвэр ашиг БИШ. Ашгийн тооцоо огт өөрчлөгдөөгүй. */}
      <PayablesSection
        cash={data.balances.cash}
        bank={data.balances.bank}
        params={payableParams}
      />

      <div className="mb-4 grid items-start gap-3 xl:grid-cols-3">
        <Card>
          <CardHeader
            title="Сүүлийн банкны тушаалт"
            description="Кассаас банк руу шилжүүлсэн"
          />
          <Table>
            <thead>
              <tr>
                <Th>Огноо</Th>
                <Th align="right">Дүн</Th>
                <Th>Бүртгэсэн</Th>
              </tr>
            </thead>
            <tbody>
              {data.recentDeposits.length === 0 ? (
                <EmptyRow colSpan={3} icon={<Landmark />}>
                  Тушаалт хийгдээгүй байна.
                </EmptyRow>
              ) : (
                data.recentDeposits.map((row) => (
                  <Tr key={row.id}>
                    <Td muted className="whitespace-nowrap">
                      {formatDate(row.occurredAt)}
                    </Td>
                    <Td align="right" className="font-medium text-ink-900">
                      {formatMoney(row.amount)}
                    </Td>
                    <Td muted>{row.createdByName}</Td>
                  </Tr>
                ))
              )}
            </tbody>
          </Table>
        </Card>

        <Card className="xl:col-span-2">
          <CardBody className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-ink-500">Банканд тушаах мөнгө</p>
              <p className="tabular mt-1 text-kpi font-semibold text-ink-900">
                {formatMoney(data.balances.pendingDeposit)}
              </p>
              <p className="mt-1.5 text-xs leading-5 text-ink-500">
                Өдрийн бэлэн орлогыг маргааш нь банканд тушаах журамтай. Энэ дүн нь кассын
                одоогийн үлдэгдэлтэй тэнцүү.
              </p>
            </div>
            <BankDepositButton
              pendingAmount={data.balances.pendingDeposit.toFixed(0)}
              today={today}
            />
          </CardBody>
        </Card>
      </div>

      {/* Дэвтэр */}
      <FilterBar>
        <DateFilter paramKey="from" label="Эхлэх огноо" />
        <DateFilter paramKey="to" label="Дуусах огноо" />
        <FilterSelect
          paramKey="account"
          label="Данс"
          options={Object.entries(ACCOUNT_LABEL).map(([value, label]) => ({ value, label }))}
        />
        <FilterSelect
          paramKey="direction"
          label="Чиглэл"
          options={[
            { value: "IN", label: "Орлого" },
            { value: "OUT", label: "Зарлага" },
          ]}
        />
        <FilterSelect
          paramKey="type"
          label="Гүйлгээний төрөл"
          options={Object.entries(MONEY_TYPE_LABEL).map(([value, label]) => ({ value, label }))}
        />
      </FilterBar>

      <Card>
        <CardHeader
          title="Мөнгөн гүйлгээний дэвтэр"
          description={`Шүүлтэд ${data.ledgerTotals.count} гүйлгээ · сүүлийн ${data.ledger.length} харагдана`}
          action={
            <div className="flex flex-wrap items-center gap-4 text-[13px]">
              <span className="flex items-center gap-1.5">
                <TrendingUp aria-hidden className="h-3.5 w-3.5 text-emerald-600" />
                <span className="tabular font-medium text-emerald-700">
                  {formatMoney(data.ledgerTotals.inflow)}
                </span>
              </span>
              <span className="flex items-center gap-1.5">
                <TrendingDown aria-hidden className="h-3.5 w-3.5 text-red-600" />
                <span className="tabular font-medium text-red-700">
                  {formatMoney(data.ledgerTotals.outflow)}
                </span>
              </span>
            </div>
          }
        />
        <LedgerTable rows={data.ledger} emptyText="Шүүлтэд тохирох гүйлгээ олдсонгүй." />
        {data.ledgerTotals.count > data.ledger.length ? (
          <CardBody className="border-t border-ink-200">
            <p className="flex items-center gap-2 text-[13px] text-ink-500">
              <Info aria-hidden className="h-4 w-4 shrink-0 text-ink-400" />
              Шүүлтэд {data.ledgerTotals.count} гүйлгээ байгаагаас сүүлийн {data.ledger.length}-г
              харуулав. Бүрэн жагсаалтыг огнооны шүүлтүүрээр нарийсгана уу.
              <Link href="/reports" className="font-medium text-brand-600 hover:underline">
                Тайлан
                <ArrowRight aria-hidden className="ml-1 inline h-3.5 w-3.5" />
              </Link>
            </p>
          </CardBody>
        ) : null}
      </Card>
    </>
  );
}
