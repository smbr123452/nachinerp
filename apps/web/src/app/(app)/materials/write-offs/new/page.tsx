import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/Alert";
import { requirePageUser } from "@/lib/auth/guards";
import { toDateInput } from "@/lib/format";
import { listWriteOffCandidates } from "@/server/services/write-offs";
import { WriteOffForm } from "../WriteOffForm";

export const metadata = { title: "Шинэ АКТ" };

export default async function NewWriteOffPage({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string }>;
}) {
  await requirePageUser();
  const { subject } = await searchParams;
  const candidates = await listWriteOffCandidates();

  return (
    <div className="space-y-5">
      <PageHeader
        title="Шинэ АКТ"
        description="Нөөцөөс хасах бараа, шалтгааныг бүртгэнэ. Батлах хүртэл нөөцөд нөлөөлөхгүй."
        backHref="/materials/write-offs"
      />

      {candidates.length === 0 ? (
        <EmptyState
          title="Хасах бараа алга"
          description="Идэвхтэй бараа материал эсвэл бэлэн бүтээгдэхүүн бүртгэгдээгүй байна."
        />
      ) : (
        <WriteOffForm
          candidates={candidates}
          today={toDateInput(new Date())}
          preselect={subject && candidates.some((c) => `${c.kind}:${c.id}` === subject) ? subject : null}
        />
      )}
    </div>
  );
}
