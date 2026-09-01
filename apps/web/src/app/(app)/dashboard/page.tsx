import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { BarChart } from "@/components/ui/BarChart";
import { Card, CardBody, CardHeader, StatCard } from "@/components/ui/Card";
import { EmptyRow, Table, Td, Th } from "@/components/ui/Table";
import { requirePageUser } from "@/lib/auth/guards";
import { AUDIT_ACTION_LABEL } from "@/lib/audit";
import { formatDate, formatDateTime, formatMoney, formatQty } from "@/lib/format";
import { getDashboardData } from "@/server/services/dashboard";

export const metadata = { title: "Хянах самбар | Начин ERP" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requirePageUser();
  const data = await getDashboardData();

  return (
    <>
      <PageHeader
        title="Хянах самбар"
        description={`Сайн байна уу, ${user.name}. Өнөөдрийн байдлаар.`}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        <StatCard
          label="Өнөөдрийн борлуулалт"
          value={formatMoney(data.todaySales)}
          hint={`Өчигдөр: ${formatMoney(data.yesterdaySales)}`}
        />
        <StatCard label="Энэ сарын борлуулалт" value={formatMoney(data.monthSales)} />
        <StatCard label="Өнөөдрийн худалдан авалт" value={formatMoney(data.todayPurchases)} />
        <StatCard label="Өнөөдрийн бусад зардал" value={formatMoney(data.todayExpenses)} />
        <StatCard label="Банкны үлдэгдэл" value={formatMoney(data.bankBalance)} />
        <StatCard label="Өнөөдрийн бэлэн орлого" value={formatMoney(data.todayCashIn)} />
        <StatCard
          label="Маргааш банканд тушаах"
          value={formatMoney(data.pendingDeposit)}
          tone={data.pendingDeposit.greaterThan(0) ? "warning" : "default"}
        />
        <StatCard label="Нөөцийн нийт өртөг" value={formatMoney(data.inventoryTotalValue)} />
        <StatCard
          label="Дутагдалтай бараа"
          value={`${data.lowStockCount} нэр төрөл`}
          tone={data.lowStockCount > 0 ? "warning" : "default"}
        />
        <StatCard
          label="Тооллогын зөрүү"
          value={formatMoney(data.varianceAmount)}
          tone={data.varianceAmount.isNegative() ? "negative" : "default"}
        />
      </div>

      <Card className="mb-6">
        <CardHeader title="Борлуулалтын чиг хандлага" description="Сүүлийн 7 хоног" />
        <CardBody>
          <BarChart data={data.salesTrend} />
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Хамгийн их борлуулалттай"
            description="Энэ сар"
            action={
              <Link href="/reports?report=products" className="text-sm text-brand-600 hover:underline">
                Бүгд
              </Link>
            }
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
                <EmptyRow colSpan={4} />
              ) : (
                data.topProducts.map((product) => (
                  <tr key={product.productId}>
                    <Td>
                      <Link href={`/products/${product.productId}`} className="text-brand-600 hover:underline">
                        {product.name}
                      </Link>
                    </Td>
                    <Td align="right">{formatQty(product.quantity)}</Td>
                    <Td align="right">{formatMoney(product.revenue)}</Td>
                    <Td align="right" className="text-emerald-600">
                      {formatMoney(product.profit)}
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </Card>

        <Card>
          <CardHeader
            title="Дутагдалтай бараа материал"
            action={
              <Link href="/materials?status=low" className="text-sm text-brand-600 hover:underline">
                Бүгд
              </Link>
            }
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
                <EmptyRow colSpan={3}>Дутагдалтай бараа алга.</EmptyRow>
              ) : (
                data.lowStockItems.map((item) => (
                  <tr key={item.id}>
                    <Td>
                      <Link href={`/materials/${item.id}`} className="text-brand-600 hover:underline">
                        {item.name}
                      </Link>
                    </Td>
                    <Td align="right" className="font-medium text-amber-600">
                      {formatQty(item.quantity)} {item.unit}
                    </Td>
                    <Td align="right" className="text-slate-500">
                      {formatQty(item.minimumStock)}
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </Card>

        <Card>
          <CardHeader title="Хамгийн том зардлууд" description="Энэ сар" />
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
                <EmptyRow colSpan={3} />
              ) : (
                data.largestExpenses.map((expense) => (
                  <tr key={expense.id}>
                    <Td>{formatDate(expense.date)}</Td>
                    <Td>
                      {expense.category}
                      {expense.description ? (
                        <span className="ml-1 text-xs text-slate-400">{expense.description}</span>
                      ) : null}
                    </Td>
                    <Td align="right" className="font-medium">
                      {formatMoney(expense.amount)}
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </Card>

        <Card>
          <CardHeader title="Сүүлийн тооллогын зөрүү" />
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
                <EmptyRow colSpan={4}>Зөрүү бүртгэгдээгүй.</EmptyRow>
              ) : (
                data.recentVariances.map((row) => (
                  <tr key={row.id}>
                    <Td>{formatDate(row.date)}</Td>
                    <Td>{row.materialName}</Td>
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

        <Card className="lg:col-span-2">
          <CardHeader
            title="Менежерийн сүүлийн үйлдлүүд"
            action={
              <Link href="/audit" className="text-sm text-brand-600 hover:underline">
                Бүх түүх
              </Link>
            }
          />
          <Table>
            <thead>
              <tr>
                <Th>Огноо</Th>
                <Th>Хэрэглэгч</Th>
                <Th>Үйлдэл</Th>
                <Th>Бүртгэл</Th>
              </tr>
            </thead>
            <tbody>
              {data.recentActivity.length === 0 ? (
                <EmptyRow colSpan={4}>Үйлдэл бүртгэгдээгүй.</EmptyRow>
              ) : (
                data.recentActivity.map((log) => (
                  <tr key={log.id}>
                    <Td className="whitespace-nowrap">{formatDateTime(log.createdAt)}</Td>
                    <Td>{log.userName}</Td>
                    <Td>{AUDIT_ACTION_LABEL[log.action] ?? log.action}</Td>
                    <Td className="text-slate-500">{log.entityType}</Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </Card>
      </div>
    </>
  );
}
