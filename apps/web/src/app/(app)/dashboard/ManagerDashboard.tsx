import Link from "next/link";
import {
  Banknote,
  ClipboardCheck,
  CreditCard,
  Landmark,
  PackageX,
  Plus,
  Receipt,
  ShoppingCart,
  TrendingUp,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { BarChart } from "@/components/ui/BarChart";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { StatCard, StatGrid } from "@/components/ui/StatCard";
import { EmptyRow, Table, TableLink, Td, Th, Tr } from "@/components/ui/Table";
import { formatDate, formatMoney, formatQty } from "@/lib/format";
import { getManagerDashboard } from "@/server/services/dashboard";
import { AlertList, MoreLink, StockSeverityBadge } from "./shared";

/** Менежерийн зөвшөөрөлтэй үйлдлүүд — байгаа маршрутуудыг ашиглана. */
const QUICK_ACTIONS = [
  { href: "/sales/new", label: "Борлуулалт бүртгэх", icon: TrendingUp, primary: true },
  { href: "/purchases/new", label: "Худалдан авалт", icon: ShoppingCart },
  { href: "/expenses", label: "Зардал бүртгэх", icon: Receipt },
  { href: "/counts/new", label: "Тооллого эхлүүлэх", icon: ClipboardCheck },
  { href: "/money", label: "Банканд тушаах", icon: Landmark },
];

const KIND_TONE = {
  SALE: "success",
  PURCHASE: "info",
  EXPENSE: "warning",
} as const;

/**
 * МЕНЕЖЕРИЙН самбар — "Өнөөдөр юунд анхаарах вэ?" гэсэн асуултад хариулна.
 * Стратегийн санхүүгийн шинжилгээ энд ОРОХГҮЙ.
 */
export async function ManagerDashboard({ userName }: { userName: string }) {
  const data = await getManagerDashboard();

  const today = new Intl.DateTimeFormat("mn-MN", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date());

  return (
    <>
      <PageHeader title={`Сайн байна уу, ${userName.split(" ")[0]}`} description={today} />

      {/* Хурдан үйлдлүүд — өдөр тутмын ажил эндээс эхэлнэ */}
      <div className="no-print mb-4 flex flex-wrap gap-2">
        {QUICK_ACTIONS.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className={
              action.primary
                ? "inline-flex h-10 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-700"
                : "inline-flex h-10 items-center gap-2 rounded-lg border border-ink-300 bg-white px-4 text-sm font-medium text-ink-700 shadow-sm transition-colors hover:border-ink-400 hover:bg-ink-50"
            }
          >
            {action.primary ? (
              <Plus aria-hidden className="h-4 w-4" />
            ) : (
              <action.icon aria-hidden className="h-4 w-4 text-ink-400" />
            )}
            {action.label}
          </Link>
        ))}
      </div>

      {/* Өдрийн үйл ажиллагааны үзүүлэлт */}
      <StatGrid className="mb-4 xl:grid-cols-3 2xl:grid-cols-6" columns={3}>
        <StatCard
          label="Өнөөдрийн борлуулалт"
          value={formatMoney(data.kpi.todaySales)}
          icon={<TrendingUp />}
          tone="brand"
        />
        <StatCard
          label="Өнөөдөр зарагдсан"
          value={`${formatQty(data.kpi.todayItemsSold)} ш`}
          icon={<ShoppingCart />}
        />
        <StatCard
          label="Бэлэн орлого"
          value={formatMoney(data.kpi.todayCashIn)}
          icon={<Banknote />}
        />
        <StatCard
          label="Карт / QR орлого"
          value={formatMoney(data.kpi.todayCardQrIn)}
          icon={<CreditCard />}
        />
        <StatCard
          label="Банканд тушаах"
          value={formatMoney(data.kpi.pendingDeposit)}
          tone={data.kpi.pendingDeposit.greaterThan(0) ? "warning" : "default"}
          hint={data.kpi.pendingDeposit.greaterThan(0) ? "Кассд байгаа бэлэн мөнгө" : undefined}
          icon={<Landmark />}
        />
        <StatCard
          label="Нөөц багассан"
          value={`${data.kpi.lowStockCount + data.kpi.outOfStockCount} нэр`}
          tone={data.kpi.outOfStockCount > 0 ? "negative" : data.kpi.lowStockCount > 0 ? "warning" : "default"}
          hint={data.kpi.outOfStockCount > 0 ? `${data.kpi.outOfStockCount} нь нөөцгүй` : undefined}
          icon={<PackageX />}
        />
      </StatGrid>

      <div className="grid items-start gap-3 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Сүүлийн 7 хоногийн борлуулалт"
            description="Өдөр тутмын нийт орлого"
            action={<MoreLink href="/sales" />}
          />
          <CardBody>
            <BarChart data={data.salesTrend} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Өнөөдөр анхаарах" description="Одоо биелж буй нөхцөлүүд" />
          <CardBody>
            <AlertList alerts={data.tasks} empty="Онцгой анхаарах зүйл алга. Ажил хэвийн." />
          </CardBody>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader
            title="Нөөц нөхөх шаардлагатай"
            description="Нөөцгүй болон доод хэмжээнээс доош орсон бараа"
            action={<MoreLink href="/materials?status=low" />}
          />
          <Table>
            <thead>
              <tr>
                <Th>Бараа</Th>
                <Th align="right">Одоогийн үлдэгдэл</Th>
                <Th align="right">Доод нөөц</Th>
                <Th>Нэгж</Th>
                <Th>Төлөв</Th>
              </tr>
            </thead>
            <tbody>
              {data.lowStock.length === 0 ? (
                <EmptyRow colSpan={5} icon={<ClipboardCheck />}>
                  Бүх бараа хангалттай нөөцтэй байна.
                </EmptyRow>
              ) : (
                data.lowStock.map((item) => (
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
        </Card>

        <Card>
          <CardHeader title="Сүүлийн үйл ажиллагаа" description="Бүртгэсэн баримтууд" />
          <Table>
            <thead>
              <tr>
                <Th>Огноо</Th>
                <Th>Төрөл</Th>
                <Th align="right">Дүн</Th>
              </tr>
            </thead>
            <tbody>
              {data.recentOperations.length === 0 ? (
                <EmptyRow colSpan={3} icon={<Receipt />}>
                  Баримт бүртгэгдээгүй байна.
                </EmptyRow>
              ) : (
                data.recentOperations.map((row) => (
                  <Tr key={row.id}>
                    <Td muted className="whitespace-nowrap">
                      {formatDate(row.date)}
                    </Td>
                    <Td>
                      <TableLink href={row.href}>{row.reference}</TableLink>
                      <div className="mt-1">
                        <Badge tone={KIND_TONE[row.kind]}>{row.label}</Badge>
                      </div>
                    </Td>
                    <Td align="right" className="font-medium text-ink-900">
                      {formatMoney(row.amount)}
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
