import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { EmptyRow, Table, TableLink, Td, Th, TotalRow, Tr } from "@/components/ui/Table";
import { requirePageUser } from "@/lib/auth/guards";
import { d, ZERO } from "@/lib/decimal";
import { formatDate, formatMoney, formatPercent, formatQty } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { unitLabel } from "@/lib/units";
import { calculateRecipeCost } from "@/server/services/recipes";
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

  const [summary, materials, recentSales] = await Promise.all([
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
  ]);

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
        description={`${product.sku} · ${product.category?.name ?? "Ангилалгүй"}`}
      />

      {!product.isActive ? (
        <div className="mb-4">
          <Badge tone="neutral">Идэвхгүй бүтээгдэхүүн</Badge>
        </div>
      ) : null}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Зарах үнэ" value={formatMoney(summary.sellingPrice)} />
        <StatCard label="Одоогийн жорын өртөг" value={formatMoney(summary.recipeCost)} />
        <StatCard
          label="Нэгжийн ашиг"
          value={formatMoney(summary.grossProfit)}
          tone={summary.grossProfit.isNegative() ? "negative" : "positive"}
        />
        <StatCard label="Ашгийн хувь" value={formatPercent(summary.grossMargin.toNumber())} />
      </div>

      <Card className="mb-6">
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

      <div className="grid gap-4 lg:grid-cols-2">
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
