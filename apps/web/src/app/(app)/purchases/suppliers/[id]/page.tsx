import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { ActiveBadge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { DeleteRecordButton } from "@/components/ui/DeleteRecordButton";
import { EmptyRow, Table, TableLink, Td, Th, Tr } from "@/components/ui/Table";
import { requirePageUser } from "@/lib/auth/guards";
import { formatDate, formatMoneyPrecise } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { unitLabel } from "@/lib/units";
import {
  getSupplier,
  getSupplierUsage,
  listEligibleItems,
  listSupplierItems,
} from "@/server/services/suppliers";
import { getSupplierItemPrices } from "@/server/services/supplier-history";
import { getSupplierPayableSummary } from "@/server/services/payables";
import { Badge } from "@/components/ui/Badge";
import { formatMoney } from "@/lib/format";
import {
  PAYABLE_STATUS_LABEL,
  PAYABLE_STATUS_TONE,
  PAYMENT_ACCOUNT_LABEL,
} from "@/lib/payables";
import { deleteSupplierAction } from "../actions";
import { EditSupplierButton } from "../SuppliersClient";
import { ToggleSupplierActiveButton } from "./SupplierActions";
import { SupplierItems, type SupplierItemView } from "./SupplierItems";

type Params = Promise<{ id: string }>;

export default async function SupplierDetailPage({ params }: { params: Params }) {
  const user = await requirePageUser();
  const { id } = await params;

  const supplier = await getSupplier(id);
  if (!supplier) notFound();

  const [items, eligible, prices, usage, recentPurchases, payables] = await Promise.all([
    listSupplierItems(id),
    listEligibleItems(id),
    // Сүүлийн үнэ, огноо бүгд НЭГ асуулгаар — мөр бүрд тусад нь очихгүй.
    getSupplierItemPrices(id),
    getSupplierUsage(id),
    prisma.purchase.findMany({
      where: { supplierId: id, status: "POSTED" },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 10,
      select: { id: true, purchaseNo: true, date: true, totalAmount: true },
    }),
    // Өглөг нь бүртгэгдсэн төлбөрөөс тооцогдоно — нийлүүлэгч дээр тусад нь
    // "баланс" талбар хадгалдаггүй.
    getSupplierPayableSummary(id),
  ]);

  const itemViews: SupplierItemView[] = items.map((item) => {
    const key = item.kind === "rawMaterial" ? `rm:${item.subject.id}` : `pr:${item.subject.id}`;
    const price = prices.get(key);
    return {
      id: item.id,
      key,
      name: item.name,
      sku: item.sku,
      kind: item.kind,
      isActive: item.isActive,
      // Хэзээ ч аваагүй бол null — үнэ зохиохгүй, дэлгэц дээр "—".
      lastPrice: price ? `${formatMoneyPrecise(price.unitPrice)} / ${unitLabel(price.unit)}` : null,
      lastDate: price ? formatDate(price.date) : null,
      lastPurchaseId: price?.purchaseId ?? null,
      lastPurchaseNo: price?.purchaseNo ?? null,
    };
  });

  // Энэ нийлүүлэгчид хийсэн бүх төлбөр — буцаагдсаныг нь тэмдэглэж харуулна.
  const supplierPayments = payables.payables
    .flatMap((payable) =>
      payable.payments.map((payment) => ({ ...payment, purchase: payable })),
    )
    .sort((a, b) => b.paidAt.getTime() - a.paidAt.getTime())
    .slice(0, 10);

  const blockedReason =
    usage.length > 0
      ? `${usage.map((u) => `${u.count} ${u.label}`).join(", ")} байгаа тул устгах боломжгүй.`
      : undefined;

  return (
    <>
      <PageHeader
        backHref="/purchases/suppliers"
        title={supplier.name}
        description={
          [supplier.phone, supplier.contactPerson, supplier.email]
            .filter(Boolean)
            .join(" · ") || "Холбоо барих мэдээлэл бүртгэгдээгүй"
        }
        action={
          <>
            <EditSupplierButton
              supplier={{
                id: supplier.id,
                name: supplier.name,
                phone: supplier.phone,
                contactPerson: supplier.contactPerson,
                email: supplier.email,
                note: supplier.note,
              }}
            />
            <ToggleSupplierActiveButton id={supplier.id} isActive={supplier.isActive} />
            {user.role === "OWNER" ? (
              <DeleteRecordButton
                id={supplier.id}
                action={deleteSupplierAction}
                title="Нийлүүлэгч устгах"
                description={`"${supplier.name}"-г бүр мөсөн устгах уу? Энэ үйлдлийг буцаах боломжгүй.`}
                blocked={usage.length > 0}
                blockedReason={blockedReason}
              />
            ) : null}
          </>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-card border border-ink-200 bg-white px-4 py-3 shadow-card">
        <ActiveBadge active={supplier.isActive} />
        <span className="text-body text-ink-500">
          Холбогдсон бараа: <span className="tabular font-medium text-ink-900">{items.length}</span>
        </span>
        <span className="text-body text-ink-500">
          Батлагдсан худалдан авалт:{" "}
          <span className="tabular font-medium text-ink-900">
            {usage.find((u) => u.label === "худалдан авалт")?.count ?? 0}
          </span>
        </span>
        {supplier.note ? (
          <span className="min-w-0 text-body text-ink-500">Тэмдэглэл: {supplier.note}</span>
        ) : null}
      </div>

      <Card className="mb-6">
        <SupplierItems supplierId={supplier.id} items={itemViews} eligible={eligible} />
      </Card>

      {/* Нийлүүлэгчийн өглөг. Төлбөрийг худалдан авалтын хуудаснаас бүртгэнэ —
          нэг төлбөр нэг өглөгийг хаана. */}
      <Card className="mb-6">
        <CardHeader
          title="Нийлүүлэгчийн өглөг"
          description="Зээлээр авсан, төлөгдөөгүй үлдэгдэлтэй худалдан авалтууд."
        />
        <CardBody className="border-b border-ink-200">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-body sm:grid-cols-4">
            <div>
              <dt className="text-ink-500">Нийт өглөг</dt>
              <dd className="tabular text-base font-semibold text-ink-900">
                {formatMoney(payables.totals.totalOutstanding)}
              </dd>
            </div>
            <div>
              <dt className="text-ink-500">Хугацаа хэтэрсэн өглөг</dt>
              <dd
                className={`tabular text-base font-semibold ${
                  payables.totals.overdueOutstanding.greaterThan(0)
                    ? "text-red-700"
                    : "text-ink-900"
                }`}
              >
                {formatMoney(payables.totals.overdueOutstanding)}
              </dd>
            </div>
            <div>
              <dt className="text-ink-500">Нээлттэй өглөг</dt>
              <dd className="tabular text-base font-semibold text-ink-900">
                {payables.totals.openCount}
              </dd>
            </div>
            <div>
              <dt className="text-ink-500">7 хоногт төлөх</dt>
              <dd className="tabular text-base font-semibold text-ink-900">
                {formatMoney(payables.totals.dueSoonOutstanding)}
              </dd>
            </div>
          </dl>
        </CardBody>
        <Table>
          <thead>
            <tr>
              <Th>Худалдан авалт</Th>
              <Th>Огноо</Th>
              <Th align="right">Анхны дүн</Th>
              <Th align="right">Төлсөн</Th>
              <Th align="right">Үлдэгдэл</Th>
              <Th>Төлөх хугацаа</Th>
              <Th>Төлөв</Th>
            </tr>
          </thead>
          <tbody>
            {payables.payables.length === 0 ? (
              <EmptyRow colSpan={7}>Зээлээр авсан худалдан авалт алга байна.</EmptyRow>
            ) : (
              payables.payables.map((row) => (
                <Tr key={row.id}>
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
                </Tr>
              ))
            )}
          </tbody>
        </Table>
      </Card>

      <Card className="mb-6">
        <CardHeader
          title="Өглөгийн төлбөрийн түүх"
          description="Мөнгө гарсан бичилтүүд. Эдгээр нь шинэ зардал биш — өр барагдуулалт."
        />
        <Table>
          <thead>
            <tr>
              <Th>Огноо</Th>
              <Th>Худалдан авалт</Th>
              <Th>Данс</Th>
              <Th align="right">Дүн</Th>
              <Th>Бүртгэсэн</Th>
              <Th>Төлөв</Th>
            </tr>
          </thead>
          <tbody>
            {supplierPayments.length === 0 ? (
              <EmptyRow colSpan={6}>Төлбөр бүртгэгдээгүй байна.</EmptyRow>
            ) : (
              supplierPayments.map((payment) => (
                <Tr key={payment.id}>
                  <Td muted className="whitespace-nowrap">
                    {formatDate(payment.paidAt)}
                  </Td>
                  <Td>
                    <TableLink href={`/purchases/${payment.purchase.purchaseId}`}>
                      {payment.purchase.purchaseNo}
                    </TableLink>
                  </Td>
                  <Td muted>{PAYMENT_ACCOUNT_LABEL[payment.account]}</Td>
                  <Td
                    align="right"
                    className={
                      payment.status === "REVERSED"
                        ? "text-ink-400 line-through"
                        : "font-medium text-ink-900"
                    }
                  >
                    {formatMoney(payment.amount)}
                  </Td>
                  <Td muted>{payment.createdByName}</Td>
                  <Td>
                    {payment.status === "REVERSED" ? (
                      <Badge tone="neutral">Буцаагдсан</Badge>
                    ) : (
                      <Badge tone="success" dot>
                        Батлагдсан
                      </Badge>
                    )}
                  </Td>
                </Tr>
              ))
            )}
          </tbody>
        </Table>
      </Card>

      <Card>
        <CardHeader
          title="Сүүлийн худалдан авалт"
          description="Батлагдсан баримтууд. Энэ нь бодит түүх — дээрх холбоосоос тусдаа."
        />
        <Table>
          <thead>
            <tr>
              <Th>Огноо</Th>
              <Th>Баримт</Th>
              <Th align="right">Дүн</Th>
            </tr>
          </thead>
          <tbody>
            {recentPurchases.length === 0 ? (
              <EmptyRow colSpan={3}>Худалдан авалт бүртгэгдээгүй байна.</EmptyRow>
            ) : (
              recentPurchases.map((purchase) => (
                <Tr key={purchase.id}>
                  <Td>{formatDate(purchase.date)}</Td>
                  <Td>
                    <TableLink href={`/purchases/${purchase.id}`}>{purchase.purchaseNo}</TableLink>
                  </Td>
                  <Td align="right">{formatMoneyPrecise(purchase.totalAmount)}</Td>
                </Tr>
              ))
            )}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
