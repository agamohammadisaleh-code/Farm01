"use client";

import { useState } from "react";
import { compactToman, num } from "@/lib/format";

export interface Slice {
  key: string;
  label: string;
  value: number;
  color: string;
}

export default function DonutChart({
  slices,
  centerLabel,
  centerValue,
  size = 176,
  thickness = 22,
  format = "int",
}: {
  slices: Slice[];
  centerLabel: string;
  centerValue: string;
  size?: number;
  thickness?: number;
  format?: "int" | "money";
}) {
  const valueFormat = (n: number) => (format === "money" ? compactToman(n).replace(" تومان", "") : num(n));
  const [hover, setHover] = useState<string | null>(null);
  const total = slices.reduce((s, x) => s + x.value, 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="row wrap" style={{ gap: 20, alignItems: "center" }}>
      <div style={{ position: "relative", width: size, height: size, flex: `0 0 ${size}px` }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`نمودار ترکیب: ${centerLabel}`} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f0eee6" strokeWidth={thickness} />
          {total > 0 &&
            slices.map((s) => {
              const frac = s.value / total;
              const dash = Math.max(0, frac * c - 2);
              const el = (
                <circle
                  key={s.key}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={hover === s.key ? thickness + 5 : thickness}
                  strokeDasharray={`${dash} ${c - dash}`}
                  strokeDashoffset={-offset}
                  strokeLinecap="round"
                  onMouseEnter={() => setHover(s.key)}
                  onMouseLeave={() => setHover(null)}
                  style={{ transition: "stroke-width .15s ease", cursor: "pointer" }}
                />
              );
              offset += frac * c;
              return el;
            })}
        </svg>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeContent: "center",
            textAlign: "center",
            pointerEvents: "none",
          }}
        >
          <div style={{ fontSize: 10.5, color: "var(--muted)" }}>{centerLabel}</div>
          <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: "-.3px" }}>{centerValue}</div>
        </div>
      </div>
      <div style={{ flex: "1 1 150px", display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
        {slices.map((s) => (
          <div
            key={s.key}
            className="row-between"
            style={{ fontSize: 11.5, padding: "3px 0", opacity: hover && hover !== s.key ? 0.5 : 1 }}
            onMouseEnter={() => setHover(s.key)}
            onMouseLeave={() => setHover(null)}
          >
            <span className="row" style={{ gap: 6, minWidth: 0 }}>
              <span style={{ width: 8, height: 8, borderRadius: 3, background: s.color, flex: "0 0 8px" }} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.label}</span>
            </span>
            <span className="row" style={{ gap: 7 }}>
              <span className="num">{valueFormat(s.value)}</span>
              <span className="muted tiny num" style={{ minWidth: 34, textAlign: "left" }}>
                {total ? num((s.value / total) * 100, 0) : "۰"}٪
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
