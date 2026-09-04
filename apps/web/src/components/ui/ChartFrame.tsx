"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Графикийн тайлбар — 2-оос дээш цувралтай бол ЗААВАЛ харагдана. */
export function ChartLegend({
  items,
  className,
}: {
  items: { label: string; color: string; value?: string }[];
  className?: string;
}) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-5 gap-y-1.5", className)}>
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-2 text-body">
          <span
            aria-hidden
            className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
            style={{ backgroundColor: item.color }}
          />
          <span className="text-ink-600">{item.label}</span>
          {item.value ? <span className="tabular font-medium text-ink-900">{item.value}</span> : null}
        </li>
      ))}
    </ul>
  );
}

/** Графикийн хөвөгч тайлбар (tooltip). */
export function ChartTooltip({
  x,
  y,
  title,
  rows,
  containerWidth,
}: {
  x: number;
  y: number;
  title: string;
  rows: { label: string; value: string; color?: string }[];
  containerWidth: number;
}) {
  // Баруун ирмэгээс хальж гарахгүйгээр байрлуулна.
  const flip = x > containerWidth - 170;
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-10 w-40 rounded-lg border border-ink-200 bg-white px-3 py-2 shadow-pop"
      style={{ left: flip ? x - 168 : x + 12, top: Math.max(y - 12, 0) }}
    >
      <p className="mb-1 text-meta font-semibold uppercase tracking-wide text-ink-400">{title}</p>
      <ul className="space-y-0.5">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center justify-between gap-3 text-caption">
            <span className="flex min-w-0 items-center gap-1.5 text-ink-600">
              {row.color ? (
                <span
                  aria-hidden
                  className="h-2 w-2 shrink-0 rounded-[2px]"
                  style={{ backgroundColor: row.color }}
                />
              ) : null}
              <span className="truncate">{row.label}</span>
            </span>
            <span className="tabular shrink-0 font-medium text-ink-900">{row.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ChartEmpty({ children }: { children?: ReactNode }) {
  return (
    <div className="flex h-40 items-center justify-center text-sm text-ink-400">
      {children ?? "Энэ хугацаанд өгөгдөл алга байна."}
    </div>
  );
}
