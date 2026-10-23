import { faDigits, formatJalali, isoDaysBetween, todayIso } from "./jalali";
import { standardAt } from "./standards";
import { sampleUniformity, uniformityVerdict, type UniformityResult } from "./uniformity";
import type {
  CostCategory,
  DailyLog,
  Expense,
  Flock,
  Sale,
  WeightSample,
} from "./types";

export const COST_CATEGORIES: { key: CostCategory; label: string; color: string; icon: string }[] = [
  { key: "chick", label: "جوجه یک‌روزه", color: "#2f7d5b", icon: "🐣" },
  { key: "feed", label: "دان و خوراک", color: "#e0a020", icon: "🌾" },
  { key: "medication", label: "دارو و مکمل", color: "#2c6e9b", icon: "💊" },
  { key: "vaccine", label: "واکسن", color: "#6b5bd2", icon: "💉" },
  { key: "labor", label: "نیروی کار", color: "#c85a3c", icon: "🧑‍🌾" },
  { key: "energy", label: "انرژی و سوخت", color: "#d9722a", icon: "⚡" },
  { key: "litter", label: "بستر", color: "#9a7b4f", icon: "🪵" },
  { key: "transport", label: "حمل و نقل", color: "#4b8b8b", icon: "🚚" },
  { key: "equipment", label: "تجهیزات و تعمیر", color: "#7a7f8a", icon: "🔧" },
  { key: "other", label: "سایر", color: "#8a8f98", icon: "📦" },
];

export function categoryLabel(key: string): string {
  return COST_CATEGORIES.find((c) => c.key === key)?.label ?? "سایر";
}
export function categoryColor(key: string): string {
  return COST_CATEGORIES.find((c) => c.key === key)?.color ?? "#8a8f98";
}

export function flockAgeDays(flock: Flock, today = todayIso()): number {
  const end = flock.closed_date ?? today;
  return Math.max(1, isoDaysBetween(flock.start_date, end) + 1);
}

/** نام قدیمی (سازگاری با کد موجود) */
export const cycleAgeDays = flockAgeDays;

export type AlertSeverity = "critical" | "warning" | "info" | "good";

export interface Insight {
  id: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
  recommendation: string;
  action?: { label: string; href: string };
}

export interface CostSlice {
  key: string;
  label: string;
  color: string;
  amount: number;
  share: number;
}

export interface Projection {
  targetAge: number;
  daysRemaining: number;
  projectedWeightG: number;
  projectedFeedKg: number;
  projectedCost: number;
  projectedRevenue: number;
  projectedProfit: number;
  projectedFcr: number;
}

export interface CycleMetrics {
  flock: Flock;
  ageDays: number;
  targetAge: number;
  daysRemaining: number;
  liveBirds: number;
  lostBirds: number;
  mortalityTotal: number;
  cullsTotal: number;
  /** نرخ تلفات = تلفات تجمعی ÷ تعداد اولیه × ۱۰۰ (بدون حذف) */
  mortalityPct: number;
  /** درصد حذف = حذف تجمعی ÷ تعداد اولیه × ۱۰۰ */
  cullPct: number;
  /** درصد کل خارج‌شده‌ها = (تلفات + حذف) ÷ تعداد اولیه × ۱۰۰ */
  removalPct: number;
  /** نرخ تلفات آخرین روز ثبت‌شده (٪) */
  dailyMortalityPct: number;
  /** تغییر مصرف آب آخرین روز نسبت به میانگین سه روز قبل (٪) */
  waterChangePct: number;
  /** میانگین مصرف آب سه روز قبل از آخرین ثبت (لیتر) */
  waterBaselineL: number;
  /** مصرف آب آخرین روز (لیتر) */
  lastWaterL: number;
  expectedMortalityPct: number;
  totalFeedKg: number;
  totalWaterL: number;
  purchasedFeedKg: number;
  feedStockKg: number;
  feedDaysLeft: number;
  todayFeedKg: number;
  last7FeedKg: number;
  avgDailyFeedG: number;
  expectedDailyFeedKg: number;
  currentWeightG: number;
  weightSource: "measured" | "projected" | "none";
  lastWeighDate: string | null;
  measuredWeightG: number | null;
  /** تعداد قطعه وزن‌شده در آخرین نمونه (اعتبار آماری) */
  lastSampleCount: number | null;
  weighCount: number;
  /** یکنواختی آخرین نمونه (٪) */
  uniformityPct: number | null;
  /** میانگین وزنی یکنواختی همه نمونه‌ها (٪) */
  avgUniformityPct: number | null;
  cvPct: number | null;
  uniformityVerdict: "good" | "fair" | "poor" | "unknown";
  /** روند یکنواختی در طول دوره */
  uniformitySeries: { date: string; day: number; uniformityPct: number; cvPct: number | null }[];
  dailyGainG: number;
  stdWeightG: number;
  stdCumFeedG: number;
  weightVsStdPct: number;
  fcr: number | null;
  stdFcr: number;
  feedVsStdPct: number;
  totalCost: number;
  cashCost: number;
  inventoryValue: number;
  avgFeedUnitCost: number;
  costBreakdown: CostSlice[];
  costPerBird: number;
  costPerKgLive: number | null;
  feedCostShare: number;
  revenue: number;
  soldBirds: number;
  soldWeightKg: number;
  avgSalePricePerKg: number | null;
  liveBiomassKg: number;
  estimatedLiveValue: number;
  netProfit: number;
  profitPerBird: number;
  marginPct: number;
  breakevenPerKg: number | null;
  marketPrice: number;
  targetWeightG: number;
  projection: Projection;
  alerts: Insight[];
  dailySeries: DailySeriesPoint[];
  costTimeline: { date: string; amount: number; cumulative: number }[];
}

