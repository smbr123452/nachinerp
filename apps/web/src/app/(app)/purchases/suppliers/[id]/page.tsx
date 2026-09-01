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

  const [items, eligible, prices, usage, recentPurchases] = await Promise.all([
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
        <span className="text-[13px] text-ink-500">
          Холбогдсон бараа: <span className="tabular font-medium text-ink-900">{items.length}</span>
        </span>
        <span className="text-[13px] text-ink-500">
          Батлагдсан худалдан авалт:{" "}
          <span className="tabular font-medium text-ink-900">
            {usage.find((u) => u.label === "худалдан авалт")?.count ?? 0}
          </span>
        </span>
        {supplier.note ? (
          <span className="min-w-0 text-[13px] text-ink-500">Тэмдэглэл: {supplier.note}</span>
        ) : null}
      </div>

      <Card className="mb-6">
        <SupplierItems supplierId={supplier.id} items={itemViews} eligible={eligible} />
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
