/* آماده‌سازی داده نمودارها.

   سه نمودار خواسته شده: مصرف دان، وزن، تلفات. همه از یک سری روزانه ساخته
   می‌شوند تا محور افقی هر سه یکی باشد و کاربر مجبور نباشد تاریخ‌ها را ذهنی
   تطبیق دهد. ایندکس در نمودار «شماره روز پرورش» است، نه تاریخ میلادی. */

import type { FlockMetrics } from "./types";
import { fa } from "./format";

export interface ChartPoint {
  day: number;
  label: string;
  date: string;
  /** مصرف دان آن روز (کیلوگرم) */
  feedKg: number;
  /** مصرف مورد انتظار استاندارد همان روز */
  stdFeedKg: number;
  waterL: number | null;
  weightG: number | null;
  stdWeightG: number;
  mortality: number;
  /** درصد تلفات تجمعی تا آن روز */
  cumMortalityPct: number;
}

export function buildChartSeries(m: FlockMetrics | null | undefined): ChartPoint[] {
  if (!m?.dailySeries?.length) return [];

  const initial = m.flock?.initial_count || 0;
  let cumulative = 0;

  return m.dailySeries
    .slice()
    .sort((a, b) => a.day - b.day)
    .map((point) => {
      cumulative += point.mortality ?? 0;
      return {
        day: point.day,
        label: fa(point.day),
        date: point.date,
        feedKg: point.feedKg ?? 0,
        stdFeedKg: point.stdDailyFeedKg ?? 0,
        waterL: point.waterL ?? null,
        weightG: point.weightG ?? point.avgWeightG ?? null,
        stdWeightG: point.stdWeightG ?? 0,
        mortality: point.mortality ?? 0,
        cumMortalityPct: initial > 0 ? (cumulative / initial) * 100 : 0,
      };
    });
}

/** آخرین نقطه‌ی وزن واقعی؛ نمودار وزن تا این نقطه معنا دارد */
export function lastMeasuredDay(series: ChartPoint[]): number | null {
  const withWeight = series.filter((p) => p.weightG !== null && p.weightG > 0);
  return withWeight.length ? withWeight[withWeight.length - 1].day : null;
}

/** خلاصه‌ی نمودار برای زیرنویس کارت (کاربر بدون خواندن محور بفهمد) */
/**
 * خلاصه مصرف دان.
 *
 * اگر سری به «امروز» می‌رسد، امروز هنوز کامل نشده است (مثلاً ۸۵ کیلو در برابر
 * ۱٬۸۲۴ کیلوی استاندارد) و مقایسه‌اش کاربر را گمراه می‌کند. پس مقایسه روی
 * آخرین روز کامل انجام می‌شود و همین موضوع هم صریح گفته می‌شود.
 */
export function feedSummary(series: ChartPoint[], today?: string): string {
  if (!series.length) return "داده‌ای ثبت نشده است.";

  const lastPoint = series[series.length - 1];
  const dayInProgress = Boolean(today) && lastPoint.date === today;
  const complete = dayInProgress ? series.slice(0, -1) : series;
  const last = complete[complete.length - 1] ?? lastPoint;
  const expected = last.stdFeedKg;

  if (!expected) return `آخرین مصرف: ${fa(last.feedKg)} کیلوگرم`;
  const diff = ((last.feedKg - expected) / expected) * 100;
  const direction = diff >= 0 ? "بیشتر" : "کمتر";
  const prefix = dayInProgress ? `آخرین روز کامل (روز ${fa(last.day)}): ` : "";
  const suffix = dayInProgress ? ` · امروز تا این لحظه ${fa(lastPoint.feedKg)} کیلوگرم` : "";

  return `${prefix}${fa(last.feedKg)} کیلوگرم — ${fa(Math.abs(diff), 1)}٪ ${direction} از استاندارد${suffix}`;
}

export function weightSummary(series: ChartPoint[]): string {
  const day = lastMeasuredDay(series);
  if (day === null) return "هنوز وزن‌گیری ثبت نشده است.";
  const point = series.find((p) => p.day === day)!;
  const diff = point.stdWeightG > 0 ? ((point.weightG! - point.stdWeightG) / point.stdWeightG) * 100 : 0;
  return `آخرین وزن‌گیری روز ${fa(day)}: ${fa(point.weightG! / 1000, 2)} کیلوگرم (${fa(
    Math.abs(diff),
    1,
  )}٪ ${diff >= 0 ? "بالاتر" : "پایین‌تر"} از استاندارد)`;
}

export function mortalitySummary(series: ChartPoint[]): string {
  if (!series.length) return "داده‌ای ثبت نشده است.";
  const last = series[series.length - 1];
  const worst = series.reduce((acc, p) => (p.mortality > acc.mortality ? p : acc), series[0]);
  return `تلفات تجمعی ${fa(last.cumMortalityPct, 2)}٪ — بدترین روز: روز ${fa(worst.day)} با ${fa(
    worst.mortality,
  )} قطعه`;
}