export interface DailySeriesPoint {
  day: number;
  date: string;
  weightG: number;
  stdWeightG: number;
  feedKg: number;
  stdDailyFeedKg: number;
  mortality: number;
  liveBirds: number;
  cumFeedKg: number;
  stdCumFeedKg: number;
  waterL: number;
  tempC: number | null;
  avgWeightG: number | null;
}

const MORTALITY_ANCHORS = [
  [3, 0.3],
  [7, 0.8],
  [14, 1.5],
  [21, 2.0],
  [28, 2.6],
  [35, 3.2],
  [42, 3.9],
  [49, 4.7],
];

export function expectedMortalityPct(age: number): number {
  const d = Math.max(1, age);
  if (d <= MORTALITY_ANCHORS[0][0]) {
    // زیر نخستین نقطه مرجع، درون‌یابی خطی از صفر تا مقدار روز سوم
    return (MORTALITY_ANCHORS[0][1] * d) / MORTALITY_ANCHORS[0][0];
  }
  for (let i = 0; i < MORTALITY_ANCHORS.length - 1; i++) {
    const [d1, v1] = MORTALITY_ANCHORS[i];
    const [d2, v2] = MORTALITY_ANCHORS[i + 1];
    if (d >= d1 && d <= d2) return v1 + ((v2 - v1) * (d - d1)) / (d2 - d1);
  }
  return MORTALITY_ANCHORS[MORTALITY_ANCHORS.length - 1][1];
}

const CHICK_START_WEIGHT_G = 42;

