import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { WriteOffButton } from "@/components/write-offs/WriteOffButton";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { EmptyRow, Table, TableLink, Td, Th, TotalRow, Tr } from "@/components/ui/Table";
import { requirePageUser } from "@/lib/auth/guards";
import { d, ZERO } from "@/lib/decimal";
import { formatDate, formatDateTime, formatMoney, formatMoneyPrecise, formatPercent, formatQty } from "@/lib/format";
import { MOVEMENT_TYPE_LABEL } from "@/lib/movements";
import { prisma } from "@/lib/prisma";
import { unitLabel } from "@/lib/units";
import { calculateRecipeCost } from "@/server/services/recipes";
import { PRODUCT_TYPE_LABEL, productFinancials, profitTone } from "@/lib/products";
import { getLastPurchase } from "@/server/services/supplier-history";
import { cn } from "@/lib/cn";
import { RecipeEditor, type MaterialOption, type RecipeRow } from "./RecipeEditor";

type Params = Promise<{ id: string }>;

export default async function ProductDetailPage({ params }: { params: Params }) {
  await requirePageUser();
  const { id } = await params;

  const product = await prisma.product.findUnique({
    where: { id },
    include: { category: true, recipeItems: { orderBy: { createdAt: "asc" } } },
  });
  if (!product) notFound();

  const isResale = product.productType === "RESALE";

  const [summary, materials, recentSales, movements, lastPurchase] = await Promise.all([
    calculateRecipeCost(id),
    prisma.rawMaterial.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, sku: true, unit: true, averageCost: true },
    }),
    prisma.saleItem.findMany({
      where: { productId: id, saleBatch: { status: "POSTED" } },
      orderBy: { saleBatch: { date: "desc" } },
      take: 20,
      include: { saleBatch: { select: { id: true, batchNo: true, date: true } } },
    }),
    // Нөөцийн хөдөлгөөн зөвхөн бэлэн бүтээгдэхүүнд утгатай.
    isResale
      ? prisma.inventoryMovement.findMany({
          where: { productId: id },
          orderBy: { createdAt: "desc" },
          take: 100,
          include: { createdBy: { select: { name: true } } },
        })
      : Promise.resolve([]),
    // Сүүлийн авсан үнэ нь ЗӨВХӨН батлагдсан худалдан авалтын түүхээс
    // гардаг тул үйлдвэрлэдэг бүтээгдэхүүнд утгагүй.
    isResale ? getLastPurchase({ productId: id }) : Promise.resolve(null),
  ]);

  // Өртөг, ашиг, ашгийн хувь — жагсаалттай ижил хуваалцсан туслахаас.
  const hasRecipe = product.recipeItems.length > 0;
  const fin = productFinancials({
    productType: product.productType,
    sellingPrice: product.sellingPrice,
    averageCost: product.averageCost,
    recipeCost: hasRecipe ? summary.recipeCost : null,
  });
  const profitStatTone = profitTone(fin.unitProfit);
  const isLowStock =
    d(product.minimumStock).greaterThan(0) && d(product.quantity).lessThan(product.minimumStock);

  const materialOptions: MaterialOption[] = materials.map((m) => ({
    id: m.id,
    name: m.name,
    sku: m.sku,
    unit: m.unit,
    averageCost: d(m.averageCost).toNumber(),
  }));

  const initialRows: RecipeRow[] = product.recipeItems.map((item) => ({
    rawMaterialId: item.rawMaterialId,
    quantity: item.quantity.toString(),
    unit: item.unit,
  }));

  return (
    <>
      <PageHeader
        backHref="/products"
        title={product.name}
        description={`${product.sku} · ${PRODUCT_TYPE_LABEL[product.productType]} · ${product.category?.name ?? "Ангилалгүй"}`}
        /* Зөвхөн бэлэн бүтээгдэхүүн өөрийн нөөцтэй. Үйлдвэрлэдэг
           бүтээгдэхүүнд актаар хасах утгагүй тул товч харагдахгүй. */
        action={
          isResale && product.isActive ? (
            <WriteOffButton context="PRODUCT" subject={`product:${product.id}`} />
          ) : null
        }
      />

      {!product.isActive ? (
        <div className="mb-4">
          <Badge tone="neutral">Идэвхгүй бүтээгдэхүүн</Badge>
        </div>
      ) : null}

      {/* Санхүүгийн хураангуй. Өртгийн эх сурвалж төрлөөс хамаарна:
          үйлдвэрлэдэг — жорноос, бэлэн бүтээгдэхүүн — авалтын дунджаас. */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={isResale ? "Дундаж өртөг" : "Жорын өртөг"}
          value={fin.unitCost ? formatMoney(fin.unitCost) : "—"}
          hint={isResale ? "Жигнэсэн дундаж авалтын өртөг" : "Материалын одоогийн дундаж өртгөөр"}
        />
        <StatCard label="Зарах үнэ" value={formatMoney(fin.sellingPrice)} />
        <StatCard
          label="Нэгж ашиг"
          value={fin.unitProfit ? formatMoney(fin.unitProfit) : "—"}
          tone={profitStatTone}
        />
        <StatCard
          label="Ашгийн хувь"
          value={fin.marginPercent ? formatPercent(fin.marginPercent.toNumber()) : "—"}
          tone={profitStatTone}
          hint={fin.marginPercent ? "Зарах үнэд эзлэх хувь" : "Зарах үнэ тодорхойгүй"}
        />
      </div>

      {/* Бэлэн бүтээгдэхүүний нэмэлт мөр: үлдэгдэл ба сүүлийн авалт.
          Тус бүрийг том хайрцаг болгохгүй — нэг эгнээнд товч харуулна. */}
      {isResale ? (
        <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-card border border-ink-200 bg-white px-4 py-3 shadow-card">
          <span className="text-[13px] text-ink-500">
            Үлдэгдэл:{" "}
            <span className={cn("tabular font-medium", isLowStock ? "text-red-600" : "text-ink-900")}>
              {formatQty(product.quantity)} {unitLabel(product.unit)}
            </span>
          </span>
          <span className="text-[13px] text-ink-500">
            Сүүлийн авсан үнэ:{" "}
            <span className="tabular font-medium text-ink-900">
              {lastPurchase ? formatMoneyPrecise(lastPurchase.baseUnitCost) : "—"}
            </span>
          </span>
          {lastPurchase ? (
            <span className="text-[13px] text-ink-500">
              Сүүлийн худалдан авалт:{" "}
              <TableLink href={`/purchases/${lastPurchase.purchaseId}`}>
                {lastPurchase.purchaseNo}
              </TableLink>{" "}
              · {formatDate(lastPurchase.date)} · {lastPurchase.supplierName}
            </span>
          ) : (
            <span className="text-[13px] text-ink-500">Худалдан авалтын түүх алга байна.</span>
          )}
        </div>
      ) : null}

      {isResale ? (
        <Card className="mb-4">
          <CardHeader
            title="Нөөцийн хөдөлгөөн"
            description="Сүүлийн 100 бичлэг. Худалдан авалтаар нэмэгдэж, борлуулалтаар хасагдана."
          />
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
                <EmptyRow colSpan={7}>Хөдөлгөөн бүртгэгдээгүй байна.</EmptyRow>
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
      ) : (
        <Card className="mb-4">
          <CardHeader
            title="Жор (BOM)"
            description="Борлуулалт бүртгэхэд эдгээр материал автоматаар хасагдана."
          />
          <CardBody>
            <RecipeEditor
              productId={product.id}
              materials={materialOptions}
              initialRows={initialRows}
              sellingPrice={d(product.sellingPrice).toNumber()}
            />
          </CardBody>
        </Card>
      )}

      <div className={isResale ? "grid gap-3" : "grid gap-3 lg:grid-cols-2"}>
        {isResale ? null : (
        <Card>
          <CardHeader title="Одоогийн жорын задаргаа" />
          <Table>
            <thead>
              <tr>
                <Th>Материал</Th>
                <Th align="right">Хэрэглээ</Th>
                <Th align="right">Өртөг</Th>
                <Th align="right">Үлдэгдэл</Th>
              </tr>
            </thead>
            <tbody>
              {summary.lines.length === 0 ? (
                <EmptyRow colSpan={4}>Жор тодорхойлогдоогүй байна.</EmptyRow>
              ) : (
                <>
                  {summary.lines.map((line) => (
                    <Tr key={line.rawMaterialId}>
                      <Td>
                        <TableLink href={`/materials/${line.rawMaterialId}`}>
                          {line.materialName}
                        </TableLink>
                      </Td>
                      <Td align="right">
                        {formatQty(line.quantity)} {line.unit}
                      </Td>
                      <Td align="right">{formatMoney(line.lineCost)}</Td>
                      <Td
                        align="right"
                        className={
                          line.availableQuantity.lessThan(line.baseQuantity) ? "text-red-600" : "text-ink-500"
                        }
                      >
                        {formatQty(line.availableQuantity)} {line.baseUnit}
                      </Td>
                    </Tr>
                  ))}
                  <TotalRow>
                    <Td colSpan={2}>Нийт</Td>
                    <Td align="right">{formatMoney(summary.recipeCost)}</Td>
                    <Td />
                  </TotalRow>
                </>
              )}
            </tbody>
          </Table>
        </Card>
        )}

        <Card>
          <CardHeader title="Сүүлийн борлуулалт" description="Тухайн үеийн бодит өртгөөр" />
          <Table>
            <thead>
              <tr>
                <Th>Огноо</Th>
                <Th>Баримт</Th>
                <Th align="right">Тоо</Th>
                <Th align="right">Орлого</Th>
                <Th align="right">Өртөг</Th>
              </tr>
            </thead>
            <tbody>
              {recentSales.length === 0 ? (
                <EmptyRow colSpan={5} />
              ) : (
                recentSales.map((item) => (
                  <Tr key={item.id}>
                    <Td>{formatDate(item.saleBatch.date)}</Td>
                    <Td>
                      <TableLink href={`/sales/${item.saleBatch.id}`}>
                        {item.saleBatch.batchNo}
                      </TableLink>
                    </Td>
                    <Td align="right">{formatQty(item.quantity)}</Td>
                    <Td align="right">{formatMoney(item.total)}</Td>
                    <Td align="right">{formatMoney(item.totalCost ?? ZERO)}</Td>
                  </Tr>
                ))
              )}
            </tbody>
          </Table>
        </Card>
      </div>
    </>
  );
}
