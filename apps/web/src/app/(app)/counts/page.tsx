import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyRow, Table, TableLink, Td, Th, Tr } from "@/components/ui/Table";
import { requirePageUser } from "@/lib/auth/guards";
import { d, sum } from "@/lib/decimal";
import { formatDate, formatMoney } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Тооллого | Начин ERP" };

export default async function CountsPage() {
  await requirePageUser();

  const counts = await prisma.inventoryCount.findMany({
    include: { createdBy: { select: { name: true } }, items: true },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 100,
  });

  return (
    <>
      <PageHeader
        title="Тооллого"
        description="Биет тооллого. Баталгаажсаны дараа зөрүү бүрд тохируулгын хөдөлгөөн үүснэ."
        action={
          <Link href="/counts/new">
            <Button>+ Шинэ тооллого</Button>
          </Link>
        }
      />

      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Огноо</Th>
              <Th>Баримт</Th>
              <Th align="right">Мөр</Th>
              <Th align="right">Зөрүүтэй</Th>
              <Th align="right">Зөрүүний дүн</Th>
              <Th>Төлөв</Th>
              <Th>Бүртгэсэн</Th>
            </tr>
          </thead>
          <tbody>
            {counts.length === 0 ? (
              <EmptyRow colSpan={7}>Тооллого хийгдээгүй байна.</EmptyRow>
            ) : (
              counts.map((count) => {
                const varianceRows = count.items.filter((i) => !d(i.differenceQuantity).isZero());
                const variance = sum(count.items.map((i) => i.varianceAmount));
                return (
                  <Tr key={count.id}>
                    <Td>{formatDate(count.date)}</Td>
                    <Td>
                      <TableLink href={`/counts/${count.id}`} strong>
                        {count.countNo}
                      </TableLink>
                    </Td>
                    <Td align="right">{count.items.length}</Td>
                    <Td align="right">{count.status === "POSTED" ? varianceRows.length : "-"}</Td>
                    <Td
                      align="right"
                      className={variance.isNegative() ? "text-red-600" : "text-emerald-600"}
                    >
                      {count.status === "POSTED" ? formatMoney(variance) : "-"}
                    </Td>
                    <Td>
                      <StatusBadge status={count.status} />
                    </Td>
                    <Td className="text-ink-500">{count.createdBy.name}</Td>
                  </Tr>
                );
              })
            )}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
