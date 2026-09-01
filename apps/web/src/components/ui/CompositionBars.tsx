import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/cn";

export type CompositionRow = {
  key: string;
  label: string;
  amount: number;
  /** Тайлбар — жишээ нь дэд хэсэг болохыг тодотгох. */
  note?: string;
  /** Дэд хэсэг бол өөр өнгөөр ялгаж, нийлбэрт нэмэгдэхгүйг илэрхийлнэ. */
  subset?: boolean;
};

/**
 * Мөнгөний бүтэц — данс тус бүрийн хэмжээг харьцуулна.
 *
 * Сөрөг үлдэгдлийг зөв харуулна (касс хэт зарцуулагдсан үед).
 * Өглөгийг ЭНД ОРУУЛАХГҮЙ: өр төлбөр нь мөнгө биш, өөр эх үүсвэр.
 */
export function CompositionBars({ rows }: { rows: CompositionRow[] }) {
  const scale = Math.max(...rows.map((row) => Math.abs(row.amount)), 1);

  return (
    <ul className="space-y-3.5">
      {rows.map((row) => {
        const negative = row.amount < 0;
        const width = Math.max((Math.abs(row.amount) / scale) * 100, row.amount === 0 ? 0 : 2);
        return (
          <li key={row.key}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <span className="flex min-w-0 items-baseline gap-2">
                <span className="truncate text-[13px] font-medium text-ink-700">{row.label}</span>
                {row.note ? (
                  <span className="shrink-0 text-[11px] text-ink-400">{row.note}</span>
                ) : null}
              </span>
              <span
                className={cn(
                  "tabular shrink-0 text-[13px] font-semibold",
                  negative ? "text-red-700" : "text-ink-900",
                )}
              >
                {formatMoney(row.amount)}
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-ink-100">
              <div
                className={cn(
                  "h-full rounded-full",
                  negative
                    ? "bg-red-500"
                    : row.subset
                      ? "bg-brand-300"
                      : "bg-brand-500",
                )}
                style={{ width: `${width}%` }}
                title={`${row.label}: ${formatMoney(row.amount)}`}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
