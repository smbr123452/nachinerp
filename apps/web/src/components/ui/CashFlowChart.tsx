"use client";

import { useMemo, useRef, useState } from "react";
import { formatMoney } from "@/lib/format";
import { AXIS_COLOR, AXIS_TEXT, seriesColor } from "./chart-palette";
import { ChartEmpty, ChartLegend, ChartTooltip } from "./ChartFrame";

export type CashFlowPoint = { label: string; inflow: number; outflow: number; net: number };

const VIEW_W = 960;
const VIEW_H = 280;
const PAD = { top: 16, right: 16, bottom: 28, left: 72 };
const GROUP_GAP = 0.34;
const BAR_GAP = 2;

function niceStep(rawStep: number): number {
  if (rawStep <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalised = rawStep / magnitude;
  const step = normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10;
  return step * magnitude;
}

/**
 * Мөнгөн урсгал: орсон / гарсан нь багана, цэвэр урсгал нь шугам.
 *
 * Гурвуулаа ₮ нэгжтэй тул НЭГ тэнхлэг ашиглана. Цэвэр урсгал хасах
 * гарч болох тул тэгийн шугамыг тодруулж харуулна.
 */
export function CashFlowChart({ data, height = 280 }: { data: CashFlowPoint[]; height?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<number | null>(null);
  const [pointer, setPointer] = useState({ x: 0, y: 0, width: 0 });

  const { min, max, ticks } = useMemo(() => {
    const values = data.flatMap((row) => [row.inflow, row.outflow, row.net]);
    const highest = Math.max(...values, 0);
    const lowest = Math.min(...values, 0);
    if (highest === 0 && lowest === 0) return { min: 0, max: 1, ticks: [0] };
    const step = niceStep((highest - lowest) / 4);
    const top = Math.ceil(highest / step) * step;
    const bottom = Math.floor(lowest / step) * step;
    const list: number[] = [];
    for (let value = bottom; value <= top + step * 0.001; value += step) list.push(value);
    return { min: bottom, max: top === bottom ? bottom + step : top, ticks: list };
  }, [data]);

  if (data.length === 0) return <ChartEmpty />;

  const plotW = VIEW_W - PAD.left - PAD.right;
  const plotH = VIEW_H - PAD.top - PAD.bottom;
  const groupW = plotW / data.length;
  const innerW = groupW * (1 - GROUP_GAP);
  const barW = Math.max(innerW / 2 - BAR_GAP, 1);
  const span = max - min || 1;

  const yAt = (value: number) => PAD.top + plotH - ((value - min) / span) * plotH;
  const zeroY = yAt(0);
  const groupX = (index: number) => PAD.left + index * groupW + (groupW - innerW) / 2;
  const centreX = (index: number) => PAD.left + index * groupW + groupW / 2;

  const onMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const relX = ((event.clientX - rect.left) / rect.width) * VIEW_W;
    const index = Math.floor((relX - PAD.left) / groupW);
    setActive(index >= 0 && index < data.length ? index : null);
    setPointer({ x: event.clientX - rect.left, y: event.clientY - rect.top, width: rect.width });
  };

  const labelEvery = Math.ceil(data.length / 12);
  const netPoints = data.map((row, index) => `${centreX(index)},${yAt(row.net)}`).join(" ");

  return (
    <div>
      <ChartLegend
        className="mb-3"
        items={[
          { label: "Орсон мөнгө", color: seriesColor(2) },
          { label: "Гарсан мөнгө", color: seriesColor(1) },
          { label: "Цэвэр урсгал", color: seriesColor(0) },
        ]}
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
          aria-label="Мөнгөний урсгал: орсон, гарсан, цэвэр"
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

          {/* Орсон / гарсан багана — тэгийн шугамаас эхэлнэ */}
          {data.map((row, index) =>
            (
              [
                { key: "in", value: row.inflow, colour: seriesColor(2), offset: 0 },
                { key: "out", value: row.outflow, colour: seriesColor(1), offset: barW + BAR_GAP },
              ] as const
            ).map((bar) => {
              if (bar.value <= 0) return null;
              const barHeight = Math.max(Math.abs(yAt(bar.value) - zeroY), 2);
              return (
                <rect
                  key={`${bar.key}-${index}`}
                  x={groupX(index) + bar.offset}
                  y={zeroY - barHeight}
                  width={barW}
                  height={barHeight}
                  rx={2}
                  fill={bar.colour}
                />
              );
            }),
          )}

          {/* Тэгийн шугам */}
          <line
            x1={PAD.left}
            x2={VIEW_W - PAD.right}
            y1={zeroY}
            y2={zeroY}
            stroke={AXIS_TEXT}
            strokeWidth={1}
          />

          {/* Цэвэр урсгалын шугам */}
          <polyline
            points={netPoints}
            fill="none"
            stroke={seriesColor(0)}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          {active !== null && data[active] ? (
            <circle
              cx={centreX(active)}
              cy={yAt(data[active]!.net)}
              r={4.5}
              fill={seriesColor(0)}
              stroke="#ffffff"
              strokeWidth={2}
            />
          ) : null}

          {data.map((row, index) =>
            index % labelEvery === 0 || index === data.length - 1 ? (
              <text
                key={row.label + index}
                x={centreX(index)}
                y={VIEW_H - 8}
                textAnchor="middle"
                fontSize={10}
                fill={AXIS_TEXT}
              >
                {row.label}
              </text>
            ) : null,
          )}
        </svg>

        {active !== null && data[active] ? (
          <ChartTooltip
            x={pointer.x}
            y={pointer.y}
            containerWidth={pointer.width}
            title={data[active]!.label}
            rows={[
              { label: "Орсон", value: formatMoney(data[active]!.inflow), color: seriesColor(2) },
              { label: "Гарсан", value: formatMoney(data[active]!.outflow), color: seriesColor(1) },
              { label: "Цэвэр", value: formatMoney(data[active]!.net), color: seriesColor(0) },
            ]}
          />
        ) : null}
      </div>
    </div>
  );
}
