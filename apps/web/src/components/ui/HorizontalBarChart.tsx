"use client";

import Link from "next/link";
import { SINGLE_SERIES_COLOR } from "./chart-palette";
import { ChartEmpty } from "./ChartFrame";

export type HorizontalBarRow = {
  id: string;
  label: string;
  value: number;
  /** Хүний уншихаар бэлдсэн утга (₮ эсвэл тоо ширхэг). */
  display: string;
  href?: string;
};

/**
 * Хэвтээ баганан жагсаалт — Top N-д тохиромжтой (нэр урт байсан ч уншигдана).
 * Ганц цуврал тул тайлбар шаардлагагүй; утга бүр харагдана.
 */
export function HorizontalBarChart({ rows }: { rows: HorizontalBarRow[] }) {
  if (rows.length === 0) return <ChartEmpty />;
  const max = Math.max(...rows.map((row) => row.value), 1);

  return (
    <ul className="space-y-2.5">
      {rows.map((row) => {
        const ratio = Math.max((row.value / max) * 100, row.value > 0 ? 1.5 : 0);
        return (
          <li key={row.id} className="group">
            <div className="mb-1 flex items-baseline justify-between gap-3">
              {row.href ? (
                <Link
                  href={row.href}
                  className="truncate text-body font-medium text-ink-700 transition-colors hover:text-brand-700 hover:underline"
                >
                  {row.label}
                </Link>
              ) : (
                <span className="truncate text-body font-medium text-ink-700">{row.label}</span>
              )}
              <span className="tabular shrink-0 text-body font-semibold text-ink-900">
                {row.display}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-ink-100">
              <div
                className="h-full rounded-full transition-[width]"
                style={{ width: `${ratio}%`, backgroundColor: SINGLE_SERIES_COLOR }}
                title={`${row.label}: ${row.display}`}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
