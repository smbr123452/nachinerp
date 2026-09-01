import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangle, ArrowRight, Info, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import type { AlertRow, Comparison, LowStockRow } from "@/server/services/dashboard";
import { cn } from "@/lib/cn";

/** Хэсэг рүү шилжих холбоос — картын толгойд. */
export function MoreLink({ href, children = "Бүгд" }: { href: string; children?: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-[13px] font-medium text-brand-600 transition-colors hover:text-brand-700"
    >
      {children}
      <ArrowRight aria-hidden className="h-3.5 w-3.5" />
    </Link>
  );
}

/**
 * Өмнөх үетэй харьцуулсан өөрчлөлт. Харьцуулах суурьгүй бол ЮУ Ч
 * харуулахгүй — зохиомол хувь гаргахгүй.
 */
export function ComparisonHint({
  comparison,
  suffix,
}: {
  comparison: Comparison;
  suffix: string;
}) {
  if (!comparison) return null;
  const up = comparison.direction === "up";
  return (
    <span className={cn("font-medium", up ? "text-emerald-700" : "text-red-700")}>
      {up ? "+" : "−"}
      {comparison.percent.toFixed(1)}% <span className="font-normal text-ink-400">{suffix}</span>
    </span>
  );
}

const SEVERITY: Record<LowStockRow["severity"], { label: string; tone: "danger" | "warning" | "neutral" }> = {
  OUT: { label: "Нөөцгүй", tone: "danger" },
  CRITICAL: { label: "Эрсдэлтэй", tone: "danger" },
  LOW: { label: "Багассан", tone: "warning" },
};

export function StockSeverityBadge({ severity }: { severity: LowStockRow["severity"] }) {
  const config = SEVERITY[severity];
  return (
    <Badge tone={config.tone} dot>
      {config.label}
    </Badge>
  );
}

const ALERT_STYLE = {
  danger: { wrap: "border-red-200 bg-red-50 hover:bg-red-100", icon: "text-red-600" },
  warning: { wrap: "border-amber-200 bg-amber-50 hover:bg-amber-100", icon: "text-amber-600" },
  info: { wrap: "border-brand-200 bg-brand-50 hover:bg-brand-100", icon: "text-brand-600" },
} as const;

const ALERT_ICON = {
  danger: TriangleAlert,
  warning: AlertTriangle,
  info: Info,
} as const;

/** Анхаарах зүйлсийн жагсаалт — мөр бүр холбогдох хуудас руу үсэрнэ. */
export function AlertList({ alerts, empty }: { alerts: AlertRow[]; empty: ReactNode }) {
  if (alerts.length === 0) {
    return (
      <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        {empty}
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {alerts.map((alert) => {
        const style = ALERT_STYLE[alert.tone];
        const Icon = ALERT_ICON[alert.tone];
        return (
          <li key={alert.id}>
            <Link
              href={alert.href}
              className={cn(
                "flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm transition-colors",
                style.wrap,
              )}
            >
              <Icon aria-hidden className={cn("h-4 w-4 shrink-0", style.icon)} />
              <span className="min-w-0 flex-1 text-ink-800">{alert.message}</span>
              <ArrowRight aria-hidden className="h-3.5 w-3.5 shrink-0 text-ink-400" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
