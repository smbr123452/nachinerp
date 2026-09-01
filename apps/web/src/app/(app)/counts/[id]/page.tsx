import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { StatusBadge } from "@/components/ui/Badge";
import { Card, CardHeader } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { CancelDocumentButton } from "@/components/ui/ConfirmAction";
import { Table, TableLink, Td, Th, TotalRow } from "@/components/ui/Table";
import { requirePageUser } from "@/lib/auth/guards";
import { d, sum } from "@/lib/decimal";
import { formatDate, formatDateTime, formatMoney, formatQty } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { unitLabel } from "@/lib/units";
import { cancelCountAction } from "../actions";
import { CountSheet, type CountSheetRow } from "./CountSheet";

type Params = Promise<{ id: string }>;

export default async function CountDetailPage({ params }: { params: Params }) {
  await requirePageUser();
  const { id } = await params;

  const count = await prisma.inventoryCount.findUnique({
    where: { id },
    include: {
      createdBy: { select: { name: true } },
      items: { include: { rawMaterial: true }, orderBy: { rawMaterial: { name: "asc" } } },
    },
  });
  if (!count) notFound();

  const isDraft = count.status === "DRAFT";
  const totalVariance = sum(count.items.map((i) => i.varianceAmount));
  const diffCount = count.items.filter((i) => !d(i.differenceQuantity).isZero()).length;

  const rows: CountSheetRow[] = count.items.map((item) => ({
    rawMaterialId: item.rawMaterialId,
    name: item.rawMaterial.name,
    sku: item.rawMaterial.sku,
    unit: unitLabel(item.rawMaterial.unit),
    // Ноорог хуудсанд одоогийн бодит үлдэгдлийг харуулна.
    systemQuantity: d(item.rawMaterial.quantity).toNumber(),
    countedQuantity: item.countedQuantity.toString(),
    unitCost: d(item.rawMaterial.averageCost).toNumber(),
  }));

  return (
    <>
      <PageHeader
        backHref="/counts"
        title={`Тооллого ${count.countNo}`}
        description={`${formatDate(count.date)} · ${count.items.length} нэр төрөл`}
        action={isDraft ? (
              <CancelDocumentButton
                id={count.id}
                action={cancelCountAction}
                title="Тооллого цуцлах"
                description="Ноорог тооллого цуцлагдана. Нөөцөд өөрчлөлт орохгүй."
              />
            ) : null}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <StatusBadge status={count.status} />
        <span className="text-sm text-ink-500">Бүртгэсэн: {count.createdBy.name}</span>
        {count.completedAt ? (
          <span className="text-sm text-ink-500">Баталгаажсан: {formatDateTime(count.completedAt)}</span>
        ) : null}
      </div>

      {count.note ? (
        <Alert tone="info" className="mb-4">
          {count.note}
        </Alert>
      ) : null}

      {count.status === "CANCELLED" ? (
        <Alert tone="error" className="mb-4" title="Энэ тооллого цуцлагдсан">
          {count.cancelNote ?? "Шалтгаан бичигдээгүй."}
        </Alert>
      ) : null}

      {isDraft ? (
        <CountSheet countId={count.id} rows={rows} />
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <StatCard label="Тоолсон нэр төрөл" value={count.items.length} />
            <StatCard label="Зөрүүтэй мөр" value={diffCount} tone={diffCount > 0 ? "warning" : "default"} />
            <StatCard
              label="Нийт зөрүүний дүн"
              value={formatMoney(totalVariance)}
              tone={totalVariance.isNegative() ? "negative" : "positive"}
            />
          </div>

          <Card>
            <CardHeader title="Тооллогын үр дүн" />
            <Table>
              <thead>
                <tr>
                  <Th>Материал</Th>
                  <Th align="right">Систем</Th>
                  <Th align="right">Тоолсон</Th>
                  <Th align="right">Зөрүү</Th>
                  <Th align="right">Нэгж өртөг</Th>
                  <Th align="right">Зөрүүний дүн</Th>
                </tr>
              </thead>
              <tbody>
                {count.items.map((item) => {
                  const difference = d(item.differenceQuantity);
                  return (
                    <tr key={item.id} className={difference.isZero() ? "" : "bg-amber-50"}>
                      <Td>
                        <TableLink href={`/materials/${item.rawMaterialId}`}>
                          {item.rawMaterial.name}
                        </TableLink>
                      </Td>
                      <Td align="right">
                        {formatQty(item.systemQuantity)} {unitLabel(item.rawMaterial.unit)}
                      </Td>
                      <Td align="right">{formatQty(item.countedQuantity)}</Td>
                      <Td
                        align="right"
                        className={
                          difference.isNegative()
                            ? "font-medium text-red-600"
                            : difference.isZero()
                              ? ""
                              : "font-medium text-emerald-600"
                        }
                      >
                        {difference.greaterThan(0) ? "+" : ""}
                        {formatQty(difference)}
                      </Td>
                      <Td align="right" className="text-ink-500">
                        {formatMoney(item.weightedAverageCost)}
                      </Td>
                      <Td align="right" className={d(item.varianceAmount).isNegative() ? "text-red-600" : ""}>
                        {formatMoney(item.varianceAmount)}
                      </Td>
                    </tr>
                  );
                })}
                <TotalRow>
                  <Td colSpan={5}>Нийт</Td>
                  <Td align="right" className={totalVariance.isNegative() ? "text-red-600" : "text-emerald-600"}>
                    {formatMoney(totalVariance)}
                  </Td>
                </TotalRow>
              </tbody>
            </Table>
          </Card>
        </>
      )}
    </>
  );
}
