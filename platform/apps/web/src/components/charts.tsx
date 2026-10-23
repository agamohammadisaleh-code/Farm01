/* نمودارهای روند: دان، وزن، تلفات.

   سه تصمیم طراحی که برای «خواندن سریع در سالن» گرفته شده:
   ۱. محور افقی راست‌به‌چپ است (reversed) تا زمان مثل متن فارسی از راست شروع شود.
   ۲. عددها فارسی و با جداکننده‌اند؛ کاربر لازم نیست ذهنش را تبدیل کند.
   ۳. خط استاندارد/انتظار خاکستری و کم‌رنگ است تا «عملکرد واقعی» اول دیده شود. */

import React from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ChartPoint } from "../lib/series";
import { fa } from "../lib/format";

const AXIS = { fontSize: 12, fill: "#6b7f78" } as const;
const GRID = "#e4ebe7";

const COLORS = {
  brand: "#1e8a5f",
  amber: "#e0a020",
  red: "#b3382e",
  muted: "#9aa7a2",
  info: "#2c6e9b",
};

interface TooltipRow {
  name?: string;
  value?: number | string;
  color?: string;
  dataKey?: string | number;
}

function PersianTooltip({
  active,
  payload,
  label,
  units,
}: {
  active?: boolean;
  payload?: TooltipRow[];
  label?: string | number;
  units?: Record<string, string>;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-line bg-white px-3 py-2 shadow-card" dir="rtl">
      <p className="mb-1 text-sm font-bold text-ink">روز {fa(Number(label))}</p>
      {payload.map((row, index) => (
        <p key={index} className="text-sm text-muted">
          <span className="ml-1 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: row.color }} />
          {row.name}: <span className="font-bold text-ink num">{fa(Number(row.value), 2)}</span>{" "}
          {units?.[String(row.dataKey)] ?? ""}
        </p>
      ))}
    </div>
  );
}

function ChartFrame({ children, height = 260 }: { children: React.ReactElement; height?: number }) {
  return (
    <div style={{ width: "100%", height }} dir="ltr">
      <ResponsiveContainer>{children}</ResponsiveContainer>
    </div>
  );
}

export function FeedChart({ data }: { data: ChartPoint[] }) {
  return (
    <ChartFrame>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
        <CartesianGrid stroke={GRID} strokeDasharray="4 4" vertical={false} />
        <XAxis dataKey="label" reversed tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
        <YAxis orientation="right" tick={AXIS} tickLine={false} axisLine={false} width={44} />
        <Tooltip content={<PersianTooltip units={{ feedKg: "کیلوگرم", stdFeedKg: "کیلوگرم" }} />} />
        <Legend formatter={(value) => <span className="text-sm text-muted">{value}</span>} />
        <Bar dataKey="feedKg" name="مصرف واقعی" fill={COLORS.brand} radius={[6, 6, 0, 0]} maxBarSize={22} />
        <Line
          type="monotone"
          dataKey="stdFeedKg"
          name="استاندارد نژاد"
          stroke={COLORS.muted}
          strokeDasharray="5 4"
          dot={false}
          strokeWidth={2}
        />
      </ComposedChart>
    </ChartFrame>
  );
}

export function WeightChart({ data }: { data: ChartPoint[] }) {
  const grams = data.map((point) => ({
    ...point,
    actualKg: point.weightG === null ? null : point.weightG / 1000,
    stdKg: point.stdWeightG / 1000,
  }));
  return (
    <ChartFrame>
      <ComposedChart data={grams} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
        <CartesianGrid stroke={GRID} strokeDasharray="4 4" vertical={false} />
        <XAxis dataKey="label" reversed tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
        <YAxis orientation="right" tick={AXIS} tickLine={false} axisLine={false} width={44} domain={[0, "auto"]} />
        <Tooltip content={<PersianTooltip units={{ actualKg: "کیلوگرم", stdKg: "کیلوگرم" }} />} />
        <Legend formatter={(value) => <span className="text-sm text-muted">{value}</span>} />
        <Line
          type="monotone"
          dataKey="stdKg"
          name="استاندارد نژاد"
          stroke={COLORS.muted}
          strokeDasharray="5 4"
          dot={false}
          strokeWidth={2}
          connectNulls
        />
        <Line
          type="monotone"
          dataKey="actualKg"
          name="وزن گله"
          stroke={COLORS.info}
          strokeWidth={3}
          dot={{ r: 2.5, fill: COLORS.info }}
          connectNulls
        />
      </ComposedChart>
    </ChartFrame>
  );
}

export function MortalityChart({ data }: { data: ChartPoint[] }) {
  return (
    <ChartFrame>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
        <CartesianGrid stroke={GRID} strokeDasharray="4 4" vertical={false} />
        <XAxis dataKey="label" reversed tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
        <YAxis orientation="right" tick={AXIS} tickLine={false} axisLine={false} width={40} />
        <YAxis
          yAxisId="pct"
          orientation="left"
          tick={AXIS}
          tickLine={false}
          axisLine={false}
          width={42}
          unit="٪"
        />
        <Tooltip
          content={<PersianTooltip units={{ mortality: "قطعه", cumMortalityPct: "درصد" }} />}
        />
        <Legend formatter={(value) => <span className="text-sm text-muted">{value}</span>} />
        <Bar dataKey="mortality" name="تلفات روز" fill={COLORS.red} radius={[6, 6, 0, 0]} maxBarSize={20} />
        <Line
          yAxisId="pct"
          type="monotone"
          dataKey="cumMortalityPct"
          name="تلفات تجمعی (٪)"
          stroke={COLORS.amber}
          strokeWidth={2.5}
          dot={false}
        />
      </ComposedChart>
    </ChartFrame>
  );
}
