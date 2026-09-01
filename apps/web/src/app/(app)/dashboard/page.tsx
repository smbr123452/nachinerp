import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  CalendarRange,
  ClipboardCheck,
  Landmark,
  PackageX,
  Receipt,
  ScaleIcon,
  ShoppingCart,
  TrendingUp,
  Warehouse,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { BarChart } from "@/components/ui/BarChart";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { EmptyRow, Table, Td, Th, Tr } from "@/components/ui/Table";
import { requirePageUser } from "@/lib/auth/guards";
import { AUDIT_ACTION_LABEL } from "@/lib/audit";
import { formatDate, formatDateTime, formatMoney, formatQty } from "@/lib/format";
import { getDashboardData } from "@/server/services/dashboard";

export const metadata = { title: "Хянах самбар | Начин ERP" };
export const dynamic = "force-dynamic";

/** Хэсэг рүү шилжих холбоос — картын толгойд ашиглана. */
function MoreLink({ href, children = "Бүгд" }: { href: string; children?: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-[13px] font-medium text-brand-600 transition-colors hover:text-brand-700"
    >
      {children}
      <ArrowRight aria-hidden className="h-3.5 w-3.5" />
    </Link>
  );
}

export default async function DashboardPage() {
  const user = await requirePageUser();
  const data = await getDashboardData();

  const today = new Intl.DateTimeFormat("mn-MN", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date());

  return (
    <>
      <PageHeader
        title={`Сайн байна уу, ${user.name.split(" ")[0]}`}
        description={today}
      />

      {/* Гол санхүүгийн үзүүлэлтүүд */}
      <section className="mb-3 grid auto-rows-fr gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          emphasis
          label="Өнөөдрийн борлуулалт"
          value={formatMoney(data.todaySales)}
          hint={`Өчигдөр: ${formatMoney(data.yesterdaySales)}`}
          icon={<TrendingUp />}
          tone="brand"
        />
        <StatCard
          emphasis
          label="Энэ сарын борлуулалт"
          value={formatMoney(data.monthSales)}
          hint="Сарын эхнээс өнөөдрийг хүртэл"
          icon={<CalendarRange />}
          tone="brand"
        />
        <StatCard
          emphasis
          label="Банкны үлдэгдэл"
          value={formatMoney(data.bankBalance)}
          hint="Гүйлгээний дэвтрээс тооцов"
          icon={<Landmark />}
          tone="brand"
        />
        <StatCard
          emphasis
          label="Маргааш банканд тушаах"
          value={formatMoney(data.pendingDeposit)}
          tone={data.pendingDeposit.greaterThan(0) ? "warning" : "brand"}
          hint={data.pendingDeposit.greaterThan(0) ? "Кассд байгаа бэлэн мөнгө" : "Тушаах мөнгө алга"}
          icon={<Banknote />}
        />
      </section>

      {/* Өдрийн үйл ажиллагаа ба анхаарал шаардсан үзүүлэлтүүд */}
      <section className="mb-6 grid auto-rows-fr gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Өнөөдрийн худалдан авалт"
          value={formatMoney(data.todayPurchases)}
          icon={<ShoppingCart />}
        />
        <StatCard
          label="Өнөөдрийн бусад зардал"
          value={formatMoney(data.todayExpenses)}
          icon={<Receipt />}
        />
        <StatCard
          label="Өнөөдрийн бэлэн орлого"
          value={formatMoney(data.todayCashIn)}
          icon={<Banknote />}
        />
        <StatCard
          label="Нөөцийн нийт өртөг"
          value={formatMoney(data.inventoryTotalValue)}
          hint="Жигнэсэн дундаж өртгөөр"
          icon={<Warehouse />}
        />
        <StatCard
          className="xl:col-span-2"
          label="Нөөц багассан бараа"
          value={`${data.lowStockCount} нэр төрөл`}
          tone={data.lowStockCount > 0 ? "warning" : "default"}
          hint={data.lowStockCount > 0 ? "Доод хэмжээнээс доош орсон" : "Бүх нөөц хангалттай"}
          icon={<PackageX />}
        />
        <StatCard
          className="xl:col-span-2"
          label="Тооллогын зөрүү"
          value={formatMoney(data.varianceAmount)}
          tone={data.varianceAmount.isNegative() ? "negative" : "default"}
          hint="Баталгаажсан тооллогуудын нийт зөрүү"
          icon={<ScaleIcon />}
        />
      </section>

      {/* Борлуулалтын хандлага */}
      <Card className="mb-6">
        <CardHeader
          title="Борлуулалтын хандлага"
          description="Сүүлийн 7 хоногийн өдөр тутмын орлого"
          action={<MoreLink href="/reports?report=daily">Тайлан</MoreLink>}
        />
        <CardBody>
          <BarChart data={data.salesTrend} />
        </CardBody>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Шилдэг бүтээгдэхүүн"
            description="Энэ сарын борлуулалтаар"
            action={<MoreLink href="/reports?report=products" />}
          />
          <Table>
            <thead>
              <tr>
                <Th>Бүтээгдэхүүн</Th>
                <Th align="right">Тоо</Th>
                <Th align="right">Орлого</Th>
                <Th align="right">Ашиг</Th>
              </tr>
            </thead>
            <tbody>
              {data.topProducts.length === 0 ? (
                <EmptyRow colSpan={4} icon={<TrendingUp />}>
                  Энэ сард борлуулалт бүртгэгдээгүй байна.
                </EmptyRow>
              ) : (
                data.topProducts.map((product) => (
                  <Tr key={product.productId}>
                    <Td>
                      <Link
                        href={`/products/${product.productId}`}
                        className="font-medium text-ink-800 hover:text-brand-700 hover:underline"
                      >
                        {product.name}
                      </Link>
                    </Td>
                    <Td align="right" muted>
                      {formatQty(product.quantity)}
                    </Td>
                    <Td align="right" className="font-medium text-ink-900">
                      {formatMoney(product.revenue)}
                    </Td>
                    <Td align="right" className="text-emerald-700">
                      {formatMoney(product.profit)}
                    </Td>
                  </Tr>
                ))
              )}
            </tbody>
          </Table>
        </Card>

        <Card>
          <CardHeader
            title="Нөөц багассан бараа"
            description="Доод хэмжээнээс доош орсон материал"
            action={<MoreLink href="/materials?status=low" />}
          />
          <Table>
            <thead>
              <tr>
                <Th>Материал</Th>
                <Th align="right">Үлдэгдэл</Th>
                <Th align="right">Доод хэмжээ</Th>
              </tr>
            </thead>
            <tbody>
              {data.lowStockItems.length === 0 ? (
                <EmptyRow colSpan={3} icon={<ClipboardCheck />}>
                  Бүх бараа хангалттай нөөцтэй байна.
                </EmptyRow>
              ) : (
                data.lowStockItems.map((item) => (
                  <Tr key={item.id} tone="warning">
                    <Td>
                      <Link
                        href={`/materials/${item.id}`}
                        className="font-medium text-ink-800 hover:text-brand-700 hover:underline"
                      >
                        {item.name}
                      </Link>
                    </Td>
                    <Td align="right" className="font-medium text-amber-700">
                      {formatQty(item.quantity)} {item.unit}
                    </Td>
                    <Td align="right" muted>
                      {formatQty(item.minimumStock)} {item.unit}
                    </Td>
                  </Tr>
                ))
              )}
            </tbody>
          </Table>
        </Card>

        <Card>
          <CardHeader
            title="Сүүлийн зардал"
            description="Энэ сарын хамгийн том зардлууд"
            action={<MoreLink href="/expenses" />}
          />
          <Table>
            <thead>
              <tr>
                <Th>Огноо</Th>
                <Th>Ангилал</Th>
                <Th align="right">Дүн</Th>
              </tr>
            </thead>
            <tbody>
              {data.largestExpenses.length === 0 ? (
                <EmptyRow colSpan={3} icon={<Receipt />}>
                  Энэ сард зардал бүртгэгдээгүй байна.
                </EmptyRow>
              ) : (
                data.largestExpenses.map((expense) => (
                  <Tr key={expense.id}>
                    <Td muted className="whitespace-nowrap">
                      {formatDate(expense.date)}
                    </Td>
                    <Td>
                      <span className="font-medium text-ink-800">{expense.category}</span>
                      {expense.description ? (
                        <span className="ml-1.5 text-[13px] text-ink-400">{expense.description}</span>
                      ) : null}
                    </Td>
                    <Td align="right" className="font-medium text-ink-900">
                      {formatMoney(expense.amount)}
                    </Td>
                  </Tr>
                ))
              )}
            </tbody>
          </Table>
        </Card>

        <Card>
          <CardHeader
            title="Тооллогын зөрүү"
            description="Сүүлийн баталгаажсан зөрүүнүүд"
            action={<MoreLink href="/reports?report=variance" />}
          />
          <Table>
            <thead>
              <tr>
                <Th>Огноо</Th>
                <Th>Материал</Th>
                <Th align="right">Зөрүү</Th>
                <Th align="right">Дүн</Th>
              </tr>
            </thead>
            <tbody>
              {data.recentVariances.length === 0 ? (
                <EmptyRow colSpan={4} icon={<ClipboardCheck />}>
                  Зөрүү бүртгэгдээгүй байна.
                </EmptyRow>
              ) : (
                data.recentVariances.map((row) => (
                  <Tr key={row.id}>
                    <Td muted className="whitespace-nowrap">
                      {formatDate(row.date)}
                    </Td>
                    <Td className="text-ink-800">{row.materialName}</Td>
                    <Td
                      align="right"
                      className={row.difference.isNegative() ? "text-red-700" : "text-emerald-700"}
                    >
                      {row.difference.greaterThan(0) ? "+" : ""}
                      {formatQty(row.difference)}
                    </Td>
                    <Td
                      align="right"
                      className={row.variance.isNegative() ? "font-medium text-red-700" : "font-medium"}
                    >
                      {formatMoney(row.variance)}
                    </Td>
                  </Tr>
                ))
              )}
            </tbody>
          </Table>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader
            title="Сүүлийн үйл ажиллагаа"
            description="Менежерийн хийсэн үйлдлүүд"
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
              {data.recentActivity.length === 0 ? (
                <EmptyRow colSpan={4} icon={<AlertTriangle />}>
                  Үйлдэл бүртгэгдээгүй байна.
                </EmptyRow>
              ) : (
                data.recentActivity.map((log) => (
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
