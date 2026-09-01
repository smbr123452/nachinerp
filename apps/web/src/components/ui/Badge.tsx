import type { DocStatus } from "@prisma/client";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Tone = "neutral" | "success" | "danger" | "warning" | "info";

const TONES: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-600",
  success: "bg-emerald-100 text-emerald-700",
  danger: "bg-red-100 text-red-700",
  warning: "bg-amber-100 text-amber-700",
  info: "bg-brand-100 text-brand-700",
};

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export const DOC_STATUS_LABEL: Record<DocStatus, string> = {
  DRAFT: "Ноорог",
  POSTED: "Батлагдсан",
  CANCELLED: "Цуцалсан",
  REVERSED: "Буцаасан",
};

const DOC_STATUS_TONE: Record<DocStatus, Tone> = {
  DRAFT: "warning",
  POSTED: "success",
  CANCELLED: "danger",
  REVERSED: "danger",
};

export function StatusBadge({ status }: { status: DocStatus }) {
  return <Badge tone={DOC_STATUS_TONE[status]}>{DOC_STATUS_LABEL[status]}</Badge>;
}
