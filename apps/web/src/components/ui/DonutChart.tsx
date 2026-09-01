"use client";

import { useState } from "react";
import { formatMoney, formatPercent } from "@/lib/format";
import { seriesColor } from "./chart-palette";
import { ChartEmpty } from "./ChartFrame";

export type DonutSlice = { key: string; label: string; amount: number; colorIndex: number };

const SIZE = 168;
const RADIUS = 68;
const THICKNESS = 26;

function arcPath(startAngle: number, endAngle: number): string {
  const center = SIZE / 2;
  const outer = RADIUS;
  const inner = RADIUS - THICKNESS;
  const large = endAngle - startAngle > Math.PI ? 1 : 0;
  const point = (angle: number, r: number) => [
    center + r * Math.cos(angle),
    center + r * Math.sin(angle),
  ];
  const [x1, y1] = point(startAngle, outer);
  const [x2, y2] = point(endAngle, outer);
  const [x3, y3] = point(endAngle, inner);
  const [x4, y4] = point(startAngle, inner);
  return [
    `M ${x1} ${y1}`,
    `A ${outer} ${outer} 0 ${large} 1 ${x2} ${y2}`,
    `L ${x3} ${y3}`,
    `A ${inner} ${inner} 0 ${large} 0 ${x4} ${y4}`,
    "Z",
  ].join(" ");
}

/**
 * Бүтцийн график. Тайлбар нь дүн ба хувийг ХАРАГДАХААР бичдэг тул
 * зөвхөн өнгөөр ялгах шаардлагагүй.
 */
export function DonutChart({ slices }: { slices: DonutSlice[] }) {
  const [active, setActive] = useState<string | null>(null);
  const total = slices.reduce((acc, slice) => acc + slice.amount, 0);

  if (total <= 0) return <ChartEmpty />;

  // 2px завсар үлдээж зэргэлдээ хэсгүүдийг тусгаарлана.
  const gap = slices.length > 1 ? 0.02 : 0;
  let cursor = -Math.PI / 2;

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-5">
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="shrink-0"
        role="img"
        aria-label="Төлбөрийн бүтэц"
      >
        {slices.map((slice) => {
          const sweep = (slice.amount / total) * Math.PI * 2;
          const start = cursor;
          const end = cursor + Math.max(sweep - gap, 0.004);
          cursor += sweep;
          const dimmed = active !== null && active !== slice.key;
          return (
            <path
              key={slice.key}
              d={arcPath(start, end)}
              fill={seriesColor(slice.colorIndex)}
              opacity={dimmed ? 0.35 : 1}
              onMouseEnter={() => setActive(slice.key)}
              onMouseLeave={() => setActive(null)}
              className="cursor-default transition-opacity"
            />
          );
        })}
        <text
          x={SIZE / 2}
          y={SIZE / 2 - 4}
          textAnchor="middle"
          fontSize={10}
          fill="#64748b"
          className="uppercase"
        >
          Нийт
        </text>
        <text
          x={SIZE / 2}
          y={SIZE / 2 + 13}
          textAnchor="middle"
          fontSize={14}
          fontWeight={600}
          fill="#0f1c33"
          className="tabular"
        >
          {formatMoney(total, false)}
        </text>
      </svg>

      <ul className="min-w-0 flex-1 basis-56 space-y-2">
        {slices.map((slice) => (
          <li
            key={slice.key}
            className="flex items-center justify-between gap-3 text-[13px]"
            onMouseEnter={() => setActive(slice.key)}
            onMouseLeave={() => setActive(null)}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span
                aria-hidden
                className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                style={{ backgroundColor: seriesColor(slice.colorIndex) }}
              />
              <span className="whitespace-nowrap text-ink-600">{slice.label}</span>
            </span>
            <span className="flex shrink-0 items-baseline gap-2.5">
              <span className="tabular font-medium text-ink-900">{formatMoney(slice.amount)}</span>
              <span className="tabular w-11 text-right text-ink-400">
                {formatPercent((slice.amount / total) * 100)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
