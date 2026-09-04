import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { buttonClass } from "@/lib/button-styles";

/**
 * Олдоогүй хуудас.
 *
 * Энэ файл байхгүй үед Next.js-ийн анхдагч "404 | This page could not be
 * found." англи хуудас аппын бүрхүүл дотор гарч, буцах ч арга байхгүй
 * байсан. Одоо системийн хэл, хэв маягтай нийцэж, гарц санал болгоно.
 */
export default function AppNotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-10">
      <div className="w-full max-w-md text-center">
        <span
          aria-hidden
          className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-card bg-ink-100 text-ink-400"
        >
          <FileQuestion className="h-6 w-6" />
        </span>
        <h1 className="text-page-title font-semibold text-ink-900">Хуудас олдсонгүй</h1>
        <p className="mt-2 text-body text-ink-500">
          Хайсан бичлэг устсан, эсвэл хаяг буруу байна. Хаягаа шалгаад дахин оролдоно уу.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link href="/dashboard" className={buttonClass()}>
            Хянах самбар руу буцах
          </Link>
        </div>
      </div>
    </div>
  );
}
