import type { DocStatus, Role } from "@prisma/client";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Tone = "neutral" | "success" | "danger" | "warning" | "info";

/** Тодруулсан дэвсгэр биш — зөөлөн өнгөт дэвсгэр дээр тод текст. */
const TONES: Record<Tone, string> = {
  neutral: "border-ink-200 bg-ink-100 text-ink-600",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  danger: "border-red-200 bg-red-50 text-red-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  info: "border-brand-200 bg-brand-50 text-brand-700",
};

const DOT: Record<Tone, string> = {
  neutral: "bg-ink-400",
  success: "bg-emerald-500",
  danger: "bg-red-500",
  warning: "bg-amber-500",
  info: "bg-brand-500",
};

export function Badge({
  children,
  tone = "neutral",
  dot = false,
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-0.5",
        "text-[11px] font-medium leading-5",
        TONES[tone],
        className,
      )}
    >
      {dot ? <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", DOT[tone])} /> : null}
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
  return (
    <Badge tone={DOC_STATUS_TONE[status]} dot>
      {DOC_STATUS_LABEL[status]}
    </Badge>
  );
}

export function RoleBadge({ role, label }: { role: Role; label: string }) {
  return <Badge tone={role === "OWNER" ? "info" : "neutral"}>{label}</Badge>;
}

export function ActiveBadge({ active }: { active: boolean }) {
  return (
    <Badge tone={active ? "success" : "neutral"} dot>
      {active ? "Идэвхтэй" : "Идэвхгүй"}
    </Badge>
  );
}
