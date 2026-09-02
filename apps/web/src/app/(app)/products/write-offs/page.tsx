import { requirePageUser } from "@/lib/auth/guards";
import { WriteOffListView } from "@/components/write-offs/WriteOffListView";

export const metadata = { title: "Бүтээгдэхүүний АКТ" };

export default async function ProductWriteOffsPage() {
  await requirePageUser();
  return (
    <WriteOffListView
      context="PRODUCT"
      title="Бүтээгдэхүүний АКТ"
      description="Бэлэн бүтээгдэхүүнийг хугацаа дуусах, гэмтэх зэрэг шалтгаанаар нөөцөөс хасах баримт."
      newLabel="Шинэ бүтээгдэхүүний АКТ"
      emptyDescription="Хугацаа дууссан, гэмтсэн бэлэн бүтээгдэхүүн гарвал энд актаар хасна."
    />
  );
}
