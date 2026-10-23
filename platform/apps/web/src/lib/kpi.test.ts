import { describe, expect, it } from "vitest";
import { deriveKpis, secondaryStats } from "./kpi";
import { navItemsFor } from "./nav";
import { buildChartSeries, feedSummary, lastMeasuredDay, mortalitySummary, weightSummary } from "./series";
import type { FlockMetrics } from "./types";

const metrics = (patch: Partial<FlockMetrics> = {}): FlockMetrics =>
  ({
    flock: {
      id: "f1",
      name: "گله آزمون",
      breed: "راس ۳۰۸",
      hall_id: "h1",
      start_date: "2026-09-26",
      initial_count: 1000,
      target_weight_g: 2450,
      target_age_days: 42,
      status: "active",
    },
    ageDays: 28,
    targetAge: 42,
    daysRemaining: 14,
    liveBirds: 980,
    lostBirds: 20,
    mortalityPct: 1.8,
    cullPct: 0.2,
    removalPct: 2,
    expectedMortalityPct: 2.5,
    dailyMortalityPct: 0.05,
    waterChangePct: 0,
    totalFeedKg: 3000,
    todayFeedKg: 150,
    avgDailyFeedG: 120,
    feedStockKg: 900,
    feedDaysLeft: 6,
    currentWeightG: 1400,
    weightSource: "measured",
    measuredWeightG: 1400,
    stdWeightG: 1450,
    weightVsStdPct: -3.45,
    dailyGainG: 62,
    fcr: 1.62,
    stdFcr: 1.55,
    feedVsStdPct: 4.5,
    totalCost: 900_000_000,
    costPerBird: 90_000,
    costPerKgLive: 79_000,
    revenue: 0,
    liveBiomassKg: 1372,
    estimatedLiveValue: 134_456_000,
    netProfit: 0,
    marginPct: 0,
    breakevenPerKg: 79_000,
    marketPrice: 98_000,
    targetWeightG: 2450,
    projection: {
      targetAge: 42,
      daysRemaining: 14,
      projectedWeightG: 2500,
      projectedCost: 1_200_000_000,
      projectedRevenue: 2_450_000_000,
      projectedProfit: 1_250_000_000,
      projectedFcr: 1.7,
    },
    costBreakdown: [],
    alerts: [],
    dailySeries: [],
    ...patch,
  }) as FlockMetrics;

describe("شاخص‌های داشبورد", () => {
  it("چهار شاخص خواسته‌شده را با مرجع مقایسه می‌دهد", () => {
    const kpis = deriveKpis(metrics());
    expect(kpis.map((k) => k.key)).toEqual(["fcr", "mortality", "weight", "cost"]);
    expect(kpis[0].value).toBe("۱٫۶۲");
    expect(kpis[0].tone).toBe("warn"); // ۴٫۵٪ بالاتر از استاندارد
  });

  it("FCR خیلی بالاتر از استاندارد قرمز می‌شود", () => {
    const [fcr] = deriveKpis(metrics({ fcr: 1.8 }));
    expect(fcr.tone).toBe("bad");
  });

  it("تلفات بیش از مجاز قرمز و تلفات کم سبز است", () => {
    expect(deriveKpis(metrics({ removalPct: 1 }))[1].tone).toBe("good");
    expect(deriveKpis(metrics({ removalPct: 4 }))[1].tone).toBe("bad");
  });

  it("وزن عقب‌مانده از استاندارد هشدار می‌گیرد", () => {
    expect(deriveKpis(metrics({ weightVsStdPct: 2 }))[2].tone).toBe("good");
    expect(deriveKpis(metrics({ weightVsStdPct: -8 }))[2].tone).toBe("bad");
  });

  it("بهای تمام‌شده بالاتر از بازار قرمز است", () => {
    expect(deriveKpis(metrics({ costPerKgLive: 80_000 }))[3].tone).toBe("good");
    expect(deriveKpis(metrics({ costPerKgLive: 120_000 }))[3].tone).toBe("bad");
  });

  it("بدون داده، شاخص خالی برمی‌گردد نه صفرِ گمراه‌کننده", () => {
    expect(deriveKpis(null)).toEqual([]);
    expect(secondaryStats(null)).toEqual([]);
  });

  it("آمار دوم شامل سود پیش‌بینی و موجودی دان است", () => {
    const stats = secondaryStats(metrics());
    expect(stats.map((s) => s.key)).toContain("projectedProfit");
    expect(stats.find((s) => s.key === "feedStock")?.hint).toContain("۶");
  });
});

