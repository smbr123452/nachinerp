"use client";

import { useEffect } from "react";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { buttonClass } from "@/lib/button-styles";

/**
 * Алдааны хамгаалалт.
 *
 * Энэ файл байхгүй үед серверийн ямар ч алдаа Next.js-ийн анхдагч,
 * хэв маяггүй хуудсаар гарч, хэрэглэгчид үргэлжлүүлэх арга үлдэхгүй байсан.
 *
 * Алдааны ДЭЛГЭРЭНГҮЙг хэрэглэгчид харуулахгүй: дотоод мессеж нь өгөгдлийн
 * сангийн бүтэц зэргийг задруулж болзошгүй. Оронд нь `digest` буюу серверийн
 * логтой тулгах дугаарыг харуулна.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Серверийн лог руу үлдээнэ — дэлгэц дээр биш.
    console.error("[app]", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-10">
      <div className="w-full max-w-md text-center">
        <span
          aria-hidden
          className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-card bg-red-50 text-red-600"
        >
          <TriangleAlert className="h-6 w-6" />
        </span>
        <h1 className="text-page-title font-semibold text-ink-900">Алдаа гарлаа</h1>
        <p className="mt-2 text-body text-ink-500">
          Энэ хуудсыг ачаалах үед алдаа гарлаа. Дахин оролдоно уу — асуудал давтагдвал
          доорх дугаарыг бүртгэлийн хариуцагчид дамжуулна уу.
        </p>
        {error.digest ? (
          <p className="mt-3 font-mono text-caption text-ink-400">Алдааны дугаар: {error.digest}</p>
        ) : null}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button onClick={reset}>Дахин оролдох</Button>
          <Link href="/dashboard" className={buttonClass({ variant: "secondary" })}>
            Хянах самбар
          </Link>
        </div>
      </div>
    </div>
  );
}
