import { WriteOffDetailView } from "@/components/write-offs/WriteOffDetailView";

export const metadata = { title: "Бүтээгдэхүүний АКТ" };

export default async function ProductWriteOffDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <WriteOffDetailView context="PRODUCT" id={id} />;
}
