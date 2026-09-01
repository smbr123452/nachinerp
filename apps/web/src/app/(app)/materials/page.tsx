import { Prisma } from "@prisma/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyRow, MonoText, Table, TableLink, Td, Th, Tr } from "@/components/ui/Table";
import { FilterBar, FilterSelect, SearchInput } from "@/components/ui/SearchFilters";
import { requirePageUser } from "@/lib/auth/guards";
import { d, sum } from "@/lib/decimal";
import { formatMoney, formatMoneyPrecise, formatQty } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { unitLabel } from "@/lib/units";
import { inventoryValue } from "@/server/services/inventory";
import { CategoryManagerButton } from "@/components/categories/CategoryManager";
import { listCategories } from "@/server/services/categories";
import { EditMaterialButton, NewMaterialButton } from "./MaterialsClient";

export const metadata = { title: "Бараа материал | Начин ERP" };

type SearchParams = Promise<{ q?: string; category?: string; status?: string }>;

export default async function MaterialsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requirePageUser();
  const params = await searchParams;

  const where: Prisma.RawMaterialWhereInput = {};
  if (params.q) {
    where.OR = [
      { name: { contains: params.q, mode: "insensitive" } },
      { sku: { contains: params.q, mode: "insensitive" } },
    ];
  }
  if (params.category) where.categoryId = params.category;
  if (params.status === "inactive") where.isActive = false;
  else if (params.status === "active") where.isActive = true;

  const [materials, categoryRows] = await Promise.all([
    prisma.rawMaterial.findMany({
      where,
      include: { category: true },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    }),
    listCategories("rawMaterial"),
  ]);

  // Шинэ материалд зөвхөн идэвхтэй ангиллыг санал болгоно; шүүлтэнд бүгд харагдана.
  const categories = categoryRows.filter((c) => c.isActive);

  const rows = materials.map((material) => ({
    material,
    value: inventoryValue(material.quantity, material.averageCost),
    isLow:
      material.isActive &&
      d(material.minimumStock).greaterThan(0) &&
      d(material.quantity).lessThan(material.minimumStock),
  }));

  const totalValue = sum(rows.map((r) => r.value));
  const lowCount = rows.filter((r) => r.isLow).length;
  const filtered = params.status === "low" ? rows.filter((r) => r.isLow) : rows;

  return (
    <>
      <PageHeader
        title="Бараа материал"
        description={`Нийт ${materials.length} нэр төрөл · Нөөцийн өртөг ${formatMoney(totalValue)}`}
        action={
          <>
            <CategoryManagerButton
              kind="rawMaterial"
              categories={categoryRows}
              canDelete={user.role === "OWNER"}
            />
            <NewMaterialButton categories={categories} />
          </>
        }
      />

      {lowCount > 0 ? (
        <Alert tone="warning" className="mb-4">
          Доод хэмжээнээс буурсан <strong>{lowCount}</strong> нэр төрөл байна.
        </Alert>
      ) : null}

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
          paramKey="status"
          label="Төлөв"
          options={[
            { value: "active", label: "Идэвхтэй" },
            { value: "inactive", label: "Идэвхгүй" },
            { value: "low", label: "Дутагдалтай" },
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
              <Th align="right">Үлдэгдэл</Th>
              <Th align="right">Доод хэмжээ</Th>
              <Th align="right">Дундаж өртөг</Th>
              <Th align="right">Нөөцийн өртөг</Th>
              <Th align="right">Үйлдэл</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <EmptyRow colSpan={8}>Бараа материал олдсонгүй.</EmptyRow>
            ) : (
              filtered.map(({ material, value, isLow }) => (
                <Tr key={material.id} tone={isLow ? "warning" : undefined}>
                  <Td><MonoText>{material.sku}</MonoText></Td>
                  <Td>
                    <TableLink href={`/materials/${material.id}`} strong>
                      {material.name}
                    </TableLink>
                    <div className="mt-1 flex gap-1">
                      {isLow ? <Badge tone="warning">Дутагдалтай</Badge> : null}
                      {!material.isActive ? <Badge tone="neutral">Идэвхгүй</Badge> : null}
                    </div>
                  </Td>
                  <Td className="text-ink-500">{material.category?.name ?? "-"}</Td>
                  <Td align="right" className={isLow ? "font-medium text-amber-700" : ""}>
                    {formatQty(material.quantity)} {unitLabel(material.unit)}
                  </Td>
                  <Td align="right" muted>
                    {formatQty(material.minimumStock)} {unitLabel(material.unit)}
                  </Td>
                  <Td align="right">{formatMoneyPrecise(material.averageCost)}</Td>
                  <Td align="right" className="font-medium">
                    {formatMoney(value)}
                  </Td>
                  <Td align="right">
                    <EditMaterialButton
                      categories={categories}
                      material={{
                        id: material.id,
                        sku: material.sku,
                        name: material.name,
                        categoryId: material.categoryId,
                        unit: material.unit,
                        minimumStock: material.minimumStock.toString(),
                        isActive: material.isActive,
                        hasStock: !d(material.quantity).isZero(),
                      }}
                    />
                  </Td>
                </Tr>
              ))
            )}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
