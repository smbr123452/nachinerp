import Link from "next/link";
import { CalendarClock, HandCoins, Scale, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { EmptyRow, Table, TableLink, Td, Th, Tr } from "@/components/ui/Table";
import { DateFilter, FilterBar, FilterSelect } from "@/components/ui/SearchFilters";
import { formatDate, formatMoney } from "@/lib/format";
import { d, type Dec } from "@/lib/decimal";
import { parseDateInput } from "@/lib/dates";
import { PAYABLE_STATUS_LABEL, PAYABLE_STATUS_TONE, type PayableStatus } from "@/lib/payables";
import { listPayables, totalsFromPayables } from "@/server/services/payables";
import { prisma } from "@/lib/prisma";

/**
 * Өглөгийн шүүлтүүрийн query түлхүүрүүд. Мөнгөн дэвтрийн шүүлтүүртэй
 * мөргөлдөхгүйн тулд "p" угтвартай.
 */
export type PayableParams = {
  psupplier?: string;
  pstatus?: string;
  poverdue?: string;
  pdueFrom?: string;
  pdueTo?: string;
};

const STATUS_VALUES: PayableStatus[] = ["UNPAID", "PARTIAL", "PAID", "OVERDUE"];

/**
 * ЭЗНИЙ өглөгийн хяналт: нэгтгэл + жагсаалт.
 *
 * Нэгтгэл нь БҮХ идэвхтэй өглөгөөс бодогдоно — шүүлтүүр зөвхөн доорх
 * хүснэгтэд нөлөөлнө. Ингэснээр шүүсэн үзэл нь нийт өрийг далдлахгүй.
 */
export async function PayablesSection({
  cash,
  bank,
  params,
}: {
  cash: Dec;
  bank: Dec;
  params: PayableParams;
}) {
  const now = new Date();
  const [all, suppliers] = await Promise.all([
    listPayables({ now }),
    prisma.supplier.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const totals = totalsFromPayables(all, now);

  const status = STATUS_VALUES.includes(params.pstatus as PayableStatus)
    ? (params.pstatus as PayableStatus)
    : null;
  const dueFrom = params.pdueFrom ? parseDateInput(params.pdueFrom) : null;
  const dueTo = params.pdueTo ? parseDateInput(params.pdueTo) : null;
  const overdueOnly = params.poverdue === "1";
  const supplierId = params.psupplier || null;

  const rows = all.filter((p) => {
    if (supplierId && p.supplierId !== supplierId) return false;
    if (overdueOnly && p.status !== "OVERDUE") return false;
    if (status && p.status !== status) return false;
    if (dueFrom && (!p.dueDate || p.dueDate.getTime() < dueFrom.getTime())) return false;
    if (dueTo && (!p.dueDate || p.dueDate.getTime() > dueTo.getTime())) return false;
    return true;
  });

  // Өглөгөө хассан мөнгөн байр суурь. Энэ нь АШИГ БИШ: одоо байгаа мөнгөнөөс
  // нийлүүлэгчид өгөх өрийг хассан хөрвөх чадварын хэмжүүр.
  const netLiquidity = d(cash).plus(d(bank)).minus(totals.totalOutstanding);

  return (
    <>
      <section className="mb-6 grid auto-rows-fr gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Нийт өглөг"
          value={formatMoney(totals.totalOutstanding)}
          hint={`${totals.openCount} нээлттэй өглөг`}
          tone={totals.totalOutstanding.greaterThan(0) ? "warning" : "default"}
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
        <StatCard
          label="Өглөг хассан мөнгөн байр суурь"
          value={formatMoney(netLiquidity)}
          hint="Касс + Банк − нийт өглөг"
          tone={netLiquidity.isNegative() ? "negative" : "default"}
          icon={<Scale />}
        />
      </section>

      <FilterBar>
        <FilterSelect
          paramKey="psupplier"
          label="Нийлүүлэгч"
          options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
        />
        <FilterSelect
          paramKey="pstatus"
          label="Өглөгийн төлөв"
          options={STATUS_VALUES.map((value) => ({ value, label: PAYABLE_STATUS_LABEL[value] }))}
        />
        <FilterSelect
          paramKey="poverdue"
          label="Хугацаа"
          allLabel="Бүгд"
          options={[{ value: "1", label: "Зөвхөн хэтэрсэн" }]}
        />
        <DateFilter paramKey="pdueFrom" label="Төлөх хугацаа: эхлэл" />
        <DateFilter paramKey="pdueTo" label="Төлөх хугацаа: төгсгөл" />
      </FilterBar>

      <Card className="mb-6">
        <CardHeader
          title="Нийлүүлэгчийн өглөг"
          description="Зээлээр авсан худалдан авалтууд. Төлбөрийг худалдан авалтын хуудаснаас бүртгэнэ."
        />
        <Table>
          <thead>
            <tr>
              <Th>Нийлүүлэгч</Th>
              <Th>Худалдан авалт</Th>
              <Th>Огноо</Th>
              <Th align="right">Анхны дүн</Th>
              <Th align="right">Төлсөн</Th>
              <Th align="right">Үлдэгдэл</Th>
              <Th>Төлөх хугацаа</Th>
              <Th>Төлөв</Th>
              <Th align="right">Үйлдэл</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <EmptyRow colSpan={9} icon={<HandCoins />}>
                Шүүлтэд тохирох өглөг алга байна.
              </EmptyRow>
            ) : (
              rows.map((row) => (
                <Tr key={row.id}>
                  <Td>
                    <TableLink href={`/purchases/suppliers/${row.supplierId}`}>
                      {row.supplierName}
                    </TableLink>
                  </Td>
                  <Td>
                    <TableLink href={`/purchases/${row.purchaseId}`}>{row.purchaseNo}</TableLink>
                  </Td>
                  <Td muted className="whitespace-nowrap">
                    {formatDate(row.purchaseDate)}
                  </Td>
                  <Td align="right">{formatMoney(row.originalAmount)}</Td>
                  <Td align="right" muted>
                    {formatMoney(row.paid)}
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
                  <Td align="right">
                    <Link
                      href={`/purchases/${row.purchaseId}`}
                      className="text-[13px] font-medium text-brand-600 hover:underline"
                    >
                      {row.outstanding.greaterThan(0) ? "Төлбөр хийх" : "Дэлгэрэнгүй"}
                    </Link>
                  </Td>
                </Tr>
              ))
            )}
          </tbody>
        </Table>
        <CardBody className="border-t border-ink-200">
          <p className="text-xs leading-5 text-ink-500">
            Төлсөн дүн, үлдэгдэл нь бүртгэгдсэн төлбөрүүдээс тооцогдоно — тусад нь
            хадгалагддаггүй. Нийлүүлэгчид хийсэн төлбөр нь шинэ зардал биш: зөвхөн мөнгө
            гарч, өр буурна.
          </p>
        </CardBody>
      </Card>
    </>
  );
}
