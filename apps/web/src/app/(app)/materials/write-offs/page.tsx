import { requirePageUser } from "@/lib/auth/guards";
import { WriteOffListView } from "@/components/write-offs/WriteOffListView";

export const metadata = { title: "Бараа материалын АКТ" };

export default async function MaterialWriteOffsPage() {
  await requirePageUser();
  return (
    <WriteOffListView
      context="RAW_MATERIAL"
      title="Бараа материалын АКТ"
      description="Хугацаа дуусах, муудах, гэмтэх зэрэг шалтгаанаар бараа материалыг нөөцөөс хасах баримт."
      newLabel="Шинэ бараа материалын АКТ"
      emptyDescription="Хугацаа дууссан, муудсан бараа материал гарвал энд актаар хасна."
    />
  );
}
