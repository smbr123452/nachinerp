import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Card, CardHeader, StatCard } from "@/components/ui/Card";
import { EmptyRow, Table, Td, Th } from "@/components/ui/Table";
import { DateFilter, FilterBar } from "@/components/ui/SearchFilters";
import { requirePageUser } from "@/lib/auth/guards";
import { sum } from "@/lib/decimal";
import { formatDate, formatMoney, formatMoneyPrecise, formatPercent, formatQty } from "@/lib/format";
import { cn } from "@/lib/cn";
import {
  getDailySalesReport,
  getExpenseReport,
  getInventoryReport,
  getPriceHistoryReport,
  getProductSalesReport,
  getPurchaseReport,
  getSalesSummary,
  getVarianceReport,
  rangeFromInputs,
} from "@/server/services/reports";

export const metadata = { title: "Тайлан | Начин ERP" };
export const dynamic = "force-dynamic";

const REPORTS = [
  { key: "daily", label: "Өдрийн борлуулалт" },
  { key: "products", label: "Бүтээгдэхүүн" },
  { key: "expenses", label: "Зардал" },
  { key: "purchases", label: "Худалдан авалт" },
  { key: "inventory", label: "Нөөц" },
  { key: "variance", label: "Тооллогын зөрүү" },
  { key: "prices", label: "Түүхий эдийн үнэ" },
];

type SearchParams = Promise<{ report?: string; from?: string; to?: string }>;

