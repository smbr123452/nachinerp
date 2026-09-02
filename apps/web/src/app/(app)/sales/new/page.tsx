import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/Alert";
import { requirePageUser } from "@/lib/auth/guards";
import { d } from "@/lib/decimal";
import { toDateInput } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { convertQuantity, unitLabel } from "@/lib/units";
import { SaleForm, type MaterialStock, type ProductOption } from "./SaleForm";

export const metadata = { title: "Өдрийн борлуулалт" };

export default async function NewSalePage() {
  const user = await requirePageUser();

  const [products, materials] = await Promise.all([
    prisma.product.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      include: { recipeItems: { include: { rawMaterial: { select: { id: true, unit: true } } } } },
    }),
    prisma.rawMaterial.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, quantity: true, unit: true },
    }),
  ]);

  const productOptions: ProductOption[] = products.map((product) => ({
    id: product.id,
    name: product.name,
    sku: product.sku,
    sellingPrice: product.sellingPrice.toString(),
    productType: product.productType,
    // Бэлэн бүтээгдэхүүнд жор шаардлагагүй — өөрөө нөөцтэй.
    hasRecipe: product.productType === "RESALE" || product.recipeItems.length > 0,
    recipe: product.recipeItems.map((item) => ({
      rawMaterialId: item.rawMaterialId,
      baseQuantity: convertQuantity(item.quantity, item.unit, item.rawMaterial.unit).toNumber(),
    })),
  }));

  // Нөөцийн урьдчилсан шалгалтад түүхий эд ба RESALE бүтээгдэхүүн хоёулаа орно.
  const materialStock: MaterialStock[] = [
    ...materials.map((material) => ({
      key: `rm:${material.id}`,
      name: material.name,
      quantity: d(material.quantity).toNumber(),
      unit: unitLabel(material.unit),
    })),
    ...products
      .filter((product) => product.productType === "RESALE")
      .map((product) => ({
        key: `pr:${product.id}`,
        name: product.name,
        quantity: d(product.quantity).toNumber(),
        unit: unitLabel(product.unit),
      })),
  ];

  return (
    <>
      <PageHeader
        backHref="/sales"
        title="Өдрийн борлуулалт бүртгэх"
        description="Оройн борлуулалтын дүнг оруулна. Үйлдвэрлэдэг бүтээгдэхүүний материал, бэлэн бүтээгдэхүүний нөөц автоматаар хасагдана."
      />
      {productOptions.length === 0 ? (
        <EmptyState
          title="Бүтээгдэхүүн бүртгэгдээгүй байна"
          description="Эхлээд 'Бүтээгдэхүүн' хэсэгт бүтээгдэхүүн болон жороо оруулна уу."
        />
      ) : (
        <SaleForm
          products={productOptions}
          materials={materialStock}
          today={toDateInput(new Date())}
          isOwner={user.role === "OWNER"}
        />
      )}
    </>
  );
}
