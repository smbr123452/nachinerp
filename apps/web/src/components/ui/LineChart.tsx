"use client";

import { useMemo, useRef, useState } from "react";
import { formatMoney } from "@/lib/format";
import { AXIS_COLOR, AXIS_TEXT, seriesColor } from "./chart-palette";
import { ChartEmpty, ChartLegend, ChartTooltip } from "./ChartFrame";

export type LineSeries = { key: string; label: string; values: number[] };

const VIEW_W = 960;
const VIEW_H = 260;
const PAD = { top: 16, right: 16, bottom: 28, left: 68 };

/** Тэнхлэгийн "дугуй" алхам сонгоно (1/2/5 × 10ⁿ). */
function niceStep(rawStep: number): number {
  if (rawStep <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalised = rawStep / magnitude;
  const step = normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10;
  return step * magnitude;
}

/**
 * Олон цувралт шугаман график.
 *
 * Бүх цуврал НЭГ хэмжигдэхүүнтэй (₮) тул нэг л тэнхлэг ашиглана —
 * хоёр тэнхлэгтэй график харьцааг гажуудуулдаг.
 */
export function LineChart({
  labels,
  series,
  height = 260,
}: {
  labels: string[];
  series: LineSeries[];
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
  const stepX = labels.length > 1 ? plotW / (labels.length - 1) : 0;

  const xAt = (index: number) => PAD.left + (labels.length > 1 ? index * stepX : plotW / 2);
  const yAt = (value: number) => PAD.top + plotH - (value / max) * plotH;

  const onMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const relX = ((event.clientX - rect.left) / rect.width) * VIEW_W;
    const index = Math.round((relX - PAD.left) / (stepX || plotW));
    setActive(Math.min(Math.max(index, 0), labels.length - 1));
    setPointer({ x: event.clientX - rect.left, y: event.clientY - rect.top, width: rect.width });
  };

  // Шошгыг олон байхад цөөрүүлж, давхцахаас сэргийлнэ.
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
          aria-label={`Шугаман график: ${series.map((s) => s.label).join(", ")}`}
        >
          {/* Сүлжээ ба босоо тэнхлэгийн утга */}
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

          {/* Хөндлөн шугам (crosshair) */}
          {active !== null ? (
            <line
              x1={xAt(active)}
              x2={xAt(active)}
              y1={PAD.top}
              y2={PAD.top + plotH}
              stroke={AXIS_TEXT}
              strokeWidth={1}
              strokeDasharray="3 3"
            />
          ) : null}

          {series.map((s, seriesIndex) => {
            const color = seriesColor(seriesIndex);
            const points = s.values.map((value, index) => `${xAt(index)},${yAt(value)}`).join(" ");
            return (
              <g key={s.key}>
                <polyline
                  points={points}
                  fill="none"
                  stroke={color}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
                {active !== null && s.values[active] !== undefined ? (
                  <circle
                    cx={xAt(active)}
                    cy={yAt(s.values[active]!)}
                    r={4.5}
                    fill={color}
                    stroke="#ffffff"
                    strokeWidth={2}
                  />
                ) : null}
              </g>
            );
          })}

          {/* Хэвтээ тэнхлэгийн шошго */}
          {labels.map((label, index) =>
            index % labelEvery === 0 || index === labels.length - 1 ? (
              <text
                key={label + index}
                x={xAt(index)}
                y={VIEW_H - 8}
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