export function computeMetrics(
  flock: Flock,
  logs: DailyLog[],
  expenses: Expense[],
  sales: Sale[],
  opts: {
    today?: string;
    marketPrice: number;
    feedPrice: number;
    /** آستانه هشدار تلفات روزانه (٪ از پرندگان زنده) — پیش‌فرض ۰٫۵ */
    dailyMortalityAlertPct?: number;
    /** آستانه هشدار افت مصرف آب (٪ نسبت به میانگین سه روز قبل) — پیش‌فرض ۱۰ */
    waterDropAlertPct?: number;
  },
  weights: WeightSample[] = [],
): CycleMetrics {
  const today = opts.today ?? todayIso();
  const ageDays = flockAgeDays(flock, today);
  const targetAge = flock.status === "closed" ? ageDays : Math.max(21, Math.min(70, flock.target_age_days || 42));
  const daysRemaining = Math.max(0, targetAge - ageDays);

  const mortalityTotal = logs.reduce((s, l) => s + (l.mortality || 0), 0);
  const cullsTotal = logs.reduce((s, l) => s + (l.cull || 0), 0);
  const lostBirds = mortalityTotal + cullsTotal;
  const soldBirds = sales.reduce((s, x) => s + (x.count || 0), 0);
  const liveBirds = Math.max(0, flock.initial_count - lostBirds - soldBirds);

  /**
   * قاعده ۲ (نرخ تلفات): نرخ تلفات = (تلفات تجمعی ÷ تعداد اولیه) × ۱۰۰.
   * حذف (cull) در این عدد نمی‌آید — دلیل: استاندارد نژاد هم فقط تلفات را
   * می‌سنجد و مخلوط‌کردن آن‌ها مقایسه با استاندارد را بی‌معنا می‌کند.
   * برای پایش کل پرندگان خارج‌شده، `removalPct` (تلفات + حذف) هم برگردانده
   * می‌شود.
   */
  const mortalityPct = flock.initial_count ? (mortalityTotal / flock.initial_count) * 100 : 0;
  const cullPct = flock.initial_count ? (cullsTotal / flock.initial_count) * 100 : 0;
  const removalPct = flock.initial_count ? (lostBirds / flock.initial_count) * 100 : 0;
  const expectedMortPct = expectedMortalityPct(ageDays);

  const totalFeedKg = logs.reduce((s, l) => s + (l.feed_kg || 0), 0);
  const totalWaterL = logs.reduce((s, l) => s + (l.water_liter || 0), 0);
  const purchasedFeedKg = expenses
    .filter((c) => c.category === "feed" && c.date <= today)
    .reduce((s, c) => s + (c.quantity || 0), 0);
  const feedStockKg = Math.max(0, purchasedFeedKg - totalFeedKg);

  /**
   * قاعده ۵: نرخ تلفات روزانه نسبت به پرندگانی که ابتدای آن روز زنده بودند.
   * پرندگان ابتدای روز = پرندگان زنده فعلی + تلفات و حذف همان روز.
   */
  const lastLog = logs.at(-1) ?? null;
  const birdsAtStartOfLastDay = lastLog ? liveBirds + (lastLog.mortality || 0) + (lastLog.cull || 0) : 0;
  const dailyMortalityPct =
    lastLog && birdsAtStartOfLastDay > 0 ? ((lastLog.mortality || 0) / birdsAtStartOfLastDay) * 100 : 0;

  /**
   * قاعده ۴: افت مصرف آب نسبت به میانگین سه روز قبل از آخرین ثبت.
   * اگر سه روز قبل داده نداشته باشیم (ابتدای دوره) هشدار داده نمی‌شود.
   */
  const waterBaselineDays = logs.slice(-4, -1);
  const waterBaselineL = waterBaselineDays.length
    ? waterBaselineDays.reduce((s, l) => s + (l.water_liter || 0), 0) / waterBaselineDays.length
    : 0;
  const lastWaterL = lastLog?.water_liter ?? 0;
  const waterChangePct = waterBaselineL > 0 ? ((lastWaterL - waterBaselineL) / waterBaselineL) * 100 : 0;

  const last7 = logs.slice(-7);
  const last7FeedKg = last7.reduce((s, l) => s + (l.feed_kg || 0), 0);
  const todayFeedKg = logs.at(-1)?.feed_kg ?? 0;
  const avgDailyFeedG = liveBirds && last7.length ? (last7FeedKg * 1000) / liveBirds / last7.length : 0;
  const expectedDailyFeedKg = (liveBirds * standardAt(ageDays).dailyFeedG) / 1000;
  const feedDaysLeft = expectedDailyFeedKg > 0 ? feedStockKg / expectedDailyFeedKg : 0;

  // وزن‌گیری‌ها منبع رسمی وزن‌اند؛ وزن‌های ثبت‌شده در لاگ روزانه در مدل جدید
  // وجود ندارند و از weight_samples خوانده می‌شوند.
  const sortedWeights = [...weights]
    .filter((w) => (w.avg_weight_gr ?? 0) > 0)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const lastWeigh = sortedWeights.at(-1) ?? null;
  const stdNow = standardAt(ageDays);
  const stdWeightG = stdNow.weightG;
  const measuredWeightG = lastWeigh?.avg_weight_gr ?? null;
  const lastSampleCount = lastWeigh?.sample_count ?? null;

  const uniformitySeries = sortedWeights
    .map((w) => {
      const u = sampleUniformity(w);
      if (u.uniformityPct == null) return null;
      return {
        date: w.date.slice(0, 10),
        day: Math.max(1, isoDaysBetween(flock.start_date, w.date) + 1),
        uniformityPct: u.uniformityPct,
        cvPct: u.cvPct,
      };
    })
    .filter((x): x is { date: string; day: number; uniformityPct: number; cvPct: number | null } => x !== null);

  const uniformityPct = uniformitySeries.length ? uniformitySeries[uniformitySeries.length - 1].uniformityPct : null;
  const avgUniformityPct = uniformitySeries.length
    ? Math.round(uniformitySeries.reduce((sum, x) => sum + x.uniformityPct, 0) / uniformitySeries.length)
    : null;
  const cvPct = uniformitySeries.length ? (uniformitySeries[uniformitySeries.length - 1].cvPct ?? null) : null;
  let currentWeightG = stdWeightG;
  let weightSource: CycleMetrics["weightSource"] = "none";
  if (measuredWeightG) {
    const daysSinceWeigh = Math.max(0, isoDaysBetween(lastWeigh!.date, flock.closed_date ?? today));
    currentWeightG = Math.round(measuredWeightG + daysSinceWeigh * Math.min(75, standardAt(ageDays).weightG * 0.028));
    weightSource = daysSinceWeigh <= 2 ? "measured" : "projected";
  } else {
    currentWeightG = Math.round(stdWeightG * 0.97);
    weightSource = "projected";
  }

  let dailyGainG = 0;
  if (sortedWeights.length >= 2) {
    const a = sortedWeights[Math.max(0, sortedWeights.length - 4)];
    const b = sortedWeights.at(-1)!;
    const dd = isoDaysBetween(a.date, b.date);
    dailyGainG = dd > 0 ? Math.round((b.avg_weight_gr - a.avg_weight_gr) / dd) : 0;
  } else if (ageDays > 7) {
    dailyGainG = Math.round(stdNow.weightG * 0.028 * 0.97);
  }
  if (dailyGainG <= 0) dailyGainG = Math.round(stdNow.weightG * 0.03);

  const weightVsStdPct = stdWeightG ? ((currentWeightG - stdWeightG) / stdWeightG) * 100 : 0;

  const liveBiomassKg = (liveBirds * currentWeightG) / 1000;
  const soldWeightKg = sales.reduce((s, x) => s + (x.total_weight_kg || 0), 0);
  const producedKg = liveBiomassKg + soldWeightKg;

  /**
   * قاعده ۱ (ضریب تبدیل): FCR = مجموع دان مصرفی (کیلوگرم) ÷ مجموع وزن زنده
   * تولیدشده (کیلوگرم).
   * «وزن زنده تولیدشده» = وزن زنده فعلی گله + وزنی که تا امروز فروخته شده؛
   * اگر فقط وزن زنده فعلی در مخرج باشد، فروش‌های میان‌دوره‌ای FCR را مصنوعاً
   * بدتر نشان می‌دهند.
   */
  const fcr = totalFeedKg > 0 && producedKg > 0.001 ? totalFeedKg / producedKg : null;
  // استاندارد گله: ضریب تبدیل نژاد با احتساب تلفات (خوراک پرندگان تلف‌شده)
  const stdFcr = standardAt(ageDays).fcr * (1 + mortalityPct / 100);
  const feedVsStdPct = stdNow.cumFeedG && logs.length ? ((totalFeedKg * 1000 / Math.max(1, flock.initial_count) - stdNow.cumFeedG) / stdNow.cumFeedG) * 100 : 0;

  const cashCost = expenses.reduce((s, c) => s + (c.amount || 0), 0);
  const feedPurchases = expenses.filter((c) => c.category === "feed");
  const feedPurchaseCost = feedPurchases.reduce((s, c) => s + (c.amount || 0), 0);
  const feedPurchaseQty = feedPurchases.reduce((s, c) => s + (c.quantity || 0), 0);
  const avgFeedUnitCost = feedPurchaseQty > 0 ? feedPurchaseCost / feedPurchaseQty : opts.feedPrice || 33500;
  const consumedFeedCost = totalFeedKg * avgFeedUnitCost;
  const inventoryValue = feedStockKg * avgFeedUnitCost;
  // هزینه دوره بر مبنای «مصرف» است، نه خرید انبار
  const totalCost = Math.max(0, cashCost - feedPurchaseCost + consumedFeedCost);
  const byCat = new Map<string, number>();
  for (const c of expenses) {
    if (c.category === "feed") continue;
    byCat.set(c.category, (byCat.get(c.category) ?? 0) + (c.amount || 0));
  }
  byCat.set("feed", (byCat.get("feed") ?? 0) + consumedFeedCost);
  const costBreakdown: CostSlice[] = COST_CATEGORIES.map((cat) => {
    const amount = byCat.get(cat.key) ?? 0;
    return { key: cat.key, label: cat.label, color: cat.color, amount, share: totalCost ? (amount / totalCost) * 100 : 0 };
  })
    .filter((c) => c.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  const feedCost = consumedFeedCost;
  const feedCostShare = totalCost ? (feedCost / totalCost) * 100 : 0;

  const revenue = sales.reduce((s, x) => s + Math.max(0, x.total_weight_kg * x.price_per_kg - (x.deductions || 0)), 0);
  const avgSalePricePerKg = soldWeightKg > 0 ? revenue / soldWeightKg : null;
  const marketPrice = opts.marketPrice || 0;
  const estimatedLiveValue = liveBiomassKg * marketPrice;

  const costPerBird = flock.initial_count ? totalCost / flock.initial_count : 0;
  /**
   * قاعده ۳ (قیمت تمام‌شده): مجموع هزینه‌های دوره ÷ وزن نهایی.
   * وزن نهایی همان مخرج FCR است (وزن زنده تولیدشده) تا این دو شاخص هم‌پایه
   * باشند و «هزینه × وزن» با «هزینه کل» بخواند.
   * نکته: `totalCost` هزینه «مصرف» است (دان خریداری‌شده منهای موجودی انبار)،
   * نه مبلغ پرداختی؛ وگرنه خرید بزرگ پایان دوره قیمت هر کیلو را مصنوعاً بالا
   * می‌برد.
   */
  const costPerKgLive = producedKg > 0.01 ? totalCost / producedKg : null;

  const realizedRevenue = revenue;
  const netProfit = realizedRevenue - totalCost;
  const profitPerBird = flock.initial_count ? netProfit / flock.initial_count : 0;
  const marginPct = realizedRevenue > 0 ? (netProfit / realizedRevenue) * 100 : 0;
  const breakevenPerKg = producedKg > 0.01 ? totalCost / producedKg : null;

  // پیش‌بینی پایان دوره — بر پایه عملکرد نسبی گله در برابر استاندارد نژاد
  const projAge = targetAge;
  const remainingDays = Math.max(0, projAge - ageDays);
  const perfRatio = stdNow.weightG > 0 ? currentWeightG / stdNow.weightG : 1;
  const clampedPerf = Math.min(1.18, Math.max(0.75, perfRatio));
  const projWeight = Math.min(4300, Math.round(standardAt(projAge).weightG * clampedPerf));

  const stdCumNowG = stdNow.cumFeedG;
  const stdCumTargetG = standardAt(projAge).cumFeedG;
  const perBirdConsumedG = logs.length ? (totalFeedKg * 1000) / Math.max(1, flock.initial_count) : stdCumNowG;
  const feedPerf = Math.min(1.15, Math.max(0.88, perBirdConsumedG / Math.max(1, stdCumNowG)));
  const remainingConsumptionKg = ((liveBirds + soldBirds * 0.15) * Math.max(0, stdCumTargetG - stdCumNowG) * feedPerf) / 1000;
  const projectedFeedKg = totalFeedKg + Math.max(0, remainingConsumptionKg);

  const nonFeedCost = totalCost - feedCost;
  const dailyOverhead = ageDays > 0 ? nonFeedCost / ageDays : 0;
  const projectedCost =
    totalCost +
    Math.max(0, projectedFeedKg - totalFeedKg) * avgFeedUnitCost +
    remainingDays * dailyOverhead * 0.55;
  const projectedBiomassKg = (liveBirds * projWeight) / 1000 + soldWeightKg;
  const projectedRevenue = projectedBiomassKg * (avgSalePricePerKg ?? marketPrice);
  const projectedProfit = projectedRevenue - projectedCost;
  const projectedGainKg = Math.max(0.001, projectedBiomassKg - (flock.initial_count * CHICK_START_WEIGHT_G) / 1000);
  const projectedFcr = projectedBiomassKg > 0 ? projectedFeedKg / projectedGainKg : 0;

  // سری زمانی روزانه
  let live = flock.initial_count;
  let cumFeed = 0;
  const weighByDate = new Map(sortedWeights.map((w) => [w.date, w.avg_weight_gr]));
  const dailySeries: DailySeriesPoint[] = logs.map((l, i) => {
    live = Math.max(0, live - (l.mortality || 0) - (l.cull || 0));
    cumFeed += l.feed_kg || 0;
    const day = i + 1;
    const std = standardAt(day);
    const weighed = weighByDate.get(l.date) ?? null;
    return {
      day,
      date: l.date,
      weightG: weighed ?? std.weightG * 0.97,
      stdWeightG: std.weightG,
      feedKg: l.feed_kg || 0,
      stdDailyFeedKg: (std.dailyFeedG * live) / 1000,
      mortality: l.mortality || 0,
      liveBirds: live,
      cumFeedKg: cumFeed,
      stdCumFeedKg: (std.cumFeedG * flock.initial_count) / 1000,
      waterL: l.water_liter || 0,
      tempC: l.avg_temp ?? null,
      avgWeightG: weighed,
    };
  });

  const sortedCosts = [...expenses].sort((a, b) => (a.date < b.date ? -1 : 1));
  let cum = 0;
  const costTimeline = sortedCosts.map((c) => {
    cum += c.amount || 0;
    return { date: c.date, amount: c.amount || 0, cumulative: cum };
  });

  const alerts = buildAlerts({
    flock,
    ageDays,
    mortalityPct,
    expectedMortalityPct: expectedMortPct,
    logs,
    liveBirds,
    weightVsStdPct,
    weightSource,
    lastWeighDate: lastWeigh?.date ?? null,
    fcr,
    stdFcr,
    feedDaysLeft,
    expectedDailyFeedKg,
    feedStockKg,
    totalFeedKg,
    totalWaterL,
    currentWeightG,
    targetWeightG: flock.target_weight_g,
    costPerKgLive,
    marketPrice,
    daysRemaining,
    targetAge,
    tempC: logs.at(-1)?.avg_temp ?? null,
    recentMortalityAvg: last7.length ? last7.reduce((s, l) => s + l.mortality, 0) / last7.length : 0,
    dailyMortalityPct,
    dailyMortalityAlertPct: opts.dailyMortalityAlertPct ?? 0.5,
    waterChangePct,
    waterBaselineL,
    waterDropAlertPct: opts.waterDropAlertPct ?? 10,
    lastWaterL,
    lastLogDate: lastLog?.date?.slice(0, 10) ?? null,
  });

  return {
    flock,
    ageDays,
    targetAge,
    daysRemaining,
    liveBirds,
    lostBirds,
    mortalityTotal,
    cullsTotal,
    mortalityPct,
    cullPct,
    removalPct,
    dailyMortalityPct,
    waterChangePct,
    waterBaselineL,
    lastWaterL,
    expectedMortalityPct: expectedMortPct,
    totalFeedKg,
    totalWaterL,
    purchasedFeedKg,
    feedStockKg,
    feedDaysLeft,
    todayFeedKg,
    last7FeedKg,
    avgDailyFeedG,
    expectedDailyFeedKg,
    currentWeightG,
    weightSource,
    lastWeighDate: lastWeigh?.date ?? null,
    measuredWeightG,
    lastSampleCount,
    weighCount: sortedWeights.length,
    uniformityPct,
    avgUniformityPct,
    cvPct,
    uniformityVerdict: uniformityVerdict(uniformityPct),
    uniformitySeries,
    dailyGainG,
    stdWeightG,
    stdCumFeedG: stdNow.cumFeedG,
    weightVsStdPct,
    fcr,
    stdFcr,
    feedVsStdPct,
    totalCost,
    cashCost,
    inventoryValue,
    avgFeedUnitCost,
    costBreakdown,
    costPerBird,
    costPerKgLive,
    feedCostShare,
    revenue,
    soldBirds,
    soldWeightKg,
    avgSalePricePerKg,
    liveBiomassKg,
    estimatedLiveValue,
    netProfit,
    profitPerBird,
    marginPct,
    breakevenPerKg,
    marketPrice,
    targetWeightG: flock.target_weight_g,
    projection: {
      targetAge: projAge,
      daysRemaining: remainingDays,
      projectedWeightG: projWeight,
      projectedFeedKg,
      projectedCost,
      projectedRevenue,
      projectedProfit,
      projectedFcr,
    },
    alerts,
    dailySeries,
    costTimeline,
  };
}

function buildAlerts(x: {
  flock: Flock;
  ageDays: number;
  mortalityPct: number;
  expectedMortalityPct: number;
  logs: DailyLog[];
  liveBirds: number;
  weightVsStdPct: number;
  weightSource: string;
  lastWeighDate: string | null;
  fcr: number | null;
  stdFcr: number;
  feedDaysLeft: number;
  expectedDailyFeedKg: number;
  feedStockKg: number;
  totalFeedKg: number;
  totalWaterL: number;
  currentWeightG: number;
  targetWeightG: number;
  costPerKgLive: number | null;
  marketPrice: number;
  daysRemaining: number;
  targetAge: number;
  tempC: number | null;
  recentMortalityAvg: number;
  dailyMortalityPct: number;
  dailyMortalityAlertPct: number;
  waterChangePct: number;
  waterBaselineL: number;
  waterDropAlertPct: number;
  lastWaterL: number;
  lastLogDate: string | null;
}): Insight[] {
  const out: Insight[] = [];
  const last = x.logs.at(-1);
  const daysAgo = last ? isoDaysBetween(last.date, todayIso()) : 99;

  if (daysAgo > 1) {
    out.push({
      id: "stale-log",
      severity: daysAgo > 3 ? "warning" : "info",
      title: "ثبت روزانه به‌روز نیست",
      detail: `آخرین ثبت مربوط به ${faDigits(daysAgo)} روز پیش است. برای دقت تحلیل‌ها، آمار روزانه را کامل کنید.`,
      recommendation: "تلفات، دان مصرفی و دمای سالن امروز را ثبت کنید تا محاسبات و هشدارها دقیق بماند.",
      action: { label: "ثبت آمار امروز", href: `/flocks/${x.flock.id}?tab=daily` },
    });
  }

  if (x.recentMortalityAvg >= 2 && last && last.mortality >= Math.max(3, x.recentMortalityAvg * 2.2)) {
    out.push({
      id: "mortality-spike",
      severity: "critical",
      title: "جهش تلفات در ۲۴ ساعت گذشته",
      detail: `تلفات روز آخر ${faDigits(last.mortality)} قطعه است، در حالی که میانگین هفت روز اخیر حدود ${faDigits(x.recentMortalityAvg.toFixed(1))} قطعه بوده.`,
      recommendation:
        "علائم بالینی را بررسی کنید: وضعیت تنفس، مدفوع، دمای سالن و کیفیت آب. در صورت ادامه، با دامپزشک تماس بگیرید و کالبدشکافی نمونه انجام دهید.",
      action: { label: "ثبت گزارش دامپزشکی", href: `/flocks/${x.flock.id}?tab=daily` },
    });
  }

  /**
   * قاعده ۵: هشدار خودکار وقتی نرخ تلفات روزانه از آستانه بگذرد.
   * آستانه پیش‌فرض ۰٫۵٪ از پرندگان زنده است و در تنظیمات مزرعه قابل تغییر.
   */
  if (last && x.dailyMortalityAlertPct > 0 && x.dailyMortalityPct > x.dailyMortalityAlertPct) {
    const severity = x.dailyMortalityPct >= x.dailyMortalityAlertPct * 2 ? "critical" : "warning";
    out.push({
      id: "mortality-daily",
      severity,
      title: "نرخ تلفات امروز از آستانه گذشت",
      detail: `تلفات روز ${faDigits(x.lastLogDate ? x.lastLogDate : "")} برابر ${faDigits(last.mortality)} قطعه و نرخ روزانه ${faDigits(
        x.dailyMortalityPct.toFixed(2),
      )}٪ است؛ آستانه هشدار ${faDigits(x.dailyMortalityAlertPct.toFixed(2))}٪.`,
      recommendation:
        "تلفات را به تفکیک سالن ثبت کنید، آب و دان را از نظر آلودگی بررسی کنید و در صورت ادامه بیش از دو روز، با دامپزشک تماس بگیرید.",
      action: { label: "ثبت آمار امروز", href: `/flocks/${x.flock.id}?tab=daily` },
    });
  }

  /**
   * قاعده ۴: هشدار خودکار وقتی مصرف آب بیش از آستانه (پیش‌فرض ۱۰٪) نسبت به
   * میانگین سه روز قبل افت کند. افت آب پیش از افت دان رخ می‌دهد و از
   * زودهنگام‌ترین نشانه‌های بیماری است.
   */
  if (last && x.waterBaselineL > 0 && x.waterChangePct <= -x.waterDropAlertPct) {
    const dropPct = Math.abs(x.waterChangePct);
    out.push({
      id: "water-drop",
      severity: dropPct >= x.waterDropAlertPct * 2 ? "critical" : "warning",
      title: "افت مصرف آب نسبت به سه روز گذشته",
      detail: `مصرف آب آخرین روز ${faDigits(Math.round(x.lastWaterL))} لیتر و میانگین سه روز قبل ${faDigits(
        Math.round(x.waterBaselineL),
      )} لیتر است؛ کاهش ${faDigits(dropPct.toFixed(1))}٪ (آستانه ${faDigits(x.waterDropAlertPct)}٪).`,
      recommendation:
        "گرفتگی یا نشتی خط آب، فشار و ارتفاع آبخوری، دمای سالن و شروع بیماری را بررسی کنید. افت مصرف آب معمولاً پیش از افت دان دیده می‌شود.",
      action: { label: "بررسی ثبت امروز", href: `/flocks/${x.flock.id}?tab=daily` },
    });
  }

  if (x.mortalityPct > x.expectedMortalityPct * 1.2 && x.ageDays >= 7) {
    out.push({
      id: "mortality-high",
      severity: x.mortalityPct > x.expectedMortalityPct * 1.5 ? "critical" : "warning",
      title: "تلفات تجمعی بالاتر از حد انتظار",
      detail: `تلفات تجمعی ${faDigits(x.mortalityPct.toFixed(1))}٪ در برابر انتظار حدود ${faDigits(x.expectedMortalityPct.toFixed(1))}٪ در روز ${faDigits(x.ageDays)}. اختلاف حدود ${faDigits((x.mortalityPct - x.expectedMortalityPct).toFixed(1))} واحد درصد.`,
      recommendation:
        "علت را در سه محور بررسی کنید: کیفیت جوجه اولیه، مدیریت دما/تهویه و برنامه واکسیناسیون. تلفات ۷ روز اول بیشترین اثر را بر سود دارد.",
      action: { label: "تحلیل تلفات", href: `/flocks/${x.flock.id}?tab=daily` },
    });
  }

  if (x.ageDays >= 10 && x.weightVsStdPct < -6) {
    out.push({
      id: "weight-low",
      severity: x.weightVsStdPct < -12 ? "critical" : "warning",
      title: "وزن بدن عقب‌تر از استاندارد",
      detail: `وزن فعلی حدود ${faDigits((100 + x.weightVsStdPct).toFixed(1))}٪ استاندارد نژاد است (${faDigits(x.weightVsStdPct.toFixed(1))}٪).`,
      recommendation:
        "دسترسی به دان و آب را بازرسی کنید، دان با کیفیت هر مرحله را کنترل و فضای دانخوری را افزایش دهید. تراکم و تهویه را بررسی کنید و وزن‌کشی هفتگی را دقیق‌تر انجام دهید.",
      action: { label: "برنامه رشد", href: `/flocks/${x.flock.id}?tab=growth` },
    });
  } else if (x.ageDays >= 10 && x.weightVsStdPct > 6) {
    out.push({
      id: "weight-high",
      severity: "good",
      title: "عملکرد رشد بالاتر از استاندارد",
      detail: `وزن بدن حدود ${faDigits(x.weightVsStdPct.toFixed(1))}٪ بالاتر از استاندارد نژاد است.`,
      recommendation: "روند فعلی را حفظ کنید و مراقب افزایش ضریب تبدیل و بروز مشکلات پا در وزن‌های بالا باشید.",
    });
  }

  if (x.fcr && x.ageDays >= 21 && x.fcr > x.stdFcr * 1.1) {
    out.push({
      id: "fcr-high",
      severity: x.fcr > x.stdFcr * 1.22 ? "warning" : "info",
      title: "ضریب تبدیل خوراک بالاتر از استاندارد",
      detail: `ضریب تبدیل گله ${faDigits(x.fcr.toFixed(2))} در برابر استاندارد ${faDigits(x.stdFcr.toFixed(2))}. هر ۰٫۰۱ بهبود FCR در این گله تقریباً معادل صرفه‌جویی قابل توجهی در هزینه دان است.`,
      recommendation:
        "ریزش دان و پرت خوراک را کنترل کنید، اندازه ذرات دان را با سن پرنده تطبیق دهید و برنامه دان‌دهی را بازبینی کنید.",
      action: { label: "جزئیات خوراک", href: `/flocks/${x.flock.id}?tab=feed` },
    });
  }

  if (x.expectedDailyFeedKg > 0 && x.feedDaysLeft < 2) {
    out.push({
      id: "feed-stock",
      severity: x.feedDaysLeft < 1 ? "critical" : "warning",
      title: "موجودی دان کم است",
      detail:
        x.feedStockKg < 1
          ? "انبار دان خالی است و گله برای وعده‌های بعدی خوراک ندارد. تأمین فوری دان ضروری است."
          : `موجودی انبار حدود ${faDigits(x.feedStockKg.toFixed(0))} کیلوگرم است؛ با مصرف فعلی فقط ${faDigits(x.feedDaysLeft.toFixed(1))} روز کافی است.`,
      recommendation: "سفارش دان مرحله بعد را همین امروز ثبت کنید تا قطع ناگهانی خوراک باعث افت رشد نشود.",
      action: { label: "ثبت خرید دان", href: `/flocks/${x.flock.id}?tab=costs` },
    });
  }

  if (x.totalFeedKg > 0) {
    const ratio = x.totalWaterL / x.totalFeedKg;
    if (x.ageDays >= 10 && ratio > 2.15) {
      out.push({
        id: "water-high",
        severity: "warning",
        title: "نسبت آب به دان بالاست",
        detail: `نسبت آب مصرفی به دان ${faDigits(ratio.toFixed(2))} است (محدوده طبیعی حدود ۱٫۶ تا ۲٫۰).`,
        recommendation:
          "افزایش مصرف آب می‌تواند نشانه استرس گرمایی، اسهال یا مشکل کیفیت آب باشد. نشتی آبخوری و دمای سالن را کنترل کنید.",
      });
    } else if (x.ageDays >= 10 && ratio < 1.4) {
      out.push({
        id: "water-low",
        severity: "warning",
        title: "مصرف آب کمتر از حد انتظار",
        detail: `نسبت آب به دان ${faDigits(ratio.toFixed(2))} است؛ احتمال کم‌آبی، گرفتگی خط آب یا بیماری وجود دارد.`,
        recommendation: "فشار خط آب، ارتفاع آبخوری و رفتار پرندگان را بررسی کنید. بی‌حالی و کاهش مصرف دان را جدی بگیرید.",
      });
    }
  }

  if (x.costPerKgLive && x.marketPrice && x.costPerKgLive > x.marketPrice * 0.92 && x.ageDays >= 21) {
    out.push({
      id: "margin-tight",
      severity: x.costPerKgLive > x.marketPrice ? "critical" : "warning",
      title: "حاشیه سود در معرض خطر است",
      detail: `بهای تمام‌شده هر کیلوگرم وزن زنده ${Math.round(x.costPerKgLive).toLocaleString("fa-IR")} تومان و قیمت بازار ${Math.round(x.marketPrice).toLocaleString("fa-IR")} تومان است.`,
      recommendation:
        "هزینه دان را بازبینی کنید و زمان فروش را بهینه کنید. کاهش تلفات و بهبود FCR سریع‌ترین راه‌های بازگرداندن حاشیه سود هستند.",
      action: { label: "تحلیل هزینه", href: `/flocks/${x.flock.id}?tab=costs` },
    });
  }

  if (x.ageDays >= 3 && x.tempC != null) {
    const targetTemp = Math.max(20, 33.5 - x.ageDays * 0.33);
    if (x.tempC < targetTemp - 2.5) {
      out.push({
        id: "temp-low",
        severity: "warning",
        title: "دمای سالن پایین‌تر از محدوده هدف",
        detail: `دمای ثبت‌شده ${faDigits(x.tempC)} درجه و دمای هدف حدود ${faDigits(targetTemp.toFixed(1))} درجه است.`,
        recommendation: "دمای سالن را تدریجی تنظیم کنید؛ افت دما مصرف دان را بالا و FCR را بدتر می‌کند.",
      });
    } else if (x.tempC > targetTemp + 3.5) {
      out.push({
        id: "temp-high",
        severity: "warning",
        title: "خطر استرس گرمایی",
        detail: `دمای ثبت‌شده ${faDigits(x.tempC)} درجه و دمای هدف حدود ${faDigits(targetTemp.toFixed(1))} درجه است.`,
        recommendation: "تهویه و پنکه‌ها را فعال کنید و آب خنک در اختیار گله بگذارید. استرس گرمایی مصرف دان را کاهش می‌دهد.",
      });
    }
  }

  if (x.ageDays >= 7 && (!x.lastWeighDate || isoDaysBetween(x.lastWeighDate, todayIso()) > 7)) {
    out.push({
      id: "weigh",
      severity: "info",
      title: "وزن‌کشی دوره‌ای انجام نشده",
      detail: x.lastWeighDate
        ? `آخرین وزن‌کشی در ${formatJalali(x.lastWeighDate)} ثبت شده است.`
        : "برای این دوره هنوز وزنی ثبت نشده و مقادیر رشد تخمینی است.",
      recommendation: "هفته‌ای یک‌بار وزن‌کشی نمونه‌ای (حداقل ۱۰۰ قطعه) انجام دهید تا روند رشد و پیش‌بینی پایان دوره واقعی باشد.",
      action: { label: "ثبت وزن", href: `/flocks/${x.flock.id}?tab=daily` },
    });
  }

  if (x.daysRemaining <= 5 && x.currentWeightG >= x.targetWeightG * 0.97) {
    out.push({
      id: "sell-window",
      severity: "info",
      title: "پنجره فروش نزدیک است",
      detail: `وزن فعلی ${faDigits(Math.round(x.currentWeightG))} گرم و وزن هدف ${faDigits(x.targetWeightG)} گرم است؛ ${faDigits(x.daysRemaining)} روز تا سن هدف باقی مانده.`,
      recommendation:
        "قیمت روز بازار را بررسی کنید. اگر قیمت مناسب است و رشد روزانه کمتر از هزینه دان روزانه شده، فروش زودتر از سن هدف سودآورتر است.",
      action: { label: "ثبت فروش", href: `/cycles/${x.flock.id}?tab=sales` },
    });
  }

  if (out.length === 0) {
    out.push({
      id: "all-good",
      severity: "good",
      title: "همه شاخص‌ها در محدوده مطلوب است",
      detail: "تلفات، رشد، ضریب تبدیل و موجودی دان در محدوده قابل قبول قرار دارند.",
      recommendation: "روند ثبت روزانه را ادامه دهید؛ پایش منظم، بهترین ابزار پیشگیری از زیان است.",
    });
  }

  const order: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2, good: 3 };
  return out.sort((a, b) => order[a.severity] - order[b.severity]);
}

