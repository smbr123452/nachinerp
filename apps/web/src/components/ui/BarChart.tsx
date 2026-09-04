import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/cn";

/**
 * Хөнгөн баганан график — гадаад сан ашиглахгүй.
 * Өдрийн борлуулалтыг харьцуулах зорилготой тул шошго бүр уншигдана.
 */
export function BarChart({
  data,
  height = 200,
  className,
}: {
  data: { label: string; amount: number }[];
  height?: number;
  className?: string;
}) {
  const max = Math.max(...data.map((item) => item.amount), 1);
  const average = data.reduce((acc, item) => acc + item.amount, 0) / Math.max(data.length, 1);
  const averageRatio = average / max;

  return (
    <div className={cn("w-full", className)}>
      <div className="relative flex items-end gap-1.5 sm:gap-3" style={{ height }}>
        {/* Дунджийн шугам — өдөр бүрийг дунджтай харьцуулахад тусална */}
        {average > 0 ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 border-t border-dashed border-ink-300"
            style={{ bottom: `${averageRatio * (height - 26)}px` }}
          >
            <span className="absolute -top-4 left-0 rounded bg-white/90 px-1 text-[10px] font-medium text-ink-400">
              Дундаж {formatMoney(average, false)}
            </span>
          </div>
        ) : null}

        {data.map((item) => {
          const ratio = item.amount / max;
          const isMax = item.amount === max && item.amount > 0;
          return (
            <div
              key={item.label}
              className="group flex min-w-0 flex-1 flex-col items-center justify-end gap-1.5"
            >
              <span className="tabular whitespace-nowrap text-[10px] font-medium text-ink-500 opacity-0 transition-opacity group-hover:opacity-100 sm:opacity-100">
                {item.amount > 0 ? formatMoney(item.amount, false) : ""}
              </span>
              <div
                className={cn(
                  "w-full max-w-[72px] rounded-t-md transition-colors",
                  isMax ? "bg-brand-600" : "bg-brand-400 group-hover:bg-brand-500",
                  item.amount === 0 && "bg-ink-200",
                )}
                style={{ height: `${Math.max(ratio * (height - 26), item.amount > 0 ? 6 : 3)}px` }}
                title={`${item.label}: ${formatMoney(item.amount)}`}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex gap-1.5 border-t border-ink-200 pt-2 sm:gap-3">
        {data.map((item) => (
          <div key={item.label} className="min-w-0 flex-1 text-center text-meta text-ink-500">
            {item.label}
          </div>
        ))}
      </div>
    </div>
  );
}
