import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/Alert";
import { requirePageUser } from "@/lib/auth/guards";
import { toDateInput } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { PurchaseForm, type ItemOption } from "./PurchaseForm";

export const metadata = { title: "Шинэ худалдан авалт | Начин ERP" };

export default async function NewPurchasePage() {
  await requirePageUser();

  const [materials, resaleProducts, suppliers] = await Promise.all([
    prisma.rawMaterial.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, sku: true, unit: true, lastPurchasePrice: true },
    }),
    // Зөвхөн бэлэн бүтээгдэхүүн худалдан авалтад орно.
    prisma.product.findMany({
      where: { isActive: true, productType: "RESALE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, sku: true, unit: true, lastPurchasePrice: true },
    }),
    prisma.supplier.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ]);

  const options: ItemOption[] = [
    ...materials.map((m) => ({
      key: `rm:${m.id}`,
      kind: "rawMaterial" as const,
      id: m.id,
      name: m.name,
      sku: m.sku,
      unit: m.unit,
      lastPurchasePrice: m.lastPurchasePrice ? m.lastPurchasePrice.toString() : null,
    })),
    ...resaleProducts.map((p) => ({
      key: `pr:${p.id}`,
      kind: "product" as const,
      id: p.id,
      name: p.name,
      sku: p.sku,
      unit: p.unit,
      lastPurchasePrice: p.lastPurchasePrice ? p.lastPurchasePrice.toString() : null,
    })),
  ];

  return (
    <>
      <PageHeader
        backHref="/purchases"
        title="Шинэ худалдан авалт"
        description="Батлагдмагц нөөц нэмэгдэж, жигнэсэн дундаж өртөг шинэчлэгдэнэ."
      />
      {options.length === 0 ? (
        <EmptyState
          title="Худалдан авах бараа бүртгэгдээгүй байна"
          description="Эхлээд 'Бараа материал' хэсэгт түүхий эдээ, эсвэл 'Бүтээгдэхүүн' хэсэгт бэлэн бүтээгдэхүүнээ нэмнэ үү."
        />
      ) : (
        <PurchaseForm items={options} suppliers={suppliers} today={toDateInput(new Date())} />
      )}
    </>
  );
}
