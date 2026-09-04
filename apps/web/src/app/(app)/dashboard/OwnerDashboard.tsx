import Link from "next/link";
import {
  Banknote,
  CalendarRange,
  ClipboardCheck,
  Landmark,
  Layers,
  PackageX,
  Percent,
  Receipt,
  ScaleIcon,
  TrendingDown,
  TrendingUp,
  Warehouse,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { DonutChart } from "@/components/ui/DonutChart";
import { GroupedBarChart } from "@/components/ui/GroupedBarChart";
import { HorizontalBarChart } from "@/components/ui/HorizontalBarChart";
import { LineChart } from "@/components/ui/LineChart";
import { StatCard } from "@/components/ui/StatCard";
import { EmptyRow, Table, TableLink, Td, Th, Tr } from "@/components/ui/Table";
import { Tabs } from "@/components/ui/Tabs";
import { formatDateTime, formatMoney, formatPercent, formatQty } from "@/lib/format";
import { AUDIT_ACTION_LABEL } from "@/lib/audit";
import {
  getOwnerDashboard,
  RANGE_KEYS,
  RANGE_LABEL,
  type RangeKey,
} from "@/server/services/dashboard";
import { PayablesTiles } from "./PayablesTiles";
import { AlertList, ComparisonHint, MoreLink, StockSeverityBadge } from "./shared";

const METRICS = {
  revenue: "Борлуулалтын дүн",
  quantity: "Тоо ширхэг",
  profit: "Бохир ашиг",
} as const;

type MetricKey = keyof typeof METRICS;

function parseMetric(value: string | undefined): MetricKey {
  return value === "quantity" || value === "profit" ? value : "revenue";
}

/**
 * ЭЗНИЙ самбар — "Бизнес хэрхэн явж байна?" гэсэн асуултад хариулна.
 * Ашиг, ашигт байдал, өртгийн шинжилгээ зөвхөн энд харагдана.
 */
export async function OwnerDashboard({
  userName,
  rangeKey,
  metric,
}: {
  userName: string;
  rangeKey: RangeKey;
  metric: string | undefined;
}) {
  const data = await getOwnerDashboard(rangeKey);
  const activeMetric = parseMetric(metric);

  const today = new Intl.DateTimeFormat("mn-MN", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date());

  const topRows = [...data.topProducts]
    .sort((a, b) =>
      activeMetric === "quantity"
        ? b.quantity - a.quantity
        : activeMetric === "profit"
          ? b.grossProfit - a.grossProfit
          : b.revenue - a.revenue,
    )
    .map((product) => {
      const value =
        activeMetric === "quantity"
          ? product.quantity
          : activeMetric === "profit"
            ? product.grossProfit
            : product.revenue;
      return {
        id: product.productId,
        label: product.name,
        value,
        display: activeMetric === "quantity" ? `${formatQty(value)} ш` : formatMoney(value),
        href: `/products/${product.productId}`,
      };
    });

  const mostProfitable = [...data.profitability]
    .sort((a, b) => b.grossProfit.comparedTo(a.grossProfit))
    .slice(0, 5);
  const lowestMargin = [...data.profitability]
    .sort((a, b) => a.grossMargin.comparedTo(b.grossMargin))
    .slice(0, 5);

  const rangeQuery = (key: string, value: string) => {
    const params = new URLSearchParams({ range: rangeKey, metric: activeMetric });
    params.set(key, value);
    return `/dashboard?${params.toString()}`;
  };

  return (
    <>
      <PageHeader
        title={`Сайн байна уу, ${userName.split(" ")[0]}`}
        description={today}
        action={
          <div className="w-full min-w-0 sm:w-auto">
            <Tabs
              className="mb-0 border-b-0"
              active={rangeKey}
              items={RANGE_KEYS.map((key) => ({
                key,
                label: RANGE_LABEL[key],
                href: rangeQuery("range", key),
              }))}
            />
          </div>
        }
      />

      {/* Гол санхүүгийн үзүүлэлт */}
      <section className="mb-3 grid auto-rows-fr gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          emphasis
          label="Өнөөдрийн борлуулалт"
          value={formatMoney(data.kpi.todaySales)}
          icon={<TrendingUp />}
          tone="brand"
          hint={<ComparisonHint comparison={data.kpi.todayVsYesterday} suffix="өчигдрөөс" />}
        />
        <StatCard
          emphasis
          label="Энэ сарын борлуулалт"
          value={formatMoney(data.kpi.monthSales)}
          icon={<CalendarRange />}
          tone="brand"
          hint={<ComparisonHint comparison={data.kpi.monthSalesVsPrev} suffix="өмнөх сараас" />}
        />
        <StatCard
          emphasis
          label="Энэ сарын бохир ашиг"
          value={formatMoney(data.kpi.monthGrossProfit)}
          icon={<Layers />}
          tone="brand"
          hint={<ComparisonHint comparison={data.kpi.monthGrossProfitVsPrev} suffix="өмнөх сараас" />}
        />
        <StatCard
          emphasis
          label="Ашгийн хувь"
          value={data.kpi.monthGrossMargin ? formatPercent(data.kpi.monthGrossMargin.toNumber()) : "—"}
          icon={<Percent />}
          tone="brand"
          hint={data.kpi.monthGrossMargin ? "Энэ сарын дундаж" : "Борлуулалт бүртгэгдээгүй"}
        />
      </section>

      <section className="mb-6 grid auto-rows-fr gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Энэ сарын ББӨ"
          value={formatMoney(data.kpi.monthCogs)}
          hint="Борлуулсан бүтээгдэхүүний өртөг"
          icon={<Receipt />}
        />
        <StatCard label="Банкны үлдэгдэл" value={formatMoney(data.kpi.bankBalance)} icon={<Landmark />} />
        <StatCard
          label="Банканд тушаах"
          value={formatMoney(data.kpi.pendingDeposit)}
          tone={data.kpi.pendingDeposit.greaterThan(0) ? "warning" : "default"}
          hint={data.kpi.pendingDeposit.greaterThan(0) ? "Кассд байгаа бэлэн мөнгө" : undefined}
          icon={<Banknote />}
        />
        <StatCard
          label="Нөөцийн нийт өртөг"
          value={formatMoney(data.kpi.inventoryValue)}
          hint="Жигнэсэн дундаж өртгөөр"
          icon={<Warehouse />}
        />
      </section>

      {/* Нийлүүлэгчийн өглөг — зөвхөн эзэн. Өглөг байхгүй бол огт харагдахгүй. */}
      <PayablesTiles />

      {/* Анхаарах зүйлс */}
      {data.alerts.length > 0 ? (
        <Card className="mb-6">
          <CardHeader title="Анхаарах зүйлс" description="Одоо биелж буй нөхцөлүүд" />
          <CardBody>
            <AlertList alerts={data.alerts} empty="Анхаарах зүйл алга." />
          </CardBody>
        </Card>
      ) : null}

      {/* Гол график: борлуулалт ба ашиг */}
      <Card className="mb-4">
        <CardHeader
          title="Борлуулалт ба ашиг"
          description={`${RANGE_LABEL[rangeKey]} · өдөр тутмын орлого, өртөг, бохир ашиг`}
          action={<MoreLink href="/reports?report=daily">Тайлан</MoreLink>}
        />
        <CardBody>
          <LineChart
            labels={data.trend.map((row) => row.label)}
            series={[
              { key: "revenue", label: "Орлого", values: data.trend.map((r) => r.revenue) },
              { key: "cogs", label: "ББӨ", values: data.trend.map((r) => r.cogs) },
              { key: "profit", label: "Бохир ашиг", values: data.trend.map((r) => r.grossProfit) },
            ]}
          />
        </CardBody>
      </Card>

      <div className="mb-4 grid items-start gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Орлого ба зардал"
            description={`${RANGE_LABEL[rangeKey]} · бүгд ₮ дүнгээр харьцуулав`}
          />
          <CardBody>
            <GroupedBarChart
              labels={data.incomeVsSpend.map((row) => row.label)}
              series={[
                { key: "sales", label: "Борлуулалт", values: data.incomeVsSpend.map((r) => r.sales) },
                {
                  key: "purchases",
                  label: "Худалдан авалт",
                  values: data.incomeVsSpend.map((r) => r.purchases),
                },
                {
                  key: "expenses",
                  label: "Бусад зардал",
                  values: data.incomeVsSpend.map((r) => r.expenses),
                },
              ]}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Төлбөрийн бүтэц" description={RANGE_LABEL[rangeKey]} />
          <CardBody>
            <DonutChart
              slices={data.paymentMix.map((slice) => ({
                key: slice.key,
                label: slice.label,
                amount: slice.amount,
                // Өнгө нь төлбөрийн төрөлд бэхлэгдсэн — эрэмбэ өөрчлөгдөхөд шилжихгүй.
                colorIndex: ["cash", "cardQr", "bank", "other"].indexOf(slice.key),
              }))}
            />
          </CardBody>
        </Card>
      </div>

      <div className="mb-4 grid items-start gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Шилдэг бүтээгдэхүүн"
            description={`${RANGE_LABEL[rangeKey]} · шилдэг 10`}
          />
          <CardBody className="pt-0">
            <Tabs
              className="mb-4"
              active={activeMetric}
              items={(Object.keys(METRICS) as MetricKey[]).map((key) => ({
                key,
                label: METRICS[key],
                href: rangeQuery("metric", key),
              }))}
            />
            <HorizontalBarChart rows={topRows} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Зардлын бүтэц"
            description={`${RANGE_LABEL[rangeKey]} · ангиллаар`}
            action={<MoreLink href="/reports?report=expenses" />}
          />
          <Table>
            <thead>
              <tr>
                <Th>Ангилал</Th>
                <Th align="right">Дүн</Th>
                <Th align="right">Эзлэх хувь</Th>
              </tr>
            </thead>
            <tbody>
              {data.expenseMix.length === 0 ? (
                <EmptyRow colSpan={3} icon={<Receipt />}>
                  Энэ хугацаанд зардал бүртгэгдээгүй.
                </EmptyRow>
              ) : (
                data.expenseMix.map((row) => (
                  <Tr key={row.id}>
                    <Td className="font-medium text-ink-800">{row.name}</Td>
                    <Td align="right" className="font-medium text-ink-900">
                      {formatMoney(row.amount)}
                    </Td>
                    <Td align="right" muted>
                      {formatPercent(row.share)}
                    </Td>
                  </Tr>
                ))
              )}
            </tbody>
          </Table>
        </Card>

        <Card>
          <CardHeader title="Хамгийн ашигтай бүтээгдэхүүн" description={`${RANGE_LABEL[rangeKey]} · бохир ашгаар`} />
          <Table>
            <thead>
              <tr>
                <Th>Бүтээгдэхүүн</Th>
                <Th align="right">Орлого</Th>
                <Th align="right">ББӨ</Th>
                <Th align="right">Ашиг</Th>
                <Th align="right">Хувь</Th>
              </tr>
            </thead>
            <tbody>
              {mostProfitable.length === 0 ? (
                <EmptyRow colSpan={5} icon={<TrendingUp />}>
                  Энэ хугацаанд борлуулалт алга.
                </EmptyRow>
              ) : (
                mostProfitable.map((row) => (
                  <Tr key={row.productId}>
                    <Td>
                      <TableLink href={`/products/${row.productId}`} strong>
                        {row.name}
                      </TableLink>
                    </Td>
                    <Td align="right" muted>
                      {formatMoney(row.revenue)}
                    </Td>
                    <Td align="right" muted>
                      {formatMoney(row.cogs)}
                    </Td>
                    <Td align="right" className="font-medium text-emerald-700">
                      {formatMoney(row.grossProfit)}
                    </Td>
                    <Td align="right">{formatPercent(row.grossMargin.toNumber())}</Td>
                  </Tr>
                ))
              )}
            </tbody>
          </Table>
        </Card>

        <Card>
          <CardHeader
            title="Margin багатай бүтээгдэхүүн"
            description="Хамгийн их орлоготой нь хамгийн ашигтай гэсэн үг биш"
          />
          <Table>
            <thead>
              <tr>
                <Th>Бүтээгдэхүүн</Th>
                <Th align="right">Орлого</Th>
                <Th align="right">ББӨ</Th>
                <Th align="right">Ашиг</Th>
                <Th align="right">Хувь</Th>
              </tr>
            </thead>
            <tbody>
              {lowestMargin.length === 0 ? (
                <EmptyRow colSpan={5} icon={<TrendingDown />}>
                  Энэ хугацаанд борлуулалт алга.
                </EmptyRow>
              ) : (
                lowestMargin.map((row) => {
                  const weak = row.grossMargin.lessThan(20);
                  return (
                    <Tr key={row.productId} tone={weak ? "warning" : undefined}>
                      <Td>
                        <TableLink href={`/products/${row.productId}`} strong>
                          {row.name}
                        </TableLink>
                      </Td>
                      <Td align="right" muted>
                        {formatMoney(row.revenue)}
                      </Td>
                      <Td align="right" muted>
                        {formatMoney(row.cogs)}
                      </Td>
                      <Td align="right">{formatMoney(row.grossProfit)}</Td>
                      <Td
                        align="right"
                        className={weak ? "font-semibold text-amber-700" : "font-medium"}
                      >
                        {formatPercent(row.grossMargin.toNumber())}
                      </Td>
                    </Tr>
                  );
                })
              )}
            </tbody>
          </Table>
        </Card>
      </div>

      {/* Бараа материалын төлөв */}
      <Card className="mb-4">
        <CardHeader
          title="Бараа материалын төлөв"
          action={<MoreLink href="/materials?status=low" />}
        />
        <CardBody className="border-b border-ink-200">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Нөөц багассан"
              value={`${data.inventory.lowStockCount} нэр`}
              tone={data.inventory.lowStockCount > 0 ? "warning" : "default"}
              icon={<PackageX />}
            />
            <StatCard
              label="Нөөц дууссан"
              value={`${data.inventory.outOfStockCount} нэр`}
              tone={data.inventory.outOfStockCount > 0 ? "negative" : "default"}
              icon={<PackageX />}
            />
            <StatCard
              label="Нөөцийн нийт өртөг"
              value={formatMoney(data.inventory.totalValue)}
              icon={<Warehouse />}
            />
            <StatCard
              label="Сүүлийн тооллогын зөрүү"
              value={data.lastCount ? formatMoney(data.lastCount.totalVariance) : "—"}
              tone={
                data.lastCount && data.lastCount.totalVariance.isNegative() ? "negative" : "default"
              }
              hint={data.lastCount ? data.lastCount.countNo : "Тооллого хийгдээгүй"}
              icon={<ScaleIcon />}
            />
          </div>
        </CardBody>

        <div className="grid xl:grid-cols-2 xl:divide-x xl:divide-ink-200">
          <div>
            <p className="px-5 pb-2 pt-4 text-body font-semibold text-ink-700">
              Нөөц багассан бараа
            </p>
            <Table>
              <thead>
                <tr>
                  <Th>Бараа</Th>
                  <Th align="right">Үлдэгдэл</Th>
                  <Th align="right">Доод нөөц</Th>
                  <Th>Нэгж</Th>
                  <Th>Төлөв</Th>
                </tr>
              </thead>
              <tbody>
                {data.inventory.lowStock.length === 0 ? (
                  <EmptyRow colSpan={5} icon={<ClipboardCheck />}>
                    Бүх бараа хангалттай нөөцтэй.
                  </EmptyRow>
                ) : (
                  data.inventory.lowStock.map((item) => (
                    <Tr key={item.id} tone={item.severity === "LOW" ? undefined : "warning"}>
                      <Td>
                        <TableLink href={`/materials/${item.id}`} strong>
                          {item.name}
                        </TableLink>
                      </Td>
                      <Td
                        align="right"
                        className={item.severity === "OUT" ? "font-semibold text-red-700" : "font-medium text-amber-700"}
                      >
                        {formatQty(item.quantity)}
                      </Td>
                      <Td align="right" muted>
                        {formatQty(item.minimumStock)}
                      </Td>
                      <Td muted>{item.unit}</Td>
                      <Td>
                        <StockSeverityBadge severity={item.severity} />
                      </Td>
                    </Tr>
                  ))
                )}
              </tbody>
            </Table>
          </div>

          <div>
            <p className="px-5 pb-2 pt-4 text-body font-semibold text-ink-700">
              Сүүлийн тооллогын зөрүү
              {data.lastCount ? (
                <Link
                  href={`/counts/${data.lastCount.id}`}
                  className="ml-2 font-normal text-brand-600 hover:underline"
                >
                  {data.lastCount.countNo}
                </Link>
              ) : null}
            </p>
            <Table>
              <thead>
                <tr>
                  <Th>Бараа</Th>
                  <Th align="right">Систем</Th>
                  <Th align="right">Тоолсон</Th>
                  <Th align="right">Зөрүү</Th>
                  <Th align="right">Дүн</Th>
                </tr>
              </thead>
              <tbody>
                {!data.lastCount || data.lastCount.items.length === 0 ? (
                  <EmptyRow colSpan={5} icon={<ClipboardCheck />}>
                    Зөрүү бүртгэгдээгүй байна.
                  </EmptyRow>
                ) : (
                  data.lastCount.items.map((item) => (
                    <Tr key={item.id}>
                      <Td className="text-ink-800">{item.materialName}</Td>
                      <Td align="right" muted>
                        {formatQty(item.systemQuantity)}
                      </Td>
                      <Td align="right" muted>
                        {formatQty(item.countedQuantity)}
                      </Td>
                      <Td
                        align="right"
                        className={item.difference < 0 ? "text-red-700" : "text-emerald-700"}
                      >
                        {item.difference > 0 ? "+" : ""}
                        {formatQty(item.difference)}
                      </Td>
                      <Td
                        align="right"
                        className={item.varianceAmount < 0 ? "font-medium text-red-700" : "font-medium"}
                      >
                        {formatMoney(item.varianceAmount)}
                      </Td>
                    </Tr>
                  ))
                )}
              </tbody>
            </Table>
          </div>
        </div>
      </Card>

      <div className="grid items-start gap-4 xl:grid-cols-3">
        {/* Үнэ өссөн түүхий эд — 2-оос дээш удаа авсан материал л энд орно */}
        {data.priceMovements.length > 0 ? (
          <Card>
            <CardHeader
              title="Үнэ өссөн түүхий эд"
              description="Сүүлийн авалт өмнөх авалттай харьцуулсан"
              action={<MoreLink href="/reports?report=prices" />}
            />
            <CardBody>
              <ul className="space-y-3">
                {data.priceMovements.map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-3">
                    <TableLink href={`/materials/${row.id}`} strong>
                      {row.name}
                    </TableLink>
                    <span className="flex shrink-0 items-center gap-2 text-body">
                      <span className="tabular text-ink-400">
                        {formatMoney(row.previousCost)} → {formatMoney(row.latestCost)}
                      </span>
                      <Badge tone="danger">+{row.changePercent.toFixed(1)}%</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        ) : null}

        <Card className={data.priceMovements.length > 0 ? "xl:col-span-2" : "xl:col-span-3"}>
          <CardHeader
            title="Сүүлийн үйл ажиллагаа"
            description="Системд хийгдсэн чухал үйлдлүүд"
            action={<MoreLink href="/audit">Бүх түүх</MoreLink>}
          />
          <Table>
            <thead>
              <tr>
                <Th width="180px">Огноо</Th>
                <Th width="200px">Хэрэглэгч</Th>
                <Th>Үйлдэл</Th>
                <Th>Бүртгэл</Th>
              </tr>
            </thead>
            <tbody>
              {data.activity.length === 0 ? (
                <EmptyRow colSpan={4}>Үйлдэл бүртгэгдээгүй байна.</EmptyRow>
              ) : (
                data.activity.map((log) => (
                  <Tr key={log.id}>
                    <Td muted className="whitespace-nowrap">
                      {formatDateTime(log.createdAt)}
                    </Td>
                    <Td className="text-ink-800">{log.userName}</Td>
                    <Td className="font-medium text-ink-800">
                      {AUDIT_ACTION_LABEL[log.action] ?? log.action}
                    </Td>
                    <Td>
                      <Badge tone="neutral">{log.entityType}</Badge>
                    </Td>
                  </Tr>
                ))
              )}
            </tbody>
          </Table>
        </Card>
      </div>
    </>
  );
}