export default async function ReportsPage({ searchParams }: { searchParams: SearchParams }) {
  await requirePageUser();
  const params = await searchParams;
  const report = params.report ?? "daily";
  const range = rangeFromInputs(params.from, params.to);
  const query = new URLSearchParams();
  if (params.from) query.set("from", params.from);
  if (params.to) query.set("to", params.to);

  const summary = await getSalesSummary(range);

  return (
    <>
      <PageHeader
        title="Тайлан"
        description={`${formatDate(range.from)} — ${formatDate(new Date(range.to.getTime() - 1))}`}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Нийт орлого" value={formatMoney(summary.revenue)} />
        <StatCard label="Борлуулсан бүтээгдэхүүний өртөг" value={formatMoney(summary.cogs)} />
        <StatCard label="Нийт ашиг" value={formatMoney(summary.grossProfit)} tone="positive" />
        <StatCard
          label="Ашгийн хувь"
          value={
            summary.revenue.greaterThan(0)
              ? formatPercent(summary.grossProfit.dividedBy(summary.revenue).times(100).toNumber())
              : "-"
          }
        />
        <StatCard label="Бэлэн орлого" value={formatMoney(summary.cash)} />
        <StatCard label="Карт / QR" value={formatMoney(summary.cardQr)} />
        <StatCard label="Дансаар" value={formatMoney(summary.bankTransfer)} />
        <StatCard label="Борлуулсан тоо ширхэг" value={formatQty(summary.itemsSold)} />
      </div>

      <FilterBar>
        <DateFilter paramKey="from" label="Эхлэх огноо" />
        <DateFilter paramKey="to" label="Дуусах огноо" />
      </FilterBar>

      <div className="no-print mb-4 flex flex-wrap gap-2 border-b border-slate-200">
        {REPORTS.map((item) => {
          const itemQuery = new URLSearchParams(query);
          itemQuery.set("report", item.key);
          return (
            <Link
              key={item.key}
              href={`/reports?${itemQuery.toString()}`}
              className={cn(
                "-mb-px border-b-2 px-4 py-2 text-sm font-medium",
                report === item.key
                  ? "border-brand-600 text-brand-700"
                  : "border-transparent text-slate-500 hover:text-slate-800",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </div>

      {report === "daily" ? <DailyReport range={range} /> : null}
      {report === "products" ? <ProductReport range={range} /> : null}
      {report === "expenses" ? <ExpenseReport range={range} /> : null}
      {report === "purchases" ? <PurchaseReport range={range} /> : null}
      {report === "inventory" ? <InventoryReport /> : null}
      {report === "variance" ? <VarianceReport range={range} /> : null}
      {report === "prices" ? <PriceReport range={range} /> : null}
    </>
  );
}

type RangeProps = { range: { from: Date; to: Date } };

async function DailyReport({ range }: RangeProps) {
  const rows = await getDailySalesReport(range);
  return (
    <Card>
      <CardHeader title="Өдрийн борлуулалтын тайлан" />
      <Table>
        <thead>
          <tr>
            <Th>Огноо</Th>
            <Th align="right">Орлого</Th>
            <Th align="right">Бэлэн</Th>
            <Th align="right">Банк</Th>
            <Th align="right">ББӨ</Th>
            <Th align="right">Ашиг</Th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <EmptyRow colSpan={6} />
          ) : (
            <>
              {rows.map((row) => (
                <tr key={row.date.toISOString()}>
                  <Td>{formatDate(row.date)}</Td>
                  <Td align="right" className="font-medium">
                    {formatMoney(row.revenue)}
                  </Td>
                  <Td align="right">{formatMoney(row.cash)}</Td>
                  <Td align="right">{formatMoney(row.bank)}</Td>
                  <Td align="right" className="text-slate-500">
                    {formatMoney(row.cogs)}
                  </Td>
                  <Td align="right" className="text-emerald-600">
                    {formatMoney(row.grossProfit)}
                  </Td>
                </tr>
              ))}
              <tr className="bg-slate-50 font-semibold">
                <Td>Нийт</Td>
                <Td align="right">{formatMoney(sum(rows.map((r) => r.revenue)))}</Td>
                <Td align="right">{formatMoney(sum(rows.map((r) => r.cash)))}</Td>
                <Td align="right">{formatMoney(sum(rows.map((r) => r.bank)))}</Td>
                <Td align="right">{formatMoney(sum(rows.map((r) => r.cogs)))}</Td>
                <Td align="right">{formatMoney(sum(rows.map((r) => r.grossProfit)))}</Td>
              </tr>
            </>
          )}
        </tbody>
      </Table>
    </Card>
  );
}

async function ProductReport({ range }: RangeProps) {
  const rows = await getProductSalesReport(range);
  return (
    <Card>
      <CardHeader title="Бүтээгдэхүүний борлуулалтын тайлан" />
      <Table>
        <thead>
          <tr>
            <Th>Бүтээгдэхүүн</Th>
            <Th align="right">Тоо ширхэг</Th>
            <Th align="right">Орлого</Th>
            <Th align="right">Өртөг</Th>
            <Th align="right">Ашиг</Th>
            <Th align="right">Ашгийн %</Th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <EmptyRow colSpan={6} />
          ) : (
            rows.map((row) => (
              <tr key={row.productId}>
                <Td>
                  <Link href={`/products/${row.productId}`} className="text-brand-600 hover:underline">
                    {row.name}
                  </Link>
                  <span className="ml-2 font-mono text-xs text-slate-400">{row.sku}</span>
                </Td>
                <Td align="right">{formatQty(row.quantity)}</Td>
                <Td align="right" className="font-medium">
                  {formatMoney(row.revenue)}
                </Td>
                <Td align="right" className="text-slate-500">
                  {formatMoney(row.cogs)}
                </Td>
                <Td align="right" className="text-emerald-600">
                  {formatMoney(row.grossProfit)}
                </Td>
                <Td align="right">{formatPercent(row.grossMargin.toNumber())}</Td>
              </tr>
            ))
          )}
        </tbody>
      </Table>
    </Card>
  );
}

async function ExpenseReport({ range }: RangeProps) {
  const rows = await getExpenseReport(range);
  const total = sum(rows.map((r) => r.amount));
  return (
    <Card>
      <CardHeader title="Зардлын тайлан" description="Ангиллаар" />
      <Table>
        <thead>
          <tr>
            <Th>Ангилал</Th>
            <Th align="right">Тоо</Th>
            <Th align="right">Дүн</Th>
            <Th align="right">Эзлэх хувь</Th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <EmptyRow colSpan={4} />
          ) : (
            <>
              {rows.map((row) => (
                <tr key={row.categoryId}>
                  <Td>{row.name}</Td>
                  <Td align="right">{row.count}</Td>
                  <Td align="right" className="font-medium">
                    {formatMoney(row.amount)}
                  </Td>
                  <Td align="right">
                    {total.greaterThan(0)
                      ? formatPercent(row.amount.dividedBy(total).times(100).toNumber())
                      : "-"}
                  </Td>
                </tr>
              ))}
              <tr className="bg-slate-50 font-semibold">
                <Td colSpan={2}>Нийт</Td>
                <Td align="right">{formatMoney(total)}</Td>
                <Td />
              </tr>
            </>
          )}
        </tbody>
      </Table>
    </Card>
  );
}

async function PurchaseReport({ range }: RangeProps) {
  const rows = await getPurchaseReport(range);
  return (
    <Card>
      <CardHeader title="Худалдан авалтын тайлан" description="Материалаар" />
      <Table>
        <thead>
          <tr>
            <Th>Материал</Th>
            <Th align="right">Авсан хэмжээ</Th>
            <Th align="right">Нийт дүн</Th>
            <Th align="right">Дундаж үнэ</Th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <EmptyRow colSpan={4} />
          ) : (
            <>
              {rows.map((row) => (
                <tr key={row.rawMaterialId}>
                  <Td>
                    <Link href={`/materials/${row.rawMaterialId}`} className="text-brand-600 hover:underline">
                      {row.name}
                    </Link>
                  </Td>
                  <Td align="right">
                    {formatQty(row.quantity)} {row.unit}
                  </Td>
                  <Td align="right" className="font-medium">
                    {formatMoney(row.amount)}
                  </Td>
                  <Td align="right">{formatMoneyPrecise(row.averagePrice)}</Td>
                </tr>
              ))}
              <tr className="bg-slate-50 font-semibold">
                <Td colSpan={2}>Нийт</Td>
                <Td align="right">{formatMoney(sum(rows.map((r) => r.amount)))}</Td>
                <Td />
              </tr>
            </>
          )}
        </tbody>
      </Table>
    </Card>
  );
}

