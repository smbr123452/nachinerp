import { PageHeader } from "@/components/layout/PageHeader";
import { Alert, EmptyState } from "@/components/ui/Alert";
import { requirePageUser } from "@/lib/auth/guards";
import { toDateInput } from "@/lib/format";
import { listWriteOffCandidates } from "@/server/services/write-offs";
import { WriteOffForm } from "@/components/write-offs/WriteOffForm";

export const metadata = { title: "Шинэ бүтээгдэхүүний АКТ" };

export default async function NewProductWriteOffPage({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string }>;
}) {
  await requirePageUser();
  const { subject } = await searchParams;
  // ЗӨВХӨН бэлэн (RESALE) бүтээгдэхүүн. Үйлдвэрлэдэг бүтээгдэхүүний нөөц
  // систем дээр хөтлөгддөггүй тул сонголтод ерөөсөө орохгүй.
  const candidates = await listWriteOffCandidates("PRODUCT");

  return (
    <div className="space-y-5">
      <PageHeader
        title="Шинэ бүтээгдэхүүний АКТ"
        description="Нөөцөөс хасах бэлэн бүтээгдэхүүн, шалтгааныг бүртгэнэ. Батлах хүртэл нөөцөд нөлөөлөхгүй."
        backHref="/products/write-offs"
      />

      <Alert tone="info">
        Зөвхөн <strong>бэлэн бүтээгдэхүүн</strong> актаар хасагдана. Үйлдвэрлэдэг бүтээгдэхүүний
        бэлэн бүтээгдэхүүний нөөц систем дээр хараахан хөтлөгддөггүй тул түүний хорогдлыг
        бараа материалын актаар бүртгэнэ.
      </Alert>

      {candidates.length === 0 ? (
        <EmptyState
          title="Хасах бэлэн бүтээгдэхүүн алга"
          description="Идэвхтэй бэлэн бүтээгдэхүүн бүртгэгдээгүй байна."
        />
      ) : (
        <WriteOffForm
          context="PRODUCT"
          candidates={candidates}
          today={toDateInput(new Date())}
          preselect={
            subject && candidates.some((c) => `${c.kind}:${c.id}` === subject) ? subject : null
          }
        />
      )}
    </div>
  );
}
