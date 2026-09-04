import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type SummaryLine = {
  label: string;
  value: ReactNode;
  tone?: "default" | "positive" | "negative" | "muted";
};

const TONE: Record<NonNullable<SummaryLine["tone"]>, string> = {
  default: "text-ink-800",
  positive: "text-emerald-700",
  negative: "text-red-700",
  muted: "text-ink-500",
};

/**
 * Гүйлгээний формын нийлбэрийн хэсэг — хэрэглэгч эцсийн дүнг
 * шууд харж, дараа нь гол үйлдлээ дарна.
 */
export function SummaryPanel({
  lines,
  total,
  totalLabel = "Нийт дүн",
  totalTone = "default",
  action,
  note,
  className,
}: {
  lines?: SummaryLine[];
  total: ReactNode;
  totalLabel?: string;
  totalTone?: "default" | "positive" | "negative";
  action?: ReactNode;
  note?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-card border border-brand-200 bg-brand-50/50 px-5 py-4 shadow-card",
        className,
      )}
    >
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="min-w-0 space-y-1.5">
          {lines?.map((line) => (
            <div key={line.label} className="flex items-baseline gap-3 text-body">
              <span className="text-ink-500">{line.label}</span>
              <span className={cn("tabular font-medium", TONE[line.tone ?? "default"])}>
                {line.value}
              </span>
            </div>
          ))}
          <div className="flex items-baseline gap-3 pt-0.5">
            <span className="text-body font-medium text-ink-600">{totalLabel}</span>
            <span
              className={cn(
                "tabular text-kpi-sm font-semibold",
                totalTone === "positive" && "text-emerald-700",
                totalTone === "negative" && "text-red-700",
                totalTone === "default" && "text-ink-900",
              )}
            >
              {total}
            </span>
          </div>
          {note ? <p className="pt-1 text-xs leading-5 text-ink-500">{note}</p> : null}
        </div>
        {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
      </div>
    </div>
  );
}