async function InventoryReport() {
  const rows = await getInventoryReport();
  return (
    <Card>
      <CardHeader
        title="Нөөцийн тайлан"
        description={`Нийт үнэлгээ ${formatMoney(sum(rows.map((r) => r.value)))}`}
      />
      <Table>
        <thead>
          <tr>
            <Th>Материал</Th>
            <Th>Ангилал</Th>
            <Th align="right">Үлдэгдэл</Th>
            <Th align="right">Доод хэмжээ</Th>
            <Th align="right">Дундаж өртөг</Th>
            <Th align="right">Нөөцийн өртөг</Th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <EmptyRow colSpan={6} />
          ) : (
            <>
              {rows.map((row) => (
                <tr key={row.id} className={row.isLow ? "bg-amber-50" : ""}>
                  <Td>
                    <Link href={`/materials/${row.id}`} className="text-brand-600 hover:underline">
                      {row.name}
                    </Link>
                    {row.isLow ? (
                      <Badge tone="warning" className="ml-2">
                        Дутагдалтай
                      </Badge>
                    ) : null}
                  </Td>
                  <Td className="text-slate-500">{row.category}</Td>
                  <Td align="right">
                    {formatQty(row.quantity)} {row.unit}
                  </Td>
                  <Td align="right" className="text-slate-500">
                    {formatQty(row.minimumStock)}
                  </Td>
                  <Td align="right">{formatMoneyPrecise(row.averageCost)}</Td>
                  <Td align="right" className="font-medium">
                    {formatMoney(row.value)}
                  </Td>
                </tr>
              ))}
              <tr className="bg-slate-50 font-semibold">
                <Td colSpan={5}>Нийт нөөцийн өртөг</Td>
                <Td align="right">{formatMoney(sum(rows.map((r) => r.value)))}</Td>
              </tr>
            </>
          )}
        </tbody>
      </Table>
    </Card>
  );
}

async function VarianceReport({ range }: RangeProps) {
  const rows = await getVarianceReport(range);
  return (
    <Card>
      <CardHeader
        title="Тооллогын зөрүүний тайлан"
        description={`Нийт зөрүү ${formatMoney(sum(rows.map((r) => r.variance)))}`}
      />
      <Table>
        <thead>
          <tr>
            <Th>Огноо</Th>
            <Th>Баримт</Th>
            <Th>Материал</Th>
            <Th align="right">Систем</Th>
            <Th align="right">Тоолсон</Th>
            <Th align="right">Зөрүү</Th>
            <Th align="right">Дүн</Th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <EmptyRow colSpan={7}>Зөрүү бүртгэгдээгүй.</EmptyRow>
          ) : (
            rows.map((row) => (
              <tr key={row.id}>
                <Td>{formatDate(row.date)}</Td>
                <Td className="font-mono text-xs">{row.countNo}</Td>
                <Td>{row.materialName}</Td>
                <Td align="right">{formatQty(row.systemQuantity)}</Td>
                <Td align="right">{formatQty(row.countedQuantity)}</Td>
                <Td align="right" className={row.difference.isNegative() ? "text-red-600" : "text-emerald-600"}>
                  {row.difference.greaterThan(0) ? "+" : ""}
                  {formatQty(row.difference)}
                </Td>
                <Td align="right" className={row.variance.isNegative() ? "text-red-600" : ""}>
                  {formatMoney(row.variance)}
                </Td>
              </tr>
            ))
          )}
        </tbody>
      </Table>
    </Card>
  );
}

async function PriceReport({ range }: RangeProps) {
  const rows = await getPriceHistoryReport(range);
  return (
    <Card>
      <CardHeader title="Түүхий эдийн үнийн түүх" description="Худалдан авалт бүрийн үндсэн нэгжээрх үнэ" />
      <Table>
        <thead>
          <tr>
            <Th>Огноо</Th>
            <Th>Материал</Th>
            <Th>Баримт</Th>
            <Th align="right">Нэгж үнэ</Th>
            <Th align="right">Хэмжээ</Th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <EmptyRow colSpan={5} />
          ) : (
            rows.map((row) => (
              <tr key={row.id}>
                <Td>{formatDate(row.date)}</Td>
                <Td>
                  <Link href={`/materials/${row.materialId}`} className="text-brand-600 hover:underline">
                    {row.materialName}
                  </Link>
                </Td>
                <Td>
                  <Link href={`/purchases/${row.purchaseId}`} className="font-mono text-xs text-brand-600 hover:underline">
                    {row.purchaseNo}
                  </Link>
                </Td>
                <Td align="right" className="font-medium">
                  {formatMoneyPrecise(row.unitCost)} / {row.unit}
                </Td>
                <Td align="right">
                  {formatQty(row.quantity)} {row.unit}
                </Td>
              </tr>
            ))
          )}
        </tbody>
      </Table>
    </Card>
  );
}
