import { Banknote, CreditCard, Landmark } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { EmptyRow, Table, Td, Th, Tr } from "@/components/ui/Table";
import { DateFilter, FilterBar, FilterSelect } from "@/components/ui/SearchFilters";
import { formatDate, formatMoney, toDateInput } from "@/lib/format";
import { MONEY_TYPE_LABEL } from "@/server/services/money";
import { getManagerMoneyView, type LedgerFilters } from "@/server/services/money-analytics";
import { BankDepositButton } from "./MoneyClient";
import { LedgerTable } from "./LedgerTable";

/**
 * МЕНЕЖЕРИЙН харагдац — өдөр тутмын кассын ажилд шаардлагатай хэсэг.
 * Банкны үлдэгдэл, мөнгөн урсгалын шинжилгээ, түүхэн үлдэгдэл ЭНД
 * ирэхгүй (сервер талд огт уншигдахгүй).
 */
export async function ManagerMoneyView({ filters }: { filters: LedgerFilters }) {
  const data = await getManagerMoneyView(filters);
  const today = toDateInput(new Date());

  return (
    <>
      <PageHeader
        title="Мөнгө"
        description="Өдрийн бэлэн орлого болон банкны тушаалт."
        action={
          <BankDepositButton pendingAmount={data.pendingDeposit.toFixed(0)} today={today} />
        }
      />

      <section className="mb-6 grid auto-rows-fr gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          emphasis
          label="Банканд тушаах мөнгө"
          value={formatMoney(data.pendingDeposit)}
          tone={data.pendingDeposit.greaterThan(0) ? "warning" : "brand"}
          hint={
            data.pendingSince
              ? `Сүүлийн тушаалт: ${formatDate(data.pendingSince)}`
              : "Тушаалт хийгдээгүй"
          }
          icon={<Landmark />}
        />
        <StatCard
          label="Өнөөдрийн бэлэн орлого"
          value={formatMoney(data.todayCashIn)}
          icon={<Banknote />}
        />
        <StatCard
          label="Өнөөдрийн карт / QR"
          value={formatMoney(data.todayCardQrIn)}
          hint="Шууд банканд орсон"
          icon={<CreditCard />}
        />
        <StatCard
          label="Өнөөдөр тушаасан"
          value={formatMoney(data.todayDeposited)}
          icon={<Landmark />}
        />
      </section>

      <div className="mb-4 grid items-start gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardBody className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-body font-medium text-ink-500">Банканд тушаах мөнгө</p>
              <p className="tabular mt-1 text-kpi font-semibold text-ink-900">
                {formatMoney(data.pendingDeposit)}
              </p>
              <p className="mt-1.5 text-xs leading-5 text-ink-500">
                Өдрийн бэлэн орлогыг маргааш нь банканд тушаана. Тушаасны дараа кассын
                үлдэгдэл буурч, банкны данс нэмэгдэнэ.
              </p>
            </div>
            <BankDepositButton pendingAmount={data.pendingDeposit.toFixed(0)} today={today} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Сүүлийн тушаалт" description="Таны багийн хийсэн тушаалтууд" />
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
      </div>

      <Alert tone="info" className="mb-4">
        Энэ хуудсанд кассын гүйлгээ харагдана. Байгууллагын нийт санхүүгийн байдал, банкны
        шинжилгээг эзэн хардаг.
      </Alert>

      <FilterBar>
        <DateFilter paramKey="from" label="Эхлэх огноо" />
        <DateFilter paramKey="to" label="Дуусах огноо" />
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
        <CardHeader title="Кассын гүйлгээ" description="Сүүлийн 25 бичлэг · шүүлтүүрээр нарийсгана" />
        <LedgerTable rows={data.cashLedger} emptyText="Шүүлтэд тохирох гүйлгээ олдсонгүй." />
      </Card>
    </>
  );
}
