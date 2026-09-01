import { formatMoney } from "@/lib/format";

/**
 * Энгийн баганан график — гадаад сан ашиглахгүй.
 */
export function BarChart({
  data,
  height = 180,
}: {
  data: { label: string; amount: number }[];
  height?: number;
}) {
  const max = Math.max(...data.map((d) => d.amount), 1);

  return (
    <div className="w-full">
      <div className="flex items-end gap-2" style={{ height }}>
        {data.map((item) => {
          const ratio = item.amount / max;
          return (
            <div key={item.label} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
              <span className="tabular whitespace-nowrap text-[10px] text-slate-500">
                {item.amount > 0 ? formatMoney(item.amount, false) : ""}
              </span>
              <div
                className="w-full rounded-t bg-brand-500 transition-all"
                style={{ height: `${Math.max(ratio * (height - 28), item.amount > 0 ? 4 : 2)}px` }}
                title={`${item.label}: ${formatMoney(item.amount)}`}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-2">
        {data.map((item) => (
          <div key={item.label} className="min-w-0 flex-1 text-center text-xs text-slate-500">
            {item.label}
          </div>
        ))}
      </div>
    </div>
  );
}
