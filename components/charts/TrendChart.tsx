"use client";

import { useMemo, useState } from "react";
import { compactToman, num } from "@/lib/format";

export interface SeriesPoint {
  y: number;
  label: string;
}
export interface Series {
  key: string;
  name: string;
  color: string;
  points: SeriesPoint[];
  dashed?: boolean;
  area?: boolean;
  dot?: boolean;
}

export type ValueFormat = "int" | "one" | "grams" | "money";

function fmt(kind: ValueFormat, n: number): string {
  switch (kind) {
    case "one":
      return num(n, 1);
    case "grams":
      return `${num(n)}g`;
    case "money":
      return compactToman(n).replace(" تومان", "");
    default:
      return num(n, Math.abs(n) < 10 && n % 1 !== 0 ? 1 : 0);
  }
}

type Props = {
  series: Series[];
  format?: ValueFormat;
  xTitle?: string;
  height?: number;
  yTicks?: number;
};

const W = 820;
const PAD = { top: 16, bottom: 34, left: 16, right: 58 };

export default function TrendChart({ series, format = "int", xTitle = "", height = 280, yTicks = 5 }: Props) {
  const yFormat = (n: number) => fmt(format, n);
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  const innerW = W - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;
  const n = Math.max(...series.map((s) => s.points.length), 0);

  const { minY, maxY, ticks } = useMemo(() => {
    const vals = series.flatMap((s) => s.points.map((p) => p.y)).filter((v) => isFinite(v));
    if (!vals.length) return { minY: 0, maxY: 1, ticks: [0, 1] };
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const minY = lo > 0 ? Math.max(0, lo - (hi - lo) * 0.25) : lo;
    const span = hi - minY || 1;
    const step = span / (yTicks - 1);
    const arr = Array.from({ length: yTicks }, (_, k) => minY + step * k);
    return { minY, maxY: hi + span * 0.08, ticks: arr };
  }, [series, yTicks]);

  const xAt = (i: number) => (n <= 1 ? PAD.left + innerW / 2 : PAD.left + innerW - (i / (n - 1)) * innerW);
  const yAt = (v: number) => PAD.top + innerH - ((v - minY) / (maxY - minY || 1)) * innerH;

  const pathFor = (s: Series) => {
    let d = "";
    let started = false;
    s.points.forEach((p, i) => {
      if (!isFinite(p.y)) return;
      const cmd = started ? "L" : "M";
      d += `${cmd}${xAt(i).toFixed(1)},${yAt(p.y).toFixed(1)} `;
      started = true;
    });
    return d.trim();
  };

  const areaFor = (s: Series) => {
    if (!s.points.length) return "";
    const line = pathFor(s);
    if (!line) return "";
    const first = s.points.findIndex((p) => isFinite(p.y));
    const lastIdx = s.points.length - 1 - [...s.points].reverse().findIndex((p) => isFinite(p.y));
    return `${line} L${xAt(lastIdx).toFixed(1)},${(PAD.top + innerH).toFixed(1)} L${xAt(first).toFixed(1)},${(PAD.top + innerH).toFixed(1)} Z`;
  };

  const xTickIdx = useMemo(() => {
    if (n <= 12) return Array.from({ length: n }, (_, i) => i);
    const count = 7;
    const step = Math.max(1, Math.round((n - 1) / (count - 1)));
    const arr: number[] = [];
    for (let i = 0; i < n; i += step) arr.push(i);
    if (arr[arr.length - 1] !== n - 1) arr.push(n - 1);
    return arr;
  }, [n]);

  if (!n) return <div className="empty-chart">داده‌ای برای نمایش وجود ندارد</div>;

  return (
    <div style={{ position: "relative" }}>
      <div className="chart-legend" style={{ marginBottom: 6 }}>
        {series.map((s) => (
          <span className="legend-item" key={s.key}>
            <span
              className="legend-swatch"
              style={{
                background: s.dashed
                  ? `repeating-linear-gradient(90deg, ${s.color} 0 4px, transparent 4px 7px)`
                  : s.color,
              }}
            />
            {s.name}
          </span>
        ))}
        {xTitle ? <span style={{ marginInlineStart: "auto", color: "var(--muted)" }}>{xTitle}</span> : null}
      </div>
      <svg
        viewBox={`0 0 ${W} ${height}`}
        role="img"
        aria-label={`نمودار ${series.map((s) => s.name).join(" و ")}`}
        style={{ width: "100%", height: "auto", display: "block", overflow: "visible" }}
        onTouchStart={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const px = ((e.touches[0].clientX - rect.left) / rect.width) * W;
          const frac = Math.min(1, Math.max(0, (PAD.left + innerW - px) / innerW));
          const i = Math.round(frac * (n - 1));
          if (series[0]?.points[i]) setHover({ i, x: e.touches[0].clientX, y: e.touches[0].clientY - 24 });
        }}
        onTouchMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const px = ((e.touches[0].clientX - rect.left) / rect.width) * W;
          const frac = Math.min(1, Math.max(0, (PAD.left + innerW - px) / innerW));
          const i = Math.round(frac * (n - 1));
          if (series[0]?.points[i]) setHover({ i, x: e.touches[0].clientX, y: e.touches[0].clientY - 24 });
        }}
        onTouchEnd={() => setHover(null)}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - rect.left) / rect.width) * W;
          const frac = Math.min(1, Math.max(0, (PAD.left + innerW - px) / innerW));
          const i = Math.round(frac * (n - 1));
          const pt = series[0]?.points[i];
          if (!pt) return;
          setHover({ i, x: e.clientX, y: e.clientY - 8 });
        }}
      >
        <defs>
          {series.map((s) => (
            <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.22" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>

        {ticks.map((t, i) => (
          <g key={i}>
            <line
              x1={PAD.left}
              x2={PAD.left + innerW}
              y1={yAt(t)}
              y2={yAt(t)}
              stroke="#eae7dd"
              strokeWidth="1"
              strokeDasharray={i === 0 ? "0" : "3 5"}
            />
            <text x={PAD.left + innerW + 10} y={yAt(t) + 4} fontSize="10.5" fill="#8a938e">
              {yFormat(t)}
            </text>
          </g>
        ))}

        {xTickIdx.map((i) => (
          <text key={i} x={xAt(i)} y={height - 10} fontSize="10.5" fill="#8a938e" textAnchor="middle">
            {series[0]?.points[i]?.label ?? ""}
          </text>
        ))}

        {series.map((s) =>
          s.area ? <path key={`a-${s.key}`} d={areaFor(s)} fill={`url(#grad-${s.key})`} /> : null,
        )}
        {series.map((s) => (
          <path
            key={`l-${s.key}`}
            d={pathFor(s)}
            fill="none"
            stroke={s.color}
            strokeWidth={s.dashed ? 1.8 : 2.4}
            strokeDasharray={s.dashed ? "4 5" : undefined}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {hover ? (
          <g>
            <line
              x1={xAt(hover.i)}
              x2={xAt(hover.i)}
              y1={PAD.top}
              y2={PAD.top + innerH}
              stroke="#9aa5a0"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
            {series.map((s) => {
              const p = s.points[hover.i];
              if (!p || !isFinite(p.y)) return null;
              return (
                <circle
                  key={s.key}
                  cx={xAt(hover.i)}
                  cy={yAt(p.y)}
                  r="4.5"
                  fill="#fff"
                  stroke={s.color}
                  strokeWidth="2.5"
                />
              );
            })}
          </g>
        ) : null}
      </svg>

      {hover ? (
        <div className="chart-tip" style={{ left: hover.x, top: hover.y }}>
          <div style={{ marginBottom: 2, opacity: 0.75 }}>
            {series[0]?.points[hover.i]?.label}
            {xTitle ? ` ${xTitle}` : ""}
          </div>
          {series.map((s) => {
            const p = s.points[hover.i];
            if (!p) return null;
            return (
              <div key={s.key}>
                <span style={{ color: s.color }}>●</span> {s.name}: <b>{yFormat(p.y)}</b>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
