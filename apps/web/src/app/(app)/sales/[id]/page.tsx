import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { StatusBadge } from "@/components/ui/Badge";
import { Card, CardHeader } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { CancelDocumentButton } from "@/components/ui/ConfirmAction";
import { Table, TableLink, Td, Th, TotalRow, Tr } from "@/components/ui/Table";
import { requirePageUser } from "@/lib/auth/guards";
import { d, sum, ZERO } from "@/lib/decimal";
import { formatDate, formatDateTime, formatMoney, formatMoneyPrecise, formatPercent, formatQty } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { unitLabel } from "@/lib/units";
import { subjectDisplay } from "@/lib/stock-subject";
import { MOVEMENT_TYPE_LABEL } from "@/lib/movements";
import { cancelSaleBatchAction } from "../actions";

type Params = Promise<{ id: string }>;

export default async function SaleDetailPage({ params }: { params: Params }) {
  await requirePageUser();
  const { id } = await params;

  const batch = await prisma.saleBatch.findUnique({
    where: { id },
    include: {
      createdBy: { select: { name: true } },
      items: { include: { product: { select: { id: true, name: true, sku: true } } } },
    },
  });
  if (!batch) notFound();

  const movements = await prisma.inventoryMovement.findMany({
    where: { referenceId: batch.id, referenceType: { in: ["SALE", "SALE_CANCEL"] } },
    include: {
      rawMaterial: { select: { name: true, unit: true } },
      product: { select: { name: true, unit: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const margin = d(batch.totalRevenue).greaterThan(0)
    ? d(batch.grossProfit).dividedBy(d(batch.totalRevenue)).times(100)
    : ZERO;
  const bankTotal = sum([batch.cardAmount, batch.qrAmount, batch.bankTransferAmount, batch.otherAmount]);

  return (
    <>
      <PageHeader
        backHref="/sales"
        title={`Борлуулалт ${batch.batchNo}`}
        description={`${formatDate(batch.date)} · ${batch.items.length} нэр төрөл`}
        action={batch.status === "POSTED" ? (
              <CancelDocumentButton
                id={batch.id}
                action={cancelSaleBatchAction}
                title="Борлуулалт цуцлах"
                description="Хэрэглэсэн материал тухайн үеийн өртгөөр буцаж орлогодогдоно."
              />
            ) : null}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <StatusBadge status={batch.status} />
        <span className="text-sm text-ink-500">Бүртгэсэн: {batch.createdBy.name}</span>
        <span className="text-sm text-ink-500">{formatDateTime(batch.createdAt)}</span>
      </div>

      {batch.status === "CANCELLED" ? (
        <Alert tone="error" className="mb-4" title="Энэ борлуулалт цуцлагдсан">
          {batch.cancelNote ?? "Шалтгаан бичигдээгүй."}
        </Alert>
      ) : null}

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Нийт орлого" value={formatMoney(batch.totalRevenue)} />
        <StatCard label="Борлуулсан бүтээгдэхүүний өртөг" value={formatMoney(batch.totalCogs)} />
        <StatCard label="Нийт ашиг" value={formatMoney(batch.grossProfit)} tone="positive" />
        <StatCard label="Ашгийн хувь" value={formatPercent(margin.toNumber())} />
      </div>

      <div className="mb-4 grid gap-3 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Борлуулсан бүтээгдэхүүн" />
          <Table>
            <thead>
              <tr>
                <Th>Бүтээгдэхүүн</Th>
                <Th align="right">Тоо</Th>
                <Th align="right">Үнэ</Th>
                <Th align="right">Орлого</Th>
                <Th align="right">Нэгж өртөг</Th>
                <Th align="right">Ашиг</Th>
              </tr>
            </thead>
            <tbody>
              {batch.items.map((item) => (
                <Tr key={item.id}>
                  <Td>
                    <TableLink href={`/products/${item.productId}`}>
                      {item.product.name}
                    </TableLink>
                  </Td>
                  <Td align="right">{formatQty(item.quantity)}</Td>
                  <Td align="right">{formatMoney(item.unitPrice)}</Td>
                  <Td align="right" className="font-medium">
                    {formatMoney(item.total)}
                  </Td>
                  <Td align="right" className="text-ink-500">
                    {formatMoneyPrecise(item.unitCost)}
                  </Td>
                  <Td align="right" className="text-emerald-600">
                    {formatMoney(d(item.total).minus(d(item.totalCost)))}
                  </Td>
                </Tr>
              ))}
              <TotalRow>
                <Td colSpan={3}>Нийт</Td>
                <Td align="right">{formatMoney(batch.totalRevenue)}</Td>
                <Td />
                <Td align="right">{formatMoney(batch.grossProfit)}</Td>
              </TotalRow>
            </tbody>
          </Table>
        </Card>

        <Card>
          <CardHeader title="Төлбөрийн хуваарилалт" />
          <Table>
            <tbody>
              <Tr>
                <Td className="text-ink-500">Бэлэн (касс)</Td>
                <Td align="right">{formatMoney(batch.cashAmount)}</Td>
              </Tr>
              <Tr>
                <Td className="text-ink-500">Карт</Td>
                <Td align="right">{formatMoney(batch.cardAmount)}</Td>
              </Tr>
              <Tr>
                <Td className="text-ink-500">QR</Td>
                <Td align="right">{formatMoney(batch.qrAmount)}</Td>
              </Tr>
              <Tr>
                <Td className="text-ink-500">Дансаар</Td>
                <Td align="right">{formatMoney(batch.bankTransferAmount)}</Td>
              </Tr>
              <Tr>
                <Td className="text-ink-500">Бусад</Td>
                <Td align="right">{formatMoney(batch.otherAmount)}</Td>
              </Tr>
              <TotalRow>
                <Td>Банкинд орсон</Td>
                <Td align="right">{formatMoney(bankTotal)}</Td>
              </TotalRow>
            </tbody>
          </Table>
        </Card>
      </div>

      <Card>
        <CardHeader title="Хасагдсан материал" description="Тухайн үеийн жигнэсэн дундаж өртгөөр" />
        <Table>
          <thead>
            <tr>
              <Th>Материал</Th>
              <Th>Төрөл</Th>
              <Th align="right">Хэмжээ</Th>
              <Th align="right">Нэгж өртөг</Th>
              <Th align="right">Өртгийн дүн</Th>
              <Th align="right">Дараах үлдэгдэл</Th>
            </tr>
          </thead>
          <tbody>
            {movements.map((movement) => {
              const subject = subjectDisplay(movement);
              return (
              <Tr key={movement.id}>
                <Td>{subject.name}</Td>
                <Td className="text-ink-500">{MOVEMENT_TYPE_LABEL[movement.movementType]}</Td>
                <Td align="right">
                  {formatQty(movement.quantity)} {subject.unit ? unitLabel(subject.unit) : ""}
                </Td>
                <Td align="right">{formatMoneyPrecise(movement.unitCost)}</Td>
                <Td align="right">{formatMoney(movement.totalCost)}</Td>
                <Td align="right">{formatQty(movement.balanceAfter)}</Td>
              </Tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
