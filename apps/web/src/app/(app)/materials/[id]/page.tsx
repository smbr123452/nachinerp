import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Card, CardHeader, StatCard } from "@/components/ui/Card";
import { EmptyRow, Table, Td, Th } from "@/components/ui/Table";
import { requirePageUser } from "@/lib/auth/guards";
import { d } from "@/lib/decimal";
import { formatDate, formatDateTime, formatMoney, formatMoneyPrecise, formatQty } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/cn";
import { unitLabel } from "@/lib/units";
import { MOVEMENT_TYPE_LABEL } from "@/lib/movements";
import { inventoryValue } from "@/server/services/inventory";
import { AdjustmentButton } from "./AdjustmentButton";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ tab?: string }>;

const TABS = [
  { key: "overview", label: "Ерөнхий" },
  { key: "purchases", label: "Худалдан авалт" },
  { key: "movements", label: "Нөөцийн хөдөлгөөн" },
  { key: "counts", label: "Тооллого" },
  { key: "prices", label: "Үнийн түүх" },
];

export default async function MaterialDetailPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  await requirePageUser();
  const { id } = await params;
  const { tab = "overview" } = await searchParams;

  const material = await prisma.rawMaterial.findUnique({
    where: { id },
    include: { category: true },
  });
  if (!material) notFound();

  const unit = unitLabel(material.unit);
  const value = inventoryValue(material.quantity, material.averageCost);
  const isLow =
    d(material.minimumStock).greaterThan(0) && d(material.quantity).lessThan(material.minimumStock);

  const [movements, purchaseItems, countItems, recipeUsage] = await Promise.all([
    prisma.inventoryMovement.findMany({
      where: { rawMaterialId: id },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { createdBy: { select: { name: true } } },
    }),
    prisma.purchaseItem.findMany({
      where: { rawMaterialId: id, purchase: { status: "POSTED" } },
      orderBy: { purchase: { date: "desc" } },
      take: 100,
      include: { purchase: { select: { id: true, purchaseNo: true, date: true, status: true, supplier: true } } },
    }),
    prisma.inventoryCountItem.findMany({
      where: { rawMaterialId: id, count: { status: "POSTED" } },
      orderBy: { count: { date: "desc" } },
      take: 50,
      include: { count: { select: { id: true, countNo: true, date: true, status: true } } },
    }),
    prisma.recipeItem.findMany({
      where: { rawMaterialId: id },
      include: { product: { select: { id: true, name: true, isActive: true } } },
    }),
  ]);

  return (
    <>
      <PageHeader
        title={material.name}
        description={`${material.sku} · ${material.category?.name ?? "Ангилалгүй"} · Нэгж: ${unit}`}
        action={
          <>
            <Link href="/materials" className="inline-flex h-11 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Буцах
            </Link>
            <AdjustmentButton rawMaterialId={material.id} materialName={material.name} unit={unit} />
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Одоогийн үлдэгдэл"
          value={`${formatQty(material.quantity)} ${unit}`}
          tone={isLow ? "warning" : "default"}
          hint={isLow ? `Доод хэмжээ ${formatQty(material.minimumStock)} ${unit}` : undefined}
        />
        <StatCard label="Жигнэсэн дундаж өртөг" value={`${formatMoneyPrecise(material.averageCost)} / ${unit}`} />
        <StatCard label="Нөөцийн өртөг" value={formatMoney(value)} />
        <StatCard
          label="Сүүлийн авсан үнэ"
          value={material.lastPurchasePrice ? `${formatMoneyPrecise(material.lastPurchasePrice)} / ${unit}` : "-"}
        />
      </div>

      <div className="no-print mb-4 flex flex-wrap gap-2 border-b border-slate-200">
        {TABS.map((item) => (
          <Link
            key={item.key}
            href={`/materials/${id}?tab=${item.key}`}
            className={cn(
              "-mb-px border-b-2 px-4 py-2 text-sm font-medium",
              tab === item.key
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-slate-500 hover:text-slate-800",
            )}
          >
            {item.label}
          </Link>
        ))}
      </div>

      {tab === "overview" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Мэдээлэл" />
            <Table>
              <tbody>
                <tr>
                  <Td className="w-1/2 text-slate-500">Код</Td>
                  <Td className="font-mono text-xs">{material.sku}</Td>
                </tr>
                <tr>
                  <Td className="text-slate-500">Ангилал</Td>
                  <Td>{material.category?.name ?? "-"}</Td>
                </tr>
                <tr>
                  <Td className="text-slate-500">Хэмжих нэгж</Td>
                  <Td>{unit}</Td>
                </tr>
                <tr>
                  <Td className="text-slate-500">Доод хэмжээ</Td>
                  <Td align="right">
                    {formatQty(material.minimumStock)} {unit}
                  </Td>
                </tr>
                <tr>
                  <Td className="text-slate-500">Төлөв</Td>
                  <Td>
                    {material.isActive ? (
                      <Badge tone="success">Идэвхтэй</Badge>
                    ) : (
                      <Badge tone="neutral">Идэвхгүй</Badge>
                    )}
                  </Td>
                </tr>
                <tr>
                  <Td className="text-slate-500">Үүсгэсэн</Td>
                  <Td>{formatDate(material.createdAt)}</Td>
                </tr>
              </tbody>
            </Table>
          </Card>

          <Card>
            <CardHeader title="Ашиглагдаж буй жорууд" description="Энэ материалыг агуулсан бүтээгдэхүүнүүд" />
            <Table>
              <thead>
                <tr>
                  <Th>Бүтээгдэхүүн</Th>
                  <Th align="right">Нэгжид</Th>
                </tr>
              </thead>
              <tbody>
                {recipeUsage.length === 0 ? (
                  <EmptyRow colSpan={2}>Одоогоор ямар ч жорд ороогүй.</EmptyRow>
                ) : (
                  recipeUsage.map((item) => (
                    <tr key={item.id}>
                      <Td>
                        <Link href={`/products/${item.productId}`} className="text-brand-600 hover:underline">
                          {item.product.name}
                        </Link>
                      </Td>
                      <Td align="right">
                        {formatQty(item.quantity)} {unitLabel(item.unit)}
                      </Td>
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
          </Card>
        </div>
      ) : null}

      {tab === "purchases" ? (
        <Card>
          <CardHeader title="Худалдан авалтын түүх" />
          <Table>
            <thead>
              <tr>
                <Th>Огноо</Th>
                <Th>Баримт</Th>
                <Th>Нийлүүлэгч</Th>
                <Th align="right">Тоо хэмжээ</Th>
                <Th align="right">Нэгж үнэ</Th>
                <Th align="right">Дүн</Th>
              </tr>
            </thead>
            <tbody>
              {purchaseItems.length === 0 ? (
                <EmptyRow colSpan={6} />
              ) : (
                purchaseItems.map((item) => (
                  <tr key={item.id}>
                    <Td>{formatDate(item.purchase.date)}</Td>
                    <Td>
                      <Link href={`/purchases/${item.purchase.id}`} className="text-brand-600 hover:underline">
                        {item.purchase.purchaseNo}
                      </Link>
                    </Td>
                    <Td className="text-slate-500">{item.purchase.supplier?.name ?? "-"}</Td>
                    <Td align="right">
                      {formatQty(item.quantity)} {unitLabel(item.unit)}
                    </Td>
                    <Td align="right">{formatMoneyPrecise(item.unitPrice)}</Td>
                    <Td align="right">{formatMoney(item.subtotal)}</Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </Card>
      ) : null}

      {tab === "movements" ? (
        <Card>
          <CardHeader title="Нөөцийн хөдөлгөөн" description="Сүүлийн 100 бичлэг" />
          <Table>
            <thead>
              <tr>
                <Th>Огноо</Th>
                <Th>Төрөл</Th>
                <Th align="right">Хэмжээ</Th>
                <Th align="right">Нэгж өртөг</Th>
                <Th align="right">Үлдэгдэл</Th>
                <Th>Тайлбар</Th>
                <Th>Бүртгэсэн</Th>
              </tr>
            </thead>
            <tbody>
              {movements.length === 0 ? (
                <EmptyRow colSpan={7} />
              ) : (
                movements.map((movement) => {
                  const positive = d(movement.quantity).greaterThan(0);
                  return (
                    <tr key={movement.id}>
                      <Td className="whitespace-nowrap">{formatDateTime(movement.createdAt)}</Td>
                      <Td>{MOVEMENT_TYPE_LABEL[movement.movementType]}</Td>
                      <Td align="right" className={positive ? "text-emerald-600" : "text-red-600"}>
                        {positive ? "+" : ""}
                        {formatQty(movement.quantity)}
                      </Td>
                      <Td align="right">{formatMoneyPrecise(movement.unitCost)}</Td>
                      <Td align="right">{formatQty(movement.balanceAfter)}</Td>
                      <Td className="text-slate-500">{movement.note ?? "-"}</Td>
                      <Td className="text-slate-500">{movement.createdBy.name}</Td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </Table>
        </Card>
      ) : null}

      {tab === "counts" ? (
        <Card>
          <CardHeader title="Тооллогын түүх" />
          <Table>
            <thead>
              <tr>
                <Th>Огноо</Th>
                <Th>Баримт</Th>
                <Th align="right">Систем</Th>
                <Th align="right">Тоолсон</Th>
                <Th align="right">Зөрүү</Th>
                <Th align="right">Зөрүүний дүн</Th>
                <Th>Төлөв</Th>
              </tr>
            </thead>
            <tbody>
              {countItems.length === 0 ? (
                <EmptyRow colSpan={7} />
              ) : (
                countItems.map((item) => (
                  <tr key={item.id}>
                    <Td>{formatDate(item.count.date)}</Td>
                    <Td>
                      <Link href={`/counts/${item.count.id}`} className="text-brand-600 hover:underline">
                        {item.count.countNo}
                      </Link>
                    </Td>
                    <Td align="right">{formatQty(item.systemQuantity)}</Td>
                    <Td align="right">{formatQty(item.countedQuantity)}</Td>
                    <Td
                      align="right"
                      className={d(item.differenceQuantity).isNegative() ? "text-red-600" : "text-emerald-600"}
                    >
                      {formatQty(item.differenceQuantity)}
                    </Td>
                    <Td align="right">{formatMoney(item.varianceAmount)}</Td>
                    <Td>
                      <StatusBadge status={item.count.status} />
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </Card>
      ) : null}

      {tab === "prices" ? (
        <Card>
          <CardHeader
            title="Түүхий эдийн үнийн түүх"
            description="Худалдан авалт бүрийн үндсэн нэгж рүү хөрвүүлсэн үнэ"
          />
          <Table>
            <thead>
              <tr>
                <Th>Огноо</Th>
                <Th>Баримт</Th>
                <Th align="right">{`Үнэ / ${unit}`}</Th>
                <Th align="right">Авсан хэмжээ</Th>
              </tr>
            </thead>
            <tbody>
              {purchaseItems.length === 0 ? (
                <EmptyRow colSpan={4} />
              ) : (
                purchaseItems.map((item) => (
                  <tr key={item.id}>
                    <Td>{formatDate(item.purchase.date)}</Td>
                    <Td>
                      <Link href={`/purchases/${item.purchase.id}`} className="text-brand-600 hover:underline">
                        {item.purchase.purchaseNo}
                      </Link>
                    </Td>
                    <Td align="right" className="font-medium">
                      {formatMoneyPrecise(item.baseUnitCost)}
                    </Td>
                    <Td align="right">
                      {formatQty(item.baseQuantity)} {unit}
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </Card>
      ) : null}
    </>
  );
}