export interface CycleSummary {
  flock: Flock;
  metrics: CycleMetrics;
}

/**
 * تجمیع شاخص‌های مزرعه از متریک‌های محاسبه‌شده.
 * این تابع خالص است؛ لایه API داده‌ها را از پایگاه داده می‌خواند و اینجا تجمیع می‌کند.
 * (نسخه قبلی مستقیماً به SQLite وابسته بود و همین باعث دوباره‌کاری در موبایل می‌شد.)
 */
export function aggregateOverview(activeMetrics: CycleMetrics[], closedMetrics: CycleMetrics[]) {
  const liveBirds = activeMetrics.reduce((s, m) => s + m.liveBirds, 0);
  const liveBiomassKg = activeMetrics.reduce((s, m) => s + m.liveBiomassKg, 0);
  const activeCost = activeMetrics.reduce((s, m) => s + m.totalCost, 0);
  const activeProjectedProfit = activeMetrics.reduce((s, m) => s + m.projection.projectedProfit, 0);
  const realizedProfit = closedMetrics.reduce((s, m) => s + m.netProfit, 0);
  const realizedRevenue = closedMetrics.reduce((s, m) => s + m.revenue, 0);
  const alerts = activeMetrics.flatMap((m) =>
    m.alerts
      .filter((a) => a.severity === "critical" || a.severity === "warning")
      .map((a) => ({ ...a, cycleId: m.flock.id, cycleName: m.flock.name })),
  );
  const lostBirds = activeMetrics.reduce((s, m) => s + m.lostBirds, 0);
  const initialBirds = activeMetrics.reduce((s, m) => s + m.flock.initial_count, 0);
  const mortalityPctWeighted = initialBirds > 0 ? (lostBirds / initialBirds) * 100 : 0;
  const totalFeed = activeMetrics.reduce((s, m) => s + m.totalFeedKg, 0);
  const totalCostAll =
    activeMetrics.reduce((s, m) => s + m.totalCost, 0) + closedMetrics.reduce((s, m) => s + m.totalCost, 0);
  const feedCostTotal =
    activeMetrics.reduce((s, m) => s + (m.costBreakdown.find((c) => c.key === "feed")?.amount ?? 0), 0) +
    closedMetrics.reduce((s, m) => s + (m.costBreakdown.find((c) => c.key === "feed")?.amount ?? 0), 0);

  const combinedCost = new Map<string, number>();
  for (const m of [...activeMetrics, ...closedMetrics]) {
    for (const c of m.costBreakdown) combinedCost.set(c.key, (combinedCost.get(c.key) ?? 0) + c.amount);
  }
  const costBreakdown: CostSlice[] = COST_CATEGORIES.map((cat) => {
    const amount = combinedCost.get(cat.key) ?? 0;
    return {
      key: cat.key,
      label: cat.label,
      color: cat.color,
      amount,
      share: totalCostAll ? (amount / totalCostAll) * 100 : 0,
    };
  })
    .filter((c) => c.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  return {
    activeMetrics,
    closedMetrics,
    liveBirds,
    liveBiomassKg,
    activeCost,
    activeProjectedProfit,
    activeProjectedRevenue: activeMetrics.reduce((s, m) => s + m.projection.projectedRevenue, 0),
    realizedProfit,
    realizedRevenue,
    totalCostAll,
    totalFeed,
    feedCostTotal,
    alerts,
    mortalityPctWeighted,
    costBreakdown,
  };
}

export type FarmOverview = ReturnType<typeof aggregateOverview>;