describe("دسترسی منو بر اساس نقش", () => {
  it("کارگر فقط صفحه «امروز» را می‌بیند", () => {
    expect(navItemsFor("worker").map((i) => i.to)).toEqual(["/"]);
  });

  it("مالک و مدیر داشبورد را می‌بینند", () => {
    expect(navItemsFor("owner").map((i) => i.to)).toEqual(["/", "/dashboard"]);
    expect(navItemsFor("manager").map((i) => i.to)).toEqual(["/", "/dashboard"]);
  });

  it("دامپزشک هم فقط ثبت روزانه دارد", () => {
    expect(navItemsFor("vet").map((i) => i.to)).toEqual(["/"]);
    expect(navItemsFor(null)).toEqual([]);
  });
});

describe("آماده‌سازی نمودارها", () => {
  const data = metrics({
    dailySeries: [
      { day: 1, date: "2026-09-26", weightG: 43, stdWeightG: 45, feedKg: 20, stdDailyFeedKg: 18, mortality: 4, liveBirds: 996, cumFeedKg: 20, stdCumFeedKg: 18, waterL: 40, tempC: 33, avgWeightG: null },
      { day: 2, date: "2026-09-27", weightG: 58, stdWeightG: 60, feedKg: 26, stdDailyFeedKg: 24, mortality: 6, liveBirds: 990, cumFeedKg: 46, stdCumFeedKg: 42, waterL: 52, tempC: 33, avgWeightG: null },
      { day: 3, date: "2026-09-28", weightG: 74, stdWeightG: 78, feedKg: 30, stdDailyFeedKg: 29, mortality: 2, liveBirds: 988, cumFeedKg: 76, stdCumFeedKg: 71, waterL: 60, tempC: 32, avgWeightG: null },
    ],
  });

  it("سری را مرتب می‌کند و تلفات تجمعی را درصدی حساب می‌کند", () => {
    const series = buildChartSeries(data);
    expect(series.map((p) => p.day)).toEqual([1, 2, 3]);
    expect(series[0].cumMortalityPct).toBeCloseTo(0.4, 5);
    expect(series[2].cumMortalityPct).toBeCloseTo(1.2, 5);
    expect(series[2].label).toBe("۳");
  });

  it("خلاصه‌ها را فارسی و قابل‌فهم می‌سازد", () => {
    const series = buildChartSeries(data);
    expect(lastMeasuredDay(series)).toBe(3);
    expect(weightSummary(series)).toContain("کیلوگرم");
    expect(mortalitySummary(series)).toContain("تلفات تجمعی");
    expect(feedSummary(series)).toContain("استاندارد");
  });

  it("مقایسه دان روی روز کامل انجام می‌شود، نه روز جاری نیمه‌کاره", () => {
    const series = buildChartSeries(data);
    const withToday = [...series, { ...series[series.length - 1], day: 4, date: "2026-09-29", label: "۴", feedKg: 3 }];
    const summary = feedSummary(withToday, "2026-09-29");
    expect(summary).toContain("آخرین روز کامل");
    expect(summary).toContain("امروز تا این لحظه");
    expect(summary).not.toContain("۹۵");
  });

  it("سری خالی، خلاصه‌ی «داده‌ای نیست» می‌دهد", () => {
    expect(buildChartSeries(null)).toEqual([]);
    expect(lastMeasuredDay([])).toBeNull();
    expect(feedSummary([])).toBe("داده‌ای ثبت نشده است.");
  });
});
