import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { CancelDocumentButton } from "@/components/ui/ConfirmAction";
import { Table, TableLink, Td, Th, TotalRow, Tr } from "@/components/ui/Table";
import { requirePageUser } from "@/lib/auth/guards";
import { formatDate, formatDateTime, formatMoney, formatMoneyPrecise, formatQty } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { unitLabel } from "@/lib/units";
import { subjectDisplay } from "@/lib/stock-subject";
import { MOVEMENT_TYPE_LABEL } from "@/lib/movements";
import { PURCHASE_PAYMENT_LABEL, PURCHASE_STATUS_LABEL } from "@/lib/purchases";
import { listPurchaseAttachments } from "@/server/services/attachments";
import { ReceiptViewer } from "./ReceiptViewer";
import { cancelPurchaseAction } from "../actions";

/** Худалдан авалтын төлөвийн өнгө. Нийтлэг StatusBadge-ийг хөндөөгүй. */
const STATUS_TONE: Record<string, "success" | "neutral" | "danger"> = {
  DRAFT: "neutral",
  POSTED: "success",
  CANCELLED: "danger",
  REVERSED: "danger",
};

type Params = Promise<{ id: string }>;

export default async function PurchaseDetailPage({ params }: { params: Params }) {
  await requirePageUser();
  const { id } = await params;

  const purchase = await prisma.purchase.findUnique({
    where: { id },
    include: {
      supplier: true,
      createdBy: { select: { name: true } },
      items: { include: { rawMaterial: true, product: true } },
    },
  });
  if (!purchase) notFound();

  const attachments = await listPurchaseAttachments(purchase.id);

  const movements = await prisma.inventoryMovement.findMany({
    where: { referenceId: purchase.id, referenceType: { in: ["PURCHASE", "PURCHASE_CANCEL"] } },
    include: {
      rawMaterial: { select: { name: true, unit: true } },
      product: { select: { name: true, unit: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return (
    <>
      <PageHeader
        backHref="/purchases"
        title={`Худалдан авалт ${purchase.purchaseNo}`}
        description={`${formatDate(purchase.date)} · ${purchase.supplier?.name ?? "Нийлүүлэгчгүй"} · ${PURCHASE_PAYMENT_LABEL[purchase.paymentMethod]}`}
        action={purchase.status === "POSTED" ? (
              <CancelDocumentButton
                id={purchase.id}
                action={cancelPurchaseAction}
                title="Худалдан авалт цуцлах"
                description="Нөөц болон дундаж өртөг буцаагдана. Баримт нь түүхэнд үлдэнэ."
              />
            ) : null}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Badge tone={STATUS_TONE[purchase.status]} dot>
          {PURCHASE_STATUS_LABEL[purchase.status]}
        </Badge>
        <span className="text-sm text-ink-500">Бүртгэсэн: {purchase.createdBy.name}</span>
        <span className="text-sm text-ink-500">{formatDateTime(purchase.createdAt)}</span>
      </div>

      {purchase.status === "CANCELLED" ? (
        <Alert tone="error" className="mb-4" title="Энэ баримт цуцлагдсан">
          {purchase.cancelNote ?? "Шалтгаан бичигдээгүй."}
        </Alert>
      ) : null}

      {purchase.note ? (
        <Alert tone="info" className="mb-4">
          {purchase.note}
        </Alert>
      ) : null}

      <Card className="mb-6">
        <CardHeader title="Худалдан авсан бараа" />
        <Table>
          <thead>
            <tr>
              <Th>Бараа материал</Th>
              <Th align="right">Тоо хэмжээ</Th>
              <Th align="right">Нэгж үнэ</Th>
              <Th align="right">Дүн</Th>
              <Th align="right">Үндсэн нэгжээр</Th>
            </tr>
          </thead>
          <tbody>
            {purchase.items.map((item) => {
              const subject = subjectDisplay(item);
              return (
              <Tr key={item.id}>
                <Td>
                  {subject.href ? (
                    <TableLink href={subject.href}>{subject.name}</TableLink>
                  ) : (
                    subject.name
                  )}
                </Td>
                <Td align="right">
                  {formatQty(item.quantity)} {unitLabel(item.unit)}
                </Td>
                <Td align="right">{formatMoneyPrecise(item.unitPrice)}</Td>
                <Td align="right" className="font-medium">
                  {formatMoney(item.subtotal)}
                </Td>
                <Td align="right" className="text-ink-500">
                  {formatQty(item.baseQuantity)}{" "}
                  {subject.unit ? unitLabel(subject.unit) : ""} ·{" "}
                  {formatMoneyPrecise(item.baseUnitCost)}
                </Td>
              </Tr>
              );
            })}
            <TotalRow>
              <Td colSpan={3}>Нийт</Td>
              <Td align="right">{formatMoney(purchase.totalAmount)}</Td>
              <Td />
            </TotalRow>
          </tbody>
        </Table>
      </Card>

      <Card className="mb-6">
        <CardHeader
          title="Баримтын зураг"
          description="Баталгаажуулах үед хавсаргасан. Зөвхөн нэвтэрсэн хэрэглэгч үзнэ."
        />
        <CardBody>
          <ReceiptViewer attachments={attachments} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Үүссэн нөөцийн хөдөлгөөн" />
        <Table>
          <thead>
            <tr>
              <Th>Огноо</Th>
              <Th>Материал</Th>
              <Th>Төрөл</Th>
              <Th align="right">Хэмжээ</Th>
              <Th align="right">Нэгж өртөг</Th>
              <Th align="right">Үлдэгдэл</Th>
            </tr>
          </thead>
          <tbody>
            {movements.map((movement) => (
              <Tr key={movement.id}>
                <Td className="whitespace-nowrap">{formatDateTime(movement.createdAt)}</Td>
                <Td>{subjectDisplay(movement).name}</Td>
                <Td>{MOVEMENT_TYPE_LABEL[movement.movementType]}</Td>
                <Td align="right">{formatQty(movement.quantity)}</Td>
                <Td align="right">{formatMoneyPrecise(movement.unitCost)}</Td>
                <Td align="right">{formatQty(movement.balanceAfter)}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
