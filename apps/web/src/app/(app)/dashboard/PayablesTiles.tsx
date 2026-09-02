import Link from "next/link";
import { CalendarClock, HandCoins, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card, CardHeader } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { EmptyRow, Table, TableLink, Td, Th, Tr } from "@/components/ui/Table";
import { formatDate, formatMoney } from "@/lib/format";
import { PAYABLE_STATUS_LABEL, PAYABLE_STATUS_TONE } from "@/lib/payables";
import { getUpcomingPayables, totalsFromPayables, listPayables } from "@/server/services/payables";

/**
 * ЭЗНИЙ хяналтын самбарын өглөгийн хэсэг.
 *
 * Зориудаар нягт: гурван үзүүлэлт ба ойрын таван төлөлт. Дэлгэрэнгүй нь
 * "Мөнгө" хуудсанд. Хяналтын самбарын бусад хэсгийг хөндөөгүй.
 */
export async function PayablesTiles() {
  const now = new Date();
  const all = await listPayables({ now });
  const totals = totalsFromPayables(all, now);

  // Огт өглөггүй бол хоосон хэсгээр самбарыг дүүргэхгүй.
  if (totals.openCount === 0) return null;

  const upcoming = await getUpcomingPayables(5, now);

  return (
    <>
      <section className="mb-3 grid auto-rows-fr gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="Нийт өглөг"
          value={formatMoney(totals.totalOutstanding)}
          hint={`${totals.openCount} нээлттэй өглөг`}
          tone="warning"
          icon={<HandCoins />}
        />
        <StatCard
          label="Хугацаа хэтэрсэн өглөг"
          value={formatMoney(totals.overdueOutstanding)}
          hint={`${totals.overdueCount} өглөг`}
          tone={totals.overdueOutstanding.greaterThan(0) ? "negative" : "default"}
          icon={<TriangleAlert />}
        />
        <StatCard
          label="7 хоногт төлөх өглөг"
          value={formatMoney(totals.dueSoonOutstanding)}
          hint={`${totals.dueSoonCount} өглөг`}
          icon={<CalendarClock />}
        />
      </section>

      <Card className="mb-6">
        <CardHeader
          title="Ойрын төлөлтүүд"
          description="Хугацаа хэтэрсэн нь эхэлж харагдана."
          action={
            <Link href="/money" className="text-[13px] font-medium text-brand-600 hover:underline">
              Бүгдийг харах
            </Link>
          }
        />
        <Table>
          <thead>
            <tr>
              <Th>Нийлүүлэгч</Th>
              <Th>Худалдан авалт</Th>
              <Th align="right">Үлдэгдэл</Th>
              <Th>Төлөх хугацаа</Th>
              <Th>Төлөв</Th>
            </tr>
          </thead>
          <tbody>
            {upcoming.length === 0 ? (
              <EmptyRow colSpan={5}>Төлөх өглөг алга байна.</EmptyRow>
            ) : (
              upcoming.map((row) => (
                <Tr key={row.id}>
                  <Td>{row.supplierName}</Td>
                  <Td>
                    <TableLink href={`/purchases/${row.purchaseId}`}>{row.purchaseNo}</TableLink>
                  </Td>
                  <Td align="right" className="font-medium text-ink-900">
                    {formatMoney(row.outstanding)}
                  </Td>
                  <Td muted className="whitespace-nowrap">
                    {row.dueDate ? formatDate(row.dueDate) : "Тодорхойгүй"}
                  </Td>
                  <Td>
                    <Badge tone={PAYABLE_STATUS_TONE[row.status]} dot>
                      {PAYABLE_STATUS_LABEL[row.status]}
                    </Badge>
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
