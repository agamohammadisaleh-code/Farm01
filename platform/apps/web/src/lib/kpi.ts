/* شاخص‌های کلیدی داشبورد.

   قاعده‌ی رنگ‌ها یک‌جاست تا داشبورد، کارت‌ها و گزارش هم‌خوان بمانند:
   - سبز: در محدوده هدف
   - زرد: نزدیک مرز (نیاز به نگاه)
   - قرمز: خارج از محدوده (نیاز به اقدام)

   هر شاخص «راهنما» هم دارد: مرجع مقایسه (استاندارد نژاد، قیمت بازار، تلفات
   مجاز) تا کاربر بداند چرا سبز یا قرمز است. */

import type { FlockMetrics } from "./types";
import { fa, percent, perKg, weightText, toman } from "./format";

export type Tone = "good" | "warn" | "bad" | "neutral";

export interface Kpi {
  key: "fcr" | "mortality" | "weight" | "cost";
  title: string;
  value: string;
  unit: string;
  hint: string;
  help: string;
  tone: Tone;
  /** درصد اختلاف با مرجع؛ مثبت یعنی «بیشتر از مرجع» */
  deltaPct: number | null;
  /** آیا بیشتر بودن از مرجع خوب است؟ برای تفسیر فلش در رابط کاربری */
  higherIsBetter: boolean;
}

const toneFromDelta = (deltaPct: number, greenLimit: number, amberLimit: number): Tone => {
  if (deltaPct <= greenLimit) return "good";
  if (deltaPct <= amberLimit) return "warn";
  return "bad";
};

export function deriveKpis(m: FlockMetrics | null | undefined): Kpi[] {
  if (!m) return [];

  const fcr = m.fcr ?? 0;
  const stdFcr = m.stdFcr || 0;
  const fcrDelta = stdFcr > 0 && fcr > 0 ? ((fcr - stdFcr) / stdFcr) * 100 : 0;

  const removal = m.removalPct ?? 0;
  const allowed = m.expectedMortalityPct || 0;
  const mortalityDelta = allowed > 0 ? ((removal - allowed) / allowed) * 100 : 0;

  const weightDelta = m.weightVsStdPct ?? 0;

  const cost = m.costPerKgLive ?? 0;
  const market = m.marketPrice || 0;
  const costDelta = market > 0 ? ((cost - market) / market) * 100 : 0;

  return [
    {
      key: "fcr",
      title: "ضریب تبدیل (FCR)",
      value: fcr > 0 ? fa(fcr, 2) : "—",
      unit: "کیلو دان / کیلو رشد",
      hint: stdFcr > 0 ? `استاندارد نژاد در روز ${fa(m.ageDays)}: ${fa(stdFcr, 2)}` : "استاندارد در دسترس نیست",
      help: "هر ۰٫۰۵ بالاتر از استاندارد، یعنی دان بیشتری برای همان رشد سوزانده شده است.",
      tone: fcr > 0 ? toneFromDelta(fcrDelta, 0, 5) : "neutral",
      deltaPct: fcr > 0 && stdFcr > 0 ? fcrDelta : null,
      higherIsBetter: false,
    },
    {
      key: "mortality",
      title: "تلفات و حذف",
      value: percent(removal),
      unit: `${fa(m.lostBirds)} قطعه از ${fa(m.flock.initial_count)}`,
      hint:
        allowed > 0
          ? `مجاز تا روز ${fa(m.ageDays)}: ${percent(allowed)}`
          : "آستانه تلفات تعریف نشده است",
      help: "تلفات + حذف. اگر از منحنی مجاز جلو بزند، بررسی دما، تهویه و آب ضروری است.",
      tone: allowed > 0 ? toneFromDelta(mortalityDelta, 0, 25) : "neutral",
      deltaPct: allowed > 0 ? mortalityDelta : null,
      higherIsBetter: false,
    },
    {
      key: "weight",
      title: "میانگین وزن",
      value: weightText(m.currentWeightG).replace(/\s(گرم|کیلوگرم)$/, ""),
      unit: m.currentWeightG < 1000 ? "گرم" : "کیلوگرم",
      hint: `استاندارد نژاد: ${weightText(m.stdWeightG)} · ${
        m.weightSource === "measured" ? "از وزن‌گیری واقعی" : "برآورد از رشد"
      }`,
      help: "اختلاف بیش از ۳٪ کمتر از استاندارد، یعنی رشد عقب است؛ برنامه دان و سلامت را بررسی کنید.",
      tone: m.currentWeightG > 0 ? toneFromDelta(-weightDelta, 0, 3) : "neutral",
      deltaPct: m.currentWeightG > 0 ? weightDelta : null,
      higherIsBetter: true,
    },
    {
      key: "cost",
      title: "بهای تمام‌شده هر کیلو",
      value: cost > 0 ? fa(Math.round(cost)) : "—",
      unit: "تومان بر کیلوگرم وزن زنده",
      hint: market > 0 ? `قیمت بازار: ${perKg(market)}` : "قیمت بازار تنظیم نشده",
      help: "اگر از قیمت بازار جلو بزند، هر کیلو فروش زیان است. اختلاف را با قیمت روز بسنجید.",
      tone: cost > 0 && market > 0 ? toneFromDelta(costDelta, -10, 0) : "neutral",
      deltaPct: cost > 0 && market > 0 ? costDelta : null,
      higherIsBetter: false,
    },
  ];
}

export interface SecondaryStat {
  key: string;
  label: string;
  value: string;
  hint?: string;
}

/** نوار دوم داشبورد: عددهای عملیاتی که مدیر هر روز می‌پرسد */
export function secondaryStats(m: FlockMetrics | null | undefined): SecondaryStat[] {
  if (!m) return [];
  return [
    {
      key: "projectedProfit",
      label: "سود پیش‌بینی پایان دوره",
      value: toman(m.projection ? Math.round(m.projection.projectedProfit) : null),
      hint: m.projection ? `اگر با همین روند تا روز ${fa(m.projection.targetAge)} ادامه یابد` : "برای نقش شما پنهان است",
    },
    {
      key: "feedToday",
      label: "دان مصرفی امروز",
      value: `${fa(m.todayFeedKg)} کیلو`,
      hint: `میانگین روزانه ${fa(m.avgDailyFeedG)} گرم برای هر پرنده`,
    },
    {
      key: "feedStock",
      label: "موجودی دان",
      value: `${fa(m.feedStockKg)} کیلو`,
      hint: m.feedDaysLeft > 0 ? `برای ${fa(m.feedDaysLeft, 1)} روز کافی است` : "خرید دان لازم است",
    },
    {
      key: "daysLeft",
      label: "تا سن بارگیری",
      value: `${fa(m.daysRemaining)} روز`,
      hint: `هدف روز ${fa(m.targetAge)} با وزن ${weightText(m.targetWeightG)}`,
    },
  ];
}
