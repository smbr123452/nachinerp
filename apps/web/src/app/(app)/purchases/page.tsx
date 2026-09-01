import Link from "next/link";
import { Prisma } from "@prisma/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatusBadge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyRow, Table, TableLink, Td, Th, Tr } from "@/components/ui/Table";
import { DateFilter, FilterBar, FilterSelect } from "@/components/ui/SearchFilters";
import { Button } from "@/components/ui/Button";
import { requirePageUser } from "@/lib/auth/guards";
import { sum } from "@/lib/decimal";
import { formatDate, formatMoney } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { parseDateInput } from "@/lib/dates";
import { PURCHASE_PAYMENT_LABEL } from "@/server/services/purchases";

export const metadata = { title: "Худалдан авалт | Начин ERP" };

type SearchParams = Promise<{ from?: string; to?: string; status?: string }>;

export default async function PurchasesPage({ searchParams }: { searchParams: SearchParams }) {
  await requirePageUser();
  const params = await searchParams;

  const where: Prisma.PurchaseWhereInput = {};
  if (params.from || params.to) {
    where.date = {};
    if (params.from) where.date.gte = parseDateInput(params.from);
    if (params.to) where.date.lt = new Date(parseDateInput(params.to).getTime() + 86400000);
  }
  if (params.status === "posted") where.status = "POSTED";
  if (params.status === "cancelled") where.status = "CANCELLED";

  const purchases = await prisma.purchase.findMany({
    where,
    include: { supplier: true, createdBy: { select: { name: true } }, _count: { select: { items: true } } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 200,
  });

  const postedTotal = sum(purchases.filter((p) => p.status === "POSTED").map((p) => p.totalAmount));

  return (
    <>
      <PageHeader
        title="Худалдан авалт"
        description={`Батлагдсан баримтын нийт дүн ${formatMoney(postedTotal)}`}
        action={
          <Link href="/purchases/new">
            <Button>+ Шинэ худалдан авалт</Button>
          </Link>
        }
      />

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
              <Th>Баримтын дугаар</Th>
              <Th>Нийлүүлэгч</Th>
              <Th>Төлбөр</Th>
              <Th align="right">Мөр</Th>
              <Th align="right">Дүн</Th>
              <Th>Төлөв</Th>
              <Th>Бүртгэсэн</Th>
            </tr>
          </thead>
          <tbody>
            {purchases.length === 0 ? (
              <EmptyRow colSpan={8}>Худалдан авалт бүртгэгдээгүй байна.</EmptyRow>
            ) : (
              purchases.map((purchase) => (
                <Tr key={purchase.id}>
                  <Td>{formatDate(purchase.date)}</Td>
                  <Td>
                    <TableLink href={`/purchases/${purchase.id}`} strong>
                      {purchase.purchaseNo}
                    </TableLink>
                  </Td>
                  <Td className="text-ink-500">{purchase.supplier?.name ?? "-"}</Td>
                  <Td className="text-ink-500">{PURCHASE_PAYMENT_LABEL[purchase.paymentMethod]}</Td>
                  <Td align="right">{purchase._count.items}</Td>
                  <Td align="right" className="font-medium">
                    {formatMoney(purchase.totalAmount)}
                  </Td>
                  <Td>
                    <StatusBadge status={purchase.status} />
                  </Td>
                  <Td className="text-ink-500">{purchase.createdBy.name}</Td>
                </Tr>
              ))
            )}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
