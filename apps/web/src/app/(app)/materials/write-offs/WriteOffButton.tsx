import Link from "next/link";
import { FileMinus2 } from "lucide-react";
import { Button } from "@/components/ui/Button";

/**
 * Барааны дэлгэрэнгүй хуудаснаас шинэ акт эхлүүлэх товч.
 * Тухайн барааг урьдчилан сонгосон байдлаар формыг нээнэ.
 */
export function WriteOffButton({ subject }: { subject: string }) {
  return (
    <Link href={`/materials/write-offs/new?subject=${encodeURIComponent(subject)}`}>
      <Button variant="secondary" size="sm">
        <FileMinus2 className="h-4 w-4" />
        АКТ
      </Button>
    </Link>
  );
}
