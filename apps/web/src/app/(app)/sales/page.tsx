import Link from "next/link";
import { Prisma } from "@prisma/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { EmptyRow, Table, TableLink, Td, Th, Tr } from "@/components/ui/Table";
import { DateFilter, FilterBar, FilterSelect } from "@/components/ui/SearchFilters";
import { requirePageUser } from "@/lib/auth/guards";
import { sum } from "@/lib/decimal";
import { formatDate, formatMoney } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { parseDateInput } from "@/lib/dates";

export const metadata = { title: "Борлуулалт" };

type SearchParams = Promise<{ from?: string; to?: string; status?: string }>;

export default async function SalesPage({ searchParams }: { searchParams: SearchParams }) {
  await requirePageUser();
  const params = await searchParams;

  const where: Prisma.SaleBatchWhereInput = {};
  if (params.from || params.to) {
    where.date = {};
    if (params.from) where.date.gte = parseDateInput(params.from);
    if (params.to) where.date.lt = new Date(parseDateInput(params.to).getTime() + 86400000);
  }
  if (params.status === "posted") where.status = "POSTED";
  if (params.status === "cancelled") where.status = "CANCELLED";

  const batches = await prisma.saleBatch.findMany({
    where,
    include: { createdBy: { select: { name: true } }, _count: { select: { items: true } } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 200,
  });

  const posted = batches.filter((b) => b.status === "POSTED");
  const revenue = sum(posted.map((b) => b.totalRevenue));
  const cogs = sum(posted.map((b) => b.totalCogs));
  const profit = sum(posted.map((b) => b.grossProfit));

  return (
    <>
      <PageHeader
        title="Борлуулалт"
        description="Өдөр бүрийн борлуулалтын бүртгэл"
        action={
          <Link href="/sales/new">
            <Button>+ Өдрийн борлуулалт</Button>
          </Link>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatCard label="Нийт орлого" value={formatMoney(revenue)} />
        <StatCard label="Нийт өртөг (ББӨ)" value={formatMoney(cogs)} />
        <StatCard label="Нийт ашиг" value={formatMoney(profit)} tone="positive" />
      </div>

      <FilterBar>
        <DateFilter paramKey="from" label="Эхлэх огноо" />
        <DateFilter paramKey="to" label="Дуусах огноо" />
        <FilterSelect
          paramKey="status"
          label="Төлөв"
          options={[
            { value: "posted", label: "Батлагдсан" },
            { value: "cancelled", label: "Цуцалсан" },
          ]}
        />
      </FilterBar>

      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Огноо</Th>
              <Th>Баримт</Th>
              <Th align="right">Мөр</Th>
              <Th align="right">Орлого</Th>
              <Th align="right">Бэлэн</Th>
              <Th align="right">Карт / QR / Данс</Th>
              <Th align="right">ББӨ</Th>
              <Th align="right">Ашиг</Th>
              <Th>Төлөв</Th>
              <Th>Бүртгэсэн</Th>
            </tr>
          </thead>
          <tbody>
            {batches.length === 0 ? (
              <EmptyRow colSpan={10}>Борлуулалт бүртгэгдээгүй байна.</EmptyRow>
            ) : (
              batches.map((batch) => (
                <Tr key={batch.id}>
                  <Td>{formatDate(batch.date)}</Td>
                  <Td>
                    <TableLink href={`/sales/${batch.id}`} strong>
                      {batch.batchNo}
                    </TableLink>
                  </Td>
                  <Td align="right">{batch._count.items}</Td>
                  <Td align="right" className="font-medium">
                    {formatMoney(batch.totalRevenue)}
                  </Td>
                  <Td align="right">{formatMoney(batch.cashAmount)}</Td>
                  <Td align="right">
                    {formatMoney(
                      sum([batch.cardAmount, batch.qrAmount, batch.bankTransferAmount, batch.otherAmount]),
                    )}
                  </Td>
                  <Td align="right" className="text-ink-500">
                    {formatMoney(batch.totalCogs)}
                  </Td>
                  <Td align="right" className="text-emerald-600">
                    {formatMoney(batch.grossProfit)}
                  </Td>
                  <Td>
                    <StatusBadge status={batch.status} />
                  </Td>
                  <Td className="text-ink-500">{batch.createdBy.name}</Td>
                </Tr>
              ))
            )}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
