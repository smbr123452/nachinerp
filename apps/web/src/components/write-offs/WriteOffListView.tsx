import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { StatCard, StatGrid } from "@/components/ui/StatCard";
import { Table, TableLink, Td, Th, Tr } from "@/components/ui/Table";
import { formatDate, formatMoney, formatQty } from "@/lib/format";
import {
  WRITE_OFF_REASON_LABEL,
  writeOffPath,
  writeOffStatusLabel,
  type WriteOffContext,
} from "@/lib/write-offs";
import { listWriteOffs, writeOffReport } from "@/server/services/write-offs";

/**
 * Актын жагсаалт ба хураангуй тайлан — хоёр урсгал ЭНЭ нэг харагдацыг
 * хуваалцана. Ялгаа нь зөвхөн хүрээ: жагсаалт, тайлан хоёулаа тухайн
 * хүрээний баримтуудыг л хамарна.
 */

const STATUS_TONE = { DRAFT: "neutral", POSTED: "danger", REVERSED: "warning" } as const;

/** Тайлангийн анхдагч хамрах хугацаа — сүүлийн 30 хоног. */
function defaultRange() {
  const to = new Date();
  const from = new Date(to.getTime() - 29 * 86_400_000);
  from.setHours(0, 0, 0, 0);
  to.setHours(23, 59, 59, 999);
  return { from, to };
}

export async function WriteOffListView({
  context,
  title,
  description,
  newLabel,
  emptyDescription,
}: {
  context: WriteOffContext;
  title: string;
  description: string;
  newLabel: string;
  emptyDescription: string;
}) {
  const range = defaultRange();
  const [acts, report] = await Promise.all([
    listWriteOffs({ context }, 100),
    writeOffReport(range, context),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title={title}
        description={description}
        action={
          <Link href={writeOffPath(context, "/new")}>
            <Button>
              <Plus className="h-4 w-4" />
              {newLabel}
            </Button>
          </Link>
        }
      />

      {/* Сүүлийн 30 хоногийн хорогдол. Буцаагдсан акт дүнд ОРОХГҮЙ. */}
      <StatGrid>
        <StatCard label="30 хоногийн хорогдол" value={formatMoney(report.totalCost)} />
        <StatCard label="Актын тоо" value={String(report.actCount)} />
        <StatCard label="Хасагдсан нэгж" value={formatQty(report.totalQuantity)} />
        <StatCard label="Буцаагдсан акт" value={String(report.reversedCount)} />
      </StatGrid>

      {report.byReason.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Шалтгаанаар" description="Сүүлийн 30 хоног" />
            <CardBody className="p-0">
              <Table>
                <thead>
                  <tr>
                    <Th>Шалтгаан</Th>
                    <Th align="right">Дүн</Th>
                  </tr>
                </thead>
                <tbody>
                  {report.byReason.map((row) => (
                    <Tr key={row.key}>
                      <Td>
                        {WRITE_OFF_REASON_LABEL[row.key as keyof typeof WRITE_OFF_REASON_LABEL] ??
                          row.label}
                      </Td>
                      <Td align="right">{formatMoney(row.amount)}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Хамгийн их хасагдсан" description="Сүүлийн 30 хоног" />
            <CardBody className="p-0">
              <Table>
                <thead>
                  <tr>
                    <Th>Бараа</Th>
                    <Th align="right">Тоо</Th>
                    <Th align="right">Дүн</Th>
                  </tr>
                </thead>
                <tbody>
                  {report.topItems.map((row) => (
                    <Tr key={row.key}>
                      <Td>{row.label}</Td>
                      <Td align="right">{formatQty(row.quantity)}</Td>
                      <Td align="right">{formatMoney(row.amount)}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </CardBody>
          </Card>
        </div>
      ) : null}

      <Card>
        <CardHeader title="Актын түүх" description="Сүүлийн 100 баримт" />
        <CardBody className="p-0">
          {acts.length === 0 ? (
            <EmptyState title="Акт бүртгэгдээгүй байна" description={emptyDescription} />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Дугаар</Th>
                  <Th>Огноо</Th>
                  <Th>Шалтгаан</Th>
                  <Th>Төлөв</Th>
                  <Th align="right">Мөр</Th>
                  <Th align="right">Дүн</Th>
                  <Th>Бүртгэсэн</Th>
                </tr>
              </thead>
              <tbody>
                {acts.map((act) => (
                  <Tr key={act.id}>
                    <Td>
                      <TableLink href={writeOffPath(context, `/${act.id}`)}>
                        {act.documentNo}
                      </TableLink>
                    </Td>
                    <Td>{formatDate(act.date)}</Td>
                    <Td>{WRITE_OFF_REASON_LABEL[act.reason]}</Td>
                    <Td>
                      <Badge tone={STATUS_TONE[act.status as keyof typeof STATUS_TONE] ?? "neutral"}>
                        {writeOffStatusLabel(act.status)}
                      </Badge>
                    </Td>
                    <Td align="right">{act._count.items}</Td>
                    <Td align="right">
                      {act.status === "DRAFT" ? "—" : formatMoney(act.totalCost)}
                    </Td>
                    <Td>{act.createdBy.name}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
