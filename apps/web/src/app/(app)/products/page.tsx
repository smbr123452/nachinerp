import { Prisma } from "@prisma/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyRow, MonoText, Table, TableLink, Td, Th, Tr } from "@/components/ui/Table";
import { FilterBar, FilterSelect, SearchInput } from "@/components/ui/SearchFilters";
import { requirePageUser } from "@/lib/auth/guards";
import { d, ZERO } from "@/lib/decimal";
import { formatMoney, formatPercent, formatQty } from "@/lib/format";
import { unitLabel } from "@/lib/units";
import { prisma } from "@/lib/prisma";
import { calculateRecipeCosts } from "@/server/services/recipes";
import { CategoryManagerButton } from "@/components/categories/CategoryManager";
import { listCategories } from "@/server/services/categories";
import { EditProductButton, NewProductButton, PRODUCT_TYPE_LABEL } from "./ProductsClient";

export const metadata = { title: "Бүтээгдэхүүн | Начин ERP" };

type SearchParams = Promise<{ q?: string; category?: string; status?: string; type?: string }>;

export default async function ProductsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requirePageUser();
  const params = await searchParams;

  const where: Prisma.ProductWhereInput = {};
  if (params.q) {
    where.OR = [
      { name: { contains: params.q, mode: "insensitive" } },
      { sku: { contains: params.q, mode: "insensitive" } },
    ];
  }
  if (params.category) where.categoryId = params.category;
  if (params.type === "MANUFACTURED" || params.type === "RESALE") where.productType = params.type;
  if (params.status === "inactive") where.isActive = false;
  else if (params.status === "active") where.isActive = true;

  const [products, categoryRows] = await Promise.all([
    prisma.product.findMany({
      where,
      include: { category: true, _count: { select: { recipeItems: true } } },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    }),
    listCategories("product"),
  ]);

  // Шинэ бүтээгдэхүүнд зөвхөн идэвхтэй ангиллыг санал болгоно.
  const categories = categoryRows.filter((c) => c.isActive);

  const costs = await calculateRecipeCosts(products.map((p) => p.id));

  return (
    <>
      <PageHeader
        title="Бүтээгдэхүүн"
        description={`Нийт ${products.length} бүтээгдэхүүн. Үйлдвэрлэдэг бүтээгдэхүүний өртөг жорноос, худалдан авдагийнх нь авалтын дундаж өртгөөс бодогдоно.`}
        action={
          <>
            <CategoryManagerButton
              kind="product"
              categories={categoryRows}
              canDelete={user.role === "OWNER"}
            />
            <NewProductButton categories={categories} />
          </>
        }
      />

      <FilterBar>
        <SearchInput placeholder="Нэр эсвэл код" />
        <FilterSelect
          paramKey="category"
          label="Ангилал"
          options={categoryRows.map((c) => ({
            value: c.id,
            label: c.isActive ? c.name : `${c.name} (идэвхгүй)`,
          }))}
        />
        <FilterSelect
          paramKey="type"
          label="Төрөл"
          options={[
            { value: "MANUFACTURED", label: PRODUCT_TYPE_LABEL.MANUFACTURED },
            { value: "RESALE", label: PRODUCT_TYPE_LABEL.RESALE },
          ]}
        />
        <FilterSelect
          paramKey="status"
          label="Төлөв"
          options={[
            { value: "active", label: "Идэвхтэй" },
            { value: "inactive", label: "Идэвхгүй" },
          ]}
        />
      </FilterBar>

      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Код</Th>
              <Th>Нэр</Th>
              <Th>Ангилал</Th>
              <Th>Төрөл</Th>
              <Th align="right">Үлдэгдэл</Th>
              <Th align="right">Зарах үнэ</Th>
              <Th align="right">Өртөг</Th>
              <Th align="right">Ашиг</Th>
              <Th align="right">Ашгийн %</Th>
              <Th align="right">Үйлдэл</Th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 ? (
              <EmptyRow colSpan={10}>Бүтээгдэхүүн олдсонгүй.</EmptyRow>
            ) : (
              products.map((product) => {
                const isResale = product.productType === "RESALE";
                const hasRecipe = product._count.recipeItems > 0;
                // Үйлдвэрлэдэг бол жорын өртөг, дамжуулан борлуулдаг бол
                // өөрийн жигнэсэн дундаж авалтын өртөг.
                const cost = isResale ? d(product.averageCost) : (costs.get(product.id) ?? ZERO);
                const price = d(product.sellingPrice);
                const profit = price.minus(cost);
                const margin = price.greaterThan(0) ? profit.dividedBy(price).times(100) : ZERO;
                // Өртөг мэдэгдэж байж ашгийг харуулна.
                const costKnown = isResale || hasRecipe;
                const isLow =
                  isResale &&
                  product.isActive &&
                  d(product.minimumStock).greaterThan(0) &&
                  d(product.quantity).lessThan(product.minimumStock);
                return (
                  <Tr key={product.id}>
                    <Td><MonoText>{product.sku}</MonoText></Td>
                    <Td>
                      <TableLink href={`/products/${product.id}`} strong>
                        {product.name}
                      </TableLink>
                      <div className="mt-1 flex gap-1">
                        {!isResale && !hasRecipe ? <Badge tone="warning">Жоргүй</Badge> : null}
                        {isLow ? <Badge tone="warning">Дутагдалтай</Badge> : null}
                        {!product.isActive ? <Badge tone="neutral">Идэвхгүй</Badge> : null}
                      </div>
                    </Td>
                    <Td className="text-ink-500">{product.category?.name ?? "-"}</Td>
                    <Td className="text-ink-500">{PRODUCT_TYPE_LABEL[product.productType]}</Td>
                    <Td align="right" className={isLow ? "font-semibold text-red-600" : ""}>
                      {isResale ? `${formatQty(product.quantity)} ${unitLabel(product.unit)}` : "-"}
                    </Td>
                    <Td align="right">{formatMoney(price)}</Td>
                    <Td align="right">{costKnown ? formatMoney(cost) : "-"}</Td>
                    <Td align="right" className={profit.isNegative() ? "text-red-600" : ""}>
                      {costKnown ? formatMoney(profit) : "-"}
                    </Td>
                    <Td align="right">{costKnown ? formatPercent(margin.toNumber()) : "-"}</Td>
                    <Td align="right">
                      <EditProductButton
                        categories={categories}
                        product={{
                          id: product.id,
                          sku: product.sku,
                          name: product.name,
                          categoryId: product.categoryId,
                          productType: product.productType,
                          sellingPrice: product.sellingPrice.toString(),
                          isActive: product.isActive,
                          unit: product.unit,
                          minimumStock: product.minimumStock.toString(),
                          hasStock: !d(product.quantity).equals(0),
                          hasRecipe,
                        }}
                      />
                    </Td>
                  </Tr>
                );
              })
            )}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
