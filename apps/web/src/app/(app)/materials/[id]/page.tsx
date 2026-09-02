import type { Unit } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { WriteOffButton } from "@/components/write-offs/WriteOffButton";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Card, CardHeader } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { EmptyRow, MonoText, Table, TableLink, Td, Th, Tr } from "@/components/ui/Table";
import { Tabs } from "@/components/ui/Tabs";
import { requirePageUser } from "@/lib/auth/guards";
import { d } from "@/lib/decimal";
import { formatDate, formatDateTime, formatMoney, formatMoneyPrecise, formatQty } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { unitLabel } from "@/lib/units";
import { MOVEMENT_TYPE_LABEL } from "@/lib/movements";
import { inventoryValue } from "@/server/services/inventory";
import { getLastPriceBySupplier } from "@/server/services/supplier-history";
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

  const [movements, purchaseItems, countItems, recipeUsage, supplierPrices] = await Promise.all([
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
    // Нийлүүлэгч тус бүрийн сүүлийн үнэ — хаанаас хямд авахыг харуулна.
    getLastPriceBySupplier({ rawMaterialId: id }),
  ]);

  return (
    <>
      <PageHeader
        backHref="/materials"
        title={material.name}
        description={`${material.sku} · ${material.category?.name ?? "Ангилалгүй"} · Нэгж: ${unit}`}
        action={
          <div className="flex flex-wrap gap-2">
            <WriteOffButton context="RAW_MATERIAL" subject={`rawMaterial:${material.id}`} />
            <AdjustmentButton rawMaterialId={material.id} materialName={material.name} unit={unit} />
          </div>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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

      <Tabs
        active={tab}
        items={TABS.map((item) => ({ ...item, href: `/materials/${id}?tab=${item.key}` }))}
      />

      {tab === "overview" ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <Card>
            <CardHeader title="Мэдээлэл" />
            <Table>
              <tbody>
                <Tr>
                  <Td className="w-1/2 text-ink-500">Код</Td>
                  <Td><MonoText>{material.sku}</MonoText></Td>
                </Tr>
                <Tr>
                  <Td className="text-ink-500">Ангилал</Td>
                  <Td>{material.category?.name ?? "-"}</Td>
                </Tr>
                <Tr>
                  <Td className="text-ink-500">Хэмжих нэгж</Td>
                  <Td>{unit}</Td>
                </Tr>
                <Tr>
                  <Td className="text-ink-500">Доод хэмжээ</Td>
                  <Td align="right">
                    {formatQty(material.minimumStock)} {unit}
                  </Td>
                </Tr>
                <Tr>
                  <Td className="text-ink-500">Төлөв</Td>
                  <Td>
                    {material.isActive ? (
                      <Badge tone="success">Идэвхтэй</Badge>
                    ) : (
                      <Badge tone="neutral">Идэвхгүй</Badge>
                    )}
                  </Td>
                </Tr>
                <Tr>
                  <Td className="text-ink-500">Үүсгэсэн</Td>
                  <Td>{formatDate(material.createdAt)}</Td>
                </Tr>
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
                    <Tr key={item.id}>
                      <Td>
                        <TableLink href={`/products/${item.productId}`}>
                          {item.product.name}
                        </TableLink>
                      </Td>
                      <Td align="right">
                        {formatQty(item.quantity)} {unitLabel(item.unit)}
                      </Td>
                    </Tr>
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
                  <Tr key={item.id}>
                    <Td>{formatDate(item.purchase.date)}</Td>
                    <Td>
                      <TableLink href={`/purchases/${item.purchase.id}`}>
                        {item.purchase.purchaseNo}
                      </TableLink>
                    </Td>
                    <Td className="text-ink-500">{item.purchase.supplier?.name ?? "-"}</Td>
                    <Td align="right">
                      {formatQty(item.quantity)} {unitLabel(item.unit)}
                    </Td>
                    <Td align="right">{formatMoneyPrecise(item.unitPrice)}</Td>
                    <Td align="right">{formatMoney(item.subtotal)}</Td>
                  </Tr>
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
                    <Tr key={movement.id}>
                      <Td className="whitespace-nowrap">{formatDateTime(movement.createdAt)}</Td>
                      <Td>{MOVEMENT_TYPE_LABEL[movement.movementType]}</Td>
                      <Td align="right" className={positive ? "text-emerald-600" : "text-red-600"}>
                        {positive ? "+" : ""}
                        {formatQty(movement.quantity)}
                      </Td>
                      <Td align="right">{formatMoneyPrecise(movement.unitCost)}</Td>
                      <Td align="right">{formatQty(movement.balanceAfter)}</Td>
                      <Td className="text-ink-500">{movement.note ?? "-"}</Td>
                      <Td className="text-ink-500">{movement.createdBy.name}</Td>
                    </Tr>
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
                  <Tr key={item.id}>
                    <Td>{formatDate(item.count.date)}</Td>
                    <Td>
                      <TableLink href={`/counts/${item.count.id}`}>
                        {item.count.countNo}
                      </TableLink>
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
                  </Tr>
                ))
              )}
            </tbody>
          </Table>
        </Card>
      ) : null}

      {tab === "prices" ? (
        <>
        <Card className="mb-4">
          <CardHeader
            title="Нийлүүлэгч тус бүрийн сүүлийн үнэ"
            description="Батлагдсан худалдан авалтын түүхээс. Хамгийн хямдыг нь тодруулав."
          />
          <Table>
            <thead>
              <tr>
                <Th>Нийлүүлэгч</Th>
                <Th>Сүүлд авсан</Th>
                <Th align="right">Нэгж үнэ</Th>
              </tr>
            </thead>
            <tbody>
              {supplierPrices.length === 0 ? (
                <EmptyRow colSpan={3}>Худалдан авалтын түүх алга байна.</EmptyRow>
              ) : (
                [...supplierPrices]
                  .sort((a, b) => d(a.unitPrice).comparedTo(d(b.unitPrice)))
                  .map((row, index) => (
                    <Tr key={row.supplierId ?? "none"}>
                      <Td className={index === 0 ? "font-medium text-ink-900" : undefined}>
                        {row.supplierName}
                        {index === 0 && supplierPrices.length > 1 ? (
                          <Badge tone="success" className="ml-2">
                            Хамгийн хямд
                          </Badge>
                        ) : null}
                      </Td>
                      <Td className="text-ink-500">{formatDate(row.date)}</Td>
                      <Td align="right" className="font-medium">
                        {formatMoneyPrecise(row.unitPrice)} / {unitLabel(row.unit as Unit)}
                      </Td>
                    </Tr>
                  ))
              )}
            </tbody>
          </Table>
        </Card>

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
                  <Tr key={item.id}>
                    <Td>{formatDate(item.purchase.date)}</Td>
                    <Td>
                      <TableLink href={`/purchases/${item.purchase.id}`}>
                        {item.purchase.purchaseNo}
                      </TableLink>
                    </Td>
                    <Td align="right" className="font-medium">
                      {formatMoneyPrecise(item.baseUnitCost)}
                    </Td>
                    <Td align="right">
                      {formatQty(item.baseQuantity)} {unit}
                    </Td>
                  </Tr>
                ))
              )}
            </tbody>
          </Table>
        </Card>
        </>
      ) : null}
    </>
  );
}
