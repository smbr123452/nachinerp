"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
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
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "md" | "lg" | "xl";
  /** danger — эргэлт буцалтгүй үйлдлийг харагдацаар нь ялгана. */
  tone?: "default" | "danger";
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
            size === "md" && "max-w-lg",
            size === "lg" && "max-w-3xl",
            size === "xl" && "max-w-5xl",
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-ink-200 px-5 py-4">
            <div className="min-w-0">
              <h3
                className={cn(
                  "text-base font-semibold leading-6",
                  tone === "danger" ? "text-red-700" : "text-ink-900",
                )}
              >
                {title}
              </h3>
              {description ? (
                <p className="mt-1 text-[13px] leading-5 text-ink-500">{description}</p>
              ) : null}
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

          <div className="px-5 py-4">{children}</div>

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
