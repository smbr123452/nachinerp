import { WriteOffDetailView } from "@/components/write-offs/WriteOffDetailView";

export const metadata = { title: "Бараа материалын АКТ" };

export default async function MaterialWriteOffDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <WriteOffDetailView context="RAW_MATERIAL" id={id} />;
}
