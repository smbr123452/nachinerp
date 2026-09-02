import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Table, Td, Th, TotalRow, Tr } from "@/components/ui/Table";
import { requirePageUser } from "@/lib/auth/guards";
import { formatDate, formatDateTime, formatMoney, formatMoneyPrecise, formatQty } from "@/lib/format";
import { unitLabel } from "@/lib/units";
import {
  isLegacyMixed,
  WRITE_OFF_CONTEXT_LABEL,
  WRITE_OFF_REASON_LABEL,
  writeOffPath,
  writeOffStatusLabel,
  type WriteOffContext,
} from "@/lib/write-offs";
import { getWriteOff } from "@/server/services/write-offs";
import { WriteOffActions } from "./WriteOffActions";

/**
 * Актын дэлгэрэнгүй — хоёр урсгал ЭНЭ нэг харагдацыг хуваалцана.
 *
 * Хүрээ таарахгүй бол зөв урсгал руу шилжүүлнэ: бүтээгдэхүүний актыг
 * материалын замаар нээвэл бүтээгдэхүүний зам руу очно. Хуучин ХОЛИМОГ
 * баримт аль ч замаар нээгдэх бөгөөд тусгайлан тэмдэглэгдэнэ.
 */

const STATUS_TONE = { DRAFT: "neutral", POSTED: "danger", REVERSED: "warning" } as const;

