import Link from "next/link";
import { FileMinus2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { writeOffPath, type WriteOffContext } from "@/lib/write-offs";

/**
 * Барааны дэлгэрэнгүй хуудаснаас шинэ акт эхлүүлэх товч.
 *
 * Хүрээ бүр өөрийн урсгал руу очно: бараа материал материалын актад,
 * бүтээгдэхүүн бүтээгдэхүүний актад. Холимог сонголт гарахгүй.
 */
export function WriteOffButton({
  context,
  subject,
  label = "АКТ-аар хасах",
}: {
  context: WriteOffContext;
  /** "rawMaterial:<id>" эсвэл "product:<id>" — маягтад урьдчилан сонгогдоно. */
  subject: string;
  label?: string;
}) {
  return (
    <Link href={writeOffPath(context, `/new?subject=${encodeURIComponent(subject)}`)}>
      <Button variant="secondary" size="sm">
        <FileMinus2 className="h-4 w-4" />
        {label}
      </Button>
    </Link>
  );
}
