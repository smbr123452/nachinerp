"use client";

import { useEffect, type ReactNode } from "react";
import { AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/cn";

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  tone = "default",
  headerDivider = true,
  bodyClassName,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  /**
   * danger — эргэлт буцалтгүй үйлдэл. Улаан өнгө нь ЗӨВХӨН дүрс тэмдэгт
   * болон үйлдлийн товчинд гарна: гарчиг өөрөө улаан байвал уншихад хүндэрч,
   * модал бүхэлдээ анхааруулгын хайрцаг мэт харагдана.
   */
  tone?: "default" | "danger";
  /**
   * Гарчгийн доорх зураас. Баталгаажуулах модал нь агуулгагүй байж болох тул
   * зураас хоёр давхарлахаас сэргийлж унтраадаг.
   */
  headerDivider?: boolean;
  /** Агуулгын хэсгийн ангиллыг БҮТНЭЭР солино (анхдагч "px-5 py-4"). */
  bodyClassName?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-ink-900/25 p-4 backdrop-blur-[1px]">
      <div className="flex min-h-full items-start justify-center py-6 sm:items-center sm:py-0">
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className={cn(
            "w-full rounded-xl border border-ink-200 bg-white shadow-pop",
            size === "sm" && "max-w-md",
            size === "md" && "max-w-lg",
            size === "lg" && "max-w-3xl",
            size === "xl" && "max-w-5xl",
          )}
        >
          <div
            className={cn(
              "flex items-start justify-between gap-4 px-5 py-4",
              headerDivider && "border-b border-ink-200",
            )}
          >
            <div className="flex min-w-0 items-start gap-3">
              {tone === "danger" ? (
                <span
                  aria-hidden
                  className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600"
                >
                  <AlertTriangle className="h-4 w-4" />
                </span>
              ) : null}
              <div className="min-w-0">
                <h3 className="text-base font-semibold leading-6 text-ink-900">{title}</h3>
                {description ? (
                  <p className="mt-1 text-body leading-5 text-ink-500">{description}</p>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Хаах"
              className="-mr-1.5 -mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
            >
              <X aria-hidden className="h-4 w-4" />
            </button>
          </div>

          {/* Агуулгагүй бол хоосон хэсэг үүсгэхгүй — баталгаажуулах модал
              шаардлагагүй өндөр авахгүй. */}
          {children ? <div className={bodyClassName ?? "px-5 py-4"}>{children}</div> : null}

          {footer ? (
            <div className="flex flex-wrap justify-end gap-2 border-t border-ink-200 bg-ink-50/60 px-5 py-3.5">
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Формын доод талын үйлдлийн эгнээ (модал дотор). */
export function ModalActions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap justify-end gap-2 pt-1">{children}</div>;
}

/**
 * Модалын доод талын үйлдлийн эгнээ — хайрцгийн ирмэг хүртэл сунгаж,
 * тусгаарлах зураастай. Форм нь агуулга ба товчийг хамтад нь барих
 * шаардлагатай тул Modal-ын `footer`-ийн оронд формын дотор ашиглана.
 */
export function ModalFooter({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-ink-200 bg-ink-50/60 px-5 py-3.5">
      {children}
    </div>
  );
}