export async function WriteOffDetailView({
  context,
  id,
}: {
  context: WriteOffContext;
  id: string;
}) {
  const user = await requirePageUser();
  const act = await getWriteOff(id);
  if (!act) notFound();

  // Хуучин холимог баримт аль ч замаар нээгдэнэ. Бусад тохиолдолд баримт
  // өөрийн хүрээний зам руу шилжинэ — материалын акт материалын зам дээр,
  // бүтээгдэхүүнийх бүтээгдэхүүний зам дээр л харагдана.
  const legacyMixed = isLegacyMixed(act.context);
  if (act.context !== "MIXED" && act.context !== context) {
    redirect(writeOffPath(act.context, `/${act.id}`));
  }
  // Холимог баримтын үйлдлүүд нээсэн замын хүрээгээр явна.
  const actionContext: WriteOffContext = act.context === "MIXED" ? context : act.context;

  const isDraft = act.status === "DRAFT";
  const isReversed = act.status === "REVERSED";

  // Ноорог үед мөрийн өртөг хараахан царцаагүй тул одоогийн дундаж өртгөөр
  // тооцоолж УРЬДЧИЛСАН дүнг харуулна. Эцсийн дүн батлах үед тогтоно.
  const lines = act.items.map((item) => {
    const subject = item.rawMaterial ?? item.product;
    const unitCost = isDraft
      ? Number(subject && "id" in subject ? 0 : 0)
      : Number(item.frozenUnitCost);
    return {
      id: item.id,
      name: subject?.name ?? "—",
      kind: item.rawMaterialId ? "Бараа материал" : "Бэлэн бүтээгдэхүүн",
      quantity: item.quantity.toString(),
      unit: item.unit,
      unitCost,
      total: Number(item.totalCost),
    };
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title={act.documentNo}
        description={`${WRITE_OFF_REASON_LABEL[act.reason]} · ${formatDate(act.date)}`}
        backHref={writeOffPath(context)}
        meta={
          <Badge tone={STATUS_TONE[act.status as keyof typeof STATUS_TONE] ?? "neutral"}>
            {writeOffStatusLabel(act.status)}
          </Badge>
        }
      />

      {legacyMixed ? (
        <Alert tone="warning" title="Хуучин холимог баримт">
          Энэ акт бараа материал ба бүтээгдэхүүнийг хамтад нь агуулж байна. Шинэ актууд
          хүрээ тус бүрдээ тусад нь үүсдэг. Түүхэн баримт хэвээр уншигдана — засварлах
          боломжгүй.
        </Alert>
      ) : null}

      {isReversed ? (
        <Alert tone="warning" title="Энэ акт буцаагдсан">
          {act.reversedBy?.name ?? "—"} · {formatDateTime(act.reversedAt)}
          {act.reversalNote ? ` · ${act.reversalNote}` : ""}
          <div className="mt-1 text-[13px]">
            Хасагдсан бараа нөөцөд буцаан сэргээгдсэн. Эх хөдөлгөөн болон энэ баримт түүхэнд
            хэвээр үлдэнэ.
          </div>
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <CardHeader title="Бараа" />
          <CardBody className="p-0">
            <Table>
              <thead>
                <tr>
                  <Th>Бараа</Th>
                  <Th>Төрөл</Th>
                  <Th align="right">Тоо хэмжээ</Th>
                  <Th align="right">Царцсан өртөг</Th>
                  <Th align="right">Хорогдлын дүн</Th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <Tr key={line.id}>
                    <Td>{line.name}</Td>
                    <Td>{line.kind}</Td>
                    <Td align="right">
                      {formatQty(line.quantity)} {unitLabel(line.unit)}
                    </Td>
                    <Td align="right">
                      {isDraft ? "—" : formatMoneyPrecise(line.unitCost)}
                    </Td>
                    <Td align="right">{isDraft ? "—" : formatMoney(line.total)}</Td>
                  </Tr>
                ))}
              </tbody>
              {!isDraft ? (
                <tfoot>
                  <TotalRow>
                    <Td colSpan={4}>Нийт хорогдол</Td>
                    <Td align="right">{formatMoney(act.totalCost)}</Td>
                  </TotalRow>
                </tfoot>
              ) : null}
            </Table>
            {isDraft ? (
              <div className="border-t border-ink-200 px-4 py-3 text-[13px] leading-5 text-ink-500">
                Өртөг нь батлах үед тухайн агшны жигнэсэн дундаж өртгөөр царцана. Тиймээс ноорог
                үед дүн харагдахгүй.
              </div>
            ) : null}
          </CardBody>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Баримтын мэдээлэл" />
            <CardBody>
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
                <dt className="text-ink-500">Дугаар</dt>
                <dd className="tabular font-medium text-ink-900">{act.documentNo}</dd>
                <dt className="text-ink-500">Огноо</dt>
                <dd className="text-ink-800">{formatDate(act.date)}</dd>
                <dt className="text-ink-500">Хүрээ</dt>
                <dd className="text-ink-800">{WRITE_OFF_CONTEXT_LABEL[act.context]}</dd>
                <dt className="text-ink-500">Шалтгаан</dt>
                <dd className="text-ink-800">{WRITE_OFF_REASON_LABEL[act.reason]}</dd>
                {act.note ? (
                  <>
                    <dt className="text-ink-500">Тайлбар</dt>
                    <dd className="text-ink-800">{act.note}</dd>
                  </>
                ) : null}
                <dt className="text-ink-500">Бүртгэсэн</dt>
                <dd className="text-ink-800">
                  {act.createdBy.name}
                  <span className="block text-[12px] text-ink-500">
                    {formatDateTime(act.createdAt)}
                  </span>
                </dd>
                {act.postedAt ? (
                  <>
                    <dt className="text-ink-500">Баталсан</dt>
                    <dd className="text-ink-800">
                      {act.postedBy?.name ?? "—"}
                      <span className="block text-[12px] text-ink-500">
                        {formatDateTime(act.postedAt)}
                      </span>
                    </dd>
                  </>
                ) : null}
              </dl>
            </CardBody>
          </Card>

          <WriteOffActions
            context={actionContext}
            writeOffId={act.id}
            documentNo={act.documentNo}
            status={act.status}
            reasonLabel={WRITE_OFF_REASON_LABEL[act.reason]}
            note={act.note}
            isOwner={user.role === "OWNER"}
            lines={lines.map((l) => ({
              name: l.name,
              unit: l.unit,
              quantity: Number(l.quantity),
              unitCost: l.unitCost,
              total: l.total,
            }))}
            totalCost={Number(act.totalCost)}
          />
        </div>
      </div>
    </div>
  );
}
