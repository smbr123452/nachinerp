"use client";

import { useMemo, useRef, useState } from "react";
import { formatMoney } from "@/lib/format";
import { AXIS_COLOR, AXIS_TEXT, seriesColor } from "./chart-palette";
import { ChartEmpty, ChartLegend, ChartTooltip } from "./ChartFrame";

export type BarSeries = { key: string; label: string; values: number[] };

const VIEW_W = 960;
const VIEW_H = 240;
const PAD = { top: 14, right: 16, bottom: 26, left: 68 };
/** Бүлгүүдийн хооронд болон багана хооронд үлдээх зай (px, viewBox). */
const GROUP_GAP = 0.32;
const BAR_GAP = 2;

function niceStep(rawStep: number): number {
  if (rawStep <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalised = rawStep / magnitude;
  const step = normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10;
  return step * magnitude;
}

/** Бүлэглэсэн баганан график — ижил нэгжтэй (₮) цувралуудыг харьцуулна. */
export function GroupedBarChart({
  labels,
  series,
  height = 240,
}: {
  labels: string[];
  series: BarSeries[];
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<number | null>(null);
  const [pointer, setPointer] = useState({ x: 0, y: 0, width: 0 });

  const { max, ticks } = useMemo(() => {
    const highest = Math.max(...series.flatMap((s) => s.values), 0);
    if (highest <= 0) return { max: 1, ticks: [0] };
    const step = niceStep(highest / 4);
    const top = Math.ceil(highest / step) * step;
    const list: number[] = [];
    for (let value = 0; value <= top + 0.5; value += step) list.push(value);
    return { max: top, ticks: list };
  }, [series]);

  if (labels.length === 0 || series.length === 0) return <ChartEmpty />;

  const plotW = VIEW_W - PAD.left - PAD.right;
  const plotH = VIEW_H - PAD.top - PAD.bottom;
  const groupW = plotW / labels.length;
  const innerW = groupW * (1 - GROUP_GAP);
  const barW = Math.max(innerW / series.length - BAR_GAP, 1);

  const yAt = (value: number) => PAD.top + plotH - (value / max) * plotH;
  const groupX = (index: number) => PAD.left + index * groupW + (groupW - innerW) / 2;

  const onMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const relX = ((event.clientX - rect.left) / rect.width) * VIEW_W;
    const index = Math.floor((relX - PAD.left) / groupW);
    setActive(index >= 0 && index < labels.length ? index : null);
    setPointer({ x: event.clientX - rect.left, y: event.clientY - rect.top, width: rect.width });
  };

  const labelEvery = Math.ceil(labels.length / 12);

  return (
    <div>
      <ChartLegend
        className="mb-3"
        items={series.map((s, index) => ({ label: s.label, color: seriesColor(index) }))}
      />

      <div
        ref={containerRef}
        className="relative w-full"
        onMouseMove={onMove}
        onMouseLeave={() => setActive(null)}
      >
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="none"
          className="w-full"
          style={{ height }}
          role="img"
          aria-label={`Баганан график: ${series.map((s) => s.label).join(", ")}`}
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={PAD.left}
                x2={VIEW_W - PAD.right}
                y1={yAt(tick)}
                y2={yAt(tick)}
                stroke={AXIS_COLOR}
                strokeWidth={1}
              />
              <text
                x={PAD.left - 8}
                y={yAt(tick) + 3}
                textAnchor="end"
                fontSize={10}
                fill={AXIS_TEXT}
                className="tabular"
              >
                {formatMoney(tick, false)}
              </text>
            </g>
          ))}

          {active !== null ? (
            <rect
              x={PAD.left + active * groupW}
              y={PAD.top}
              width={groupW}
              height={plotH}
              fill={AXIS_COLOR}
              opacity={0.45}
            />
          ) : null}

          {labels.map((label, groupIndex) =>
            series.map((s, seriesIndex) => {
              const value = s.values[groupIndex] ?? 0;
              const barHeight = value > 0 ? Math.max((value / max) * plotH, 2) : 0;
              if (barHeight === 0) return null;
              return (
                <rect
                  key={`${s.key}-${groupIndex}`}
                  x={groupX(groupIndex) + seriesIndex * (barW + BAR_GAP)}
                  y={PAD.top + plotH - barHeight}
                  width={barW}
                  height={barHeight}
                  rx={2}
                  fill={seriesColor(seriesIndex)}
                />
              );
            }),
          )}

          {labels.map((label, index) =>
            index % labelEvery === 0 || index === labels.length - 1 ? (
              <text
                key={label + index}
                x={PAD.left + index * groupW + groupW / 2}
                y={VIEW_H - 7}
                textAnchor="middle"
                fontSize={10}
                fill={AXIS_TEXT}
              >
                {label}
              </text>
            ) : null,
          )}
        </svg>

        {active !== null ? (
          <ChartTooltip
            x={pointer.x}
            y={pointer.y}
            containerWidth={pointer.width}
            title={labels[active] ?? ""}
            rows={series.map((s, index) => ({
              label: s.label,
              value: formatMoney(s.values[active] ?? 0),
              color: seriesColor(index),
            }))}
          />
        ) : null}
      </div>
    </div>
  );
}
