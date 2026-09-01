import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/Alert";
import { requirePageUser } from "@/lib/auth/guards";
import { toDateInput } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { unitLabel } from "@/lib/units";
import { CountCreateForm, type CountMaterial } from "./CountCreateForm";

export const metadata = { title: "Шинэ тооллого | Начин ERP" };

export default async function NewCountPage() {
  await requirePageUser();

  const materials = await prisma.rawMaterial.findMany({
    where: { isActive: true },
    include: { category: true },
    orderBy: { name: "asc" },
  });

  const options: CountMaterial[] = materials.map((material) => ({
    id: material.id,
    name: material.name,
    sku: material.sku,
    category: material.category?.name ?? "",
    quantity: material.quantity.toString(),
    unit: unitLabel(material.unit),
  }));

  return (
    <>
      <PageHeader
        title="Шинэ тооллого"
        description="Тоолох материалаа сонгоно уу. Системийн үлдэгдэл тухайн үедээ бүртгэгдэнэ."
        action={
          <Link
            href="/counts"
            className="inline-flex h-11 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Буцах
          </Link>
        }
      />
      {options.length === 0 ? (
        <EmptyState title="Идэвхтэй бараа материал алга" description="Эхлээд материалаа бүртгэнэ үү." />
      ) : (
        <CountCreateForm materials={options} today={toDateInput(new Date())} />
      )}
    </>
  );
}
