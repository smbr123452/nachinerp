import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/Alert";
import { requirePageUser } from "@/lib/auth/guards";
import { toDateInput } from "@/lib/format";
import { listWriteOffCandidates } from "@/server/services/write-offs";
import { WriteOffForm } from "@/components/write-offs/WriteOffForm";

export const metadata = { title: "Шинэ бараа материалын АКТ" };

export default async function NewMaterialWriteOffPage({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string }>;
}) {
  await requirePageUser();
  const { subject } = await searchParams;
  // ЗӨВХӨН бараа материал. Сервер тал мөн адил шалгана.
  const candidates = await listWriteOffCandidates("RAW_MATERIAL");

  return (
    <div className="space-y-5">
      <PageHeader
        title="Шинэ бараа материалын АКТ"
        description="Нөөцөөс хасах бараа материал, шалтгааныг бүртгэнэ. Батлах хүртэл нөөцөд нөлөөлөхгүй."
        backHref="/materials/write-offs"
      />

      {candidates.length === 0 ? (
        <EmptyState
          title="Хасах бараа материал алга"
          description="Идэвхтэй бараа материал бүртгэгдээгүй байна."
        />
      ) : (
        <WriteOffForm
          context="RAW_MATERIAL"
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
