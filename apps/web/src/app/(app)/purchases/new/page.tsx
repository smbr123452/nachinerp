import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/Alert";
import { requirePageUser } from "@/lib/auth/guards";
import { toDateInput } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { PurchaseForm, type MaterialOption } from "./PurchaseForm";

export const metadata = { title: "Шинэ худалдан авалт | Начин ERP" };

export default async function NewPurchasePage() {
  await requirePageUser();

  const [materials, suppliers] = await Promise.all([
    prisma.rawMaterial.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, sku: true, unit: true, lastPurchasePrice: true },
    }),
    prisma.supplier.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ]);

  const options: MaterialOption[] = materials.map((m) => ({
    id: m.id,
    name: m.name,
    sku: m.sku,
    unit: m.unit,
    lastPurchasePrice: m.lastPurchasePrice ? m.lastPurchasePrice.toString() : null,
  }));

  return (
    <>
      <PageHeader
        title="Шинэ худалдан авалт"
        description="Батлагдмагц нөөц нэмэгдэж, жигнэсэн дундаж өртөг шинэчлэгдэнэ."
        action={
          <Link
            href="/purchases"
            className="inline-flex h-11 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Буцах
          </Link>
        }
      />
      {options.length === 0 ? (
        <EmptyState
          title="Бараа материал бүртгэгдээгүй байна"
          description="Эхлээд 'Бараа материал' хэсэгт материалаа нэмнэ үү."
        />
      ) : (
        <PurchaseForm materials={options} suppliers={suppliers} today={toDateInput(new Date())} />
      )}
    </>
  );
}
