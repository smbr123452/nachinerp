import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Tone = "default" | "positive" | "negative" | "warning" | "brand";

const VALUE_TONE: Record<Tone, string> = {
  default: "text-ink-900",
  positive: "text-emerald-700",
  negative: "text-red-700",
  warning: "text-amber-700",
  brand: "text-brand-700",
};

const ICON_TONE: Record<Tone, string> = {
  default: "bg-ink-100 text-ink-500",
  positive: "bg-emerald-50 text-emerald-600",
  negative: "bg-red-50 text-red-600",
  warning: "bg-amber-50 text-amber-600",
  brand: "bg-brand-50 text-brand-600",
};

/**
 * Гол үзүүлэлтийн хайрцаг. Багана дотор өндөр нь ижил байхаар зохиогдсон.
 * `emphasis` — хамгийн чухал санхүүгийн тоог өнгө хэтрүүлэлгүйгээр онцолно.
 */
export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "default",
  emphasis = false,
  variant = "card",
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: Tone;
  emphasis?: boolean;
  /**
   * flat — хайрцаг дотор байрлах үзүүлэлт. Хүрээ, сүүдэргүй тул "хайрцаг
   * дотор хайрцаг" мэдрэмж үүсэхгүй.
   */
  variant?: "card" | "flat";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col",
        variant === "card" && "rounded-card border bg-white p-4 shadow-card",
        variant === "card" &&
          (emphasis ? "border-brand-200 ring-1 ring-brand-100" : "border-ink-200"),
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium leading-5 text-ink-500">{label}</p>
        {icon ? (
          <span
            aria-hidden
            className={cn(
              "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md [&>svg]:h-4 [&>svg]:w-4",
              ICON_TONE[tone],
            )}
          >
            {icon}
          </span>
        ) : null}
      </div>

      <p
        className={cn(
          "tabular mt-2 font-semibold",
          emphasis ? "text-kpi" : "text-kpi-sm",
          VALUE_TONE[tone],
        )}
      >
        {value}
      </p>

      {hint ? <p className="mt-1.5 text-xs leading-5 text-ink-400">{hint}</p> : null}
    </div>
  );
}

/** Үзүүлэлтийн хайрцгуудыг ижил өндөртэй сүлжээнд байрлуулна. */
export function StatGrid({
  children,
  className,
  columns = 4,
}: {
  children: ReactNode;
  className?: string;
  columns?: 2 | 3 | 4;
}) {
  return (
    <div
      className={cn(
        "grid auto-rows-fr gap-3 sm:grid-cols-2",
        columns === 4 && "xl:grid-cols-4",
        columns === 3 && "xl:grid-cols-3",
        className,
      )}
    >
      {children}
    </div>
  );
}
