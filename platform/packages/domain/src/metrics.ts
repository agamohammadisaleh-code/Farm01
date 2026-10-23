import { faDigits, formatJalali, isoDaysBetween, todayIso } from "./jalali";
import { standardAt } from "./standards";
import type { Cost, CostCategory, Cycle, DailyLog, Sale } from "./types";

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

export function cycleAgeDays(cycle: Cycle, today = todayIso()): number {
  const end = cycle.closed_date ?? today;
  return Math.max(1, isoDaysBetween(cycle.placement_date, end) + 1);
}

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
  cycle: Cycle;
  ageDays: number;
  targetAge: number;
  daysRemaining: number;
  liveBirds: number;
  lostBirds: number;
  mortalityTotal: number;
  cullsTotal: number;
  mortalityPct: number;
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
  cycle: Cycle,
  logs: DailyLog[],
  costs: Cost[],
  sales: Sale[],
  opts: { today?: string; marketPrice: number; feedPrice: number },
): CycleMetrics {
  const today = opts.today ?? todayIso();
  const ageDays = cycleAgeDays(cycle, today);
  const targetAge = cycle.status === "closed" ? ageDays : Math.max(21, Math.min(70, cycle.target_age_days || 42));
  const daysRemaining = Math.max(0, targetAge - ageDays);

  const mortalityTotal = logs.reduce((s, l) => s + (l.mortality || 0), 0);
  const cullsTotal = logs.reduce((s, l) => s + (l.culls || 0), 0);
  const lostBirds = mortalityTotal + cullsTotal;
  const soldBirds = sales.reduce((s, x) => s + (x.count || 0), 0);
  const liveBirds = Math.max(0, cycle.initial_count - lostBirds - soldBirds);
  const mortalityPct = cycle.initial_count ? (lostBirds / cycle.initial_count) * 100 : 0;
  const expectedMortPct = expectedMortalityPct(ageDays);

  const totalFeedKg = logs.reduce((s, l) => s + (l.feed_kg || 0), 0);
  const totalWaterL = logs.reduce((s, l) => s + (l.water_l || 0), 0);
  const purchasedFeedKg = costs
    .filter((c) => c.category === "feed" && c.date <= today)
    .reduce((s, c) => s + (c.quantity || 0), 0);
  const feedStockKg = Math.max(0, purchasedFeedKg - totalFeedKg);

  const last7 = logs.slice(-7);
  const last7FeedKg = last7.reduce((s, l) => s + (l.feed_kg || 0), 0);
  const todayFeedKg = logs.at(-1)?.feed_kg ?? 0;
  const avgDailyFeedG = liveBirds && last7.length ? (last7FeedKg * 1000) / liveBirds / last7.length : 0;
  const expectedDailyFeedKg = (liveBirds * standardAt(ageDays).dailyFeedG) / 1000;
  const feedDaysLeft = expectedDailyFeedKg > 0 ? feedStockKg / expectedDailyFeedKg : 0;

  const weights = logs.filter((l) => l.avg_weight_g != null && l.avg_weight_g! > 0);
  const lastWeigh = weights.at(-1) ?? null;
  const stdNow = standardAt(ageDays);
  const stdWeightG = stdNow.weightG;
  const measuredWeightG = lastWeigh?.avg_weight_g ?? null;
  let currentWeightG = stdWeightG;
  let weightSource: CycleMetrics["weightSource"] = "none";
  if (measuredWeightG) {
    const daysSinceWeigh = Math.max(0, isoDaysBetween(lastWeigh!.date, cycle.closed_date ?? today));
    currentWeightG = Math.round(measuredWeightG + daysSinceWeigh * Math.min(75, standardAt(ageDays).weightG * 0.028));
    weightSource = daysSinceWeigh <= 2 ? "measured" : "projected";
  } else if (weights.length === 0) {
    currentWeightG = Math.round(stdWeightG * 0.97);
    weightSource = "projected";
  }

  let dailyGainG = 0;
  if (weights.length >= 2) {
    const a = weights[Math.max(0, weights.length - 4)];
    const b = weights.at(-1)!;
    const dd = isoDaysBetween(a.date, b.date);
    dailyGainG = dd > 0 ? Math.round((b.avg_weight_g! - a.avg_weight_g!) / dd) : 0;
  } else if (ageDays > 7) {
    dailyGainG = Math.round(stdNow.weightG * 0.028 * 0.97);
  }
  if (dailyGainG <= 0) dailyGainG = Math.round(stdNow.weightG * 0.03);

  const weightVsStdPct = stdWeightG ? ((currentWeightG - stdWeightG) / stdWeightG) * 100 : 0;

  const liveBiomassKg = (liveBirds * currentWeightG) / 1000;
  const soldWeightKg = sales.reduce((s, x) => s + (x.weight_kg || 0), 0);
  const producedKg = liveBiomassKg + soldWeightKg;
  const fcr = totalFeedKg > 0 && producedKg > 0.001 ? totalFeedKg / producedKg : null;
  // استاندارد گله: ضریب تبدیل نژاد با احتساب تلفات (خوراک پرندگان تلف‌شده)
  const stdFcr = standardAt(ageDays).fcr * (1 + mortalityPct / 100);
  const feedVsStdPct = stdNow.cumFeedG && logs.length ? ((totalFeedKg * 1000 / Math.max(1, cycle.initial_count) - stdNow.cumFeedG) / stdNow.cumFeedG) * 100 : 0;

  const cashCost = costs.reduce((s, c) => s + (c.amount || 0), 0);
  const feedPurchases = costs.filter((c) => c.category === "feed");
  const feedPurchaseCost = feedPurchases.reduce((s, c) => s + (c.amount || 0), 0);
  const feedPurchaseQty = feedPurchases.reduce((s, c) => s + (c.quantity || 0), 0);
  const avgFeedUnitCost = feedPurchaseQty > 0 ? feedPurchaseCost / feedPurchaseQty : opts.feedPrice || 33500;
  const consumedFeedCost = totalFeedKg * avgFeedUnitCost;
  const inventoryValue = feedStockKg * avgFeedUnitCost;
  // هزینه دوره بر مبنای «مصرف» است، نه خرید انبار
  const totalCost = Math.max(0, cashCost - feedPurchaseCost + consumedFeedCost);
  const byCat = new Map<string, number>();
  for (const c of costs) {
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

  const revenue = sales.reduce((s, x) => s + Math.max(0, x.weight_kg * x.price_per_kg - (x.deductions || 0)), 0);
  const avgSalePricePerKg = soldWeightKg > 0 ? revenue / soldWeightKg : null;
  const marketPrice = opts.marketPrice || 0;
  const estimatedLiveValue = liveBiomassKg * marketPrice;

  const costPerBird = cycle.initial_count ? totalCost / cycle.initial_count : 0;
  const costPerKgLive = producedKg > 0.01 ? totalCost / producedKg : null;

  const realizedRevenue = revenue;
  const netProfit = realizedRevenue - totalCost;
  const profitPerBird = cycle.initial_count ? netProfit / cycle.initial_count : 0;
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
  const perBirdConsumedG = logs.length ? (totalFeedKg * 1000) / Math.max(1, cycle.initial_count) : stdCumNowG;
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
  const projectedGainKg = Math.max(0.001, projectedBiomassKg - (cycle.initial_count * CHICK_START_WEIGHT_G) / 1000);
  const projectedFcr = projectedBiomassKg > 0 ? projectedFeedKg / projectedGainKg : 0;

  // سری زمانی روزانه
  let live = cycle.initial_count;
  let cumFeed = 0;
  const dailySeries: DailySeriesPoint[] = logs.map((l, i) => {
    live = Math.max(0, live - (l.mortality || 0) - (l.culls || 0));
    cumFeed += l.feed_kg || 0;
    const day = i + 1;
    const std = standardAt(day);
    return {
      day,
      date: l.date,
      weightG: l.avg_weight_g ?? std.weightG * 0.97,
      stdWeightG: std.weightG,
      feedKg: l.feed_kg || 0,
      stdDailyFeedKg: (std.dailyFeedG * live) / 1000,
      mortality: l.mortality || 0,
      liveBirds: live,
      cumFeedKg: cumFeed,
      stdCumFeedKg: (std.cumFeedG * cycle.initial_count) / 1000,
      waterL: l.water_l || 0,
      tempC: l.temp_c ?? null,
      avgWeightG: l.avg_weight_g ?? null,
    };
  });

  const sortedCosts = [...costs].sort((a, b) => (a.date < b.date ? -1 : 1));
  let cum = 0;
  const costTimeline = sortedCosts.map((c) => {
    cum += c.amount || 0;
    return { date: c.date, amount: c.amount || 0, cumulative: cum };
  });

  const alerts = buildAlerts({
    cycle,
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
    targetWeightG: cycle.target_weight_g,
    costPerKgLive,
    marketPrice,
    daysRemaining,
    targetAge,
    tempC: logs.at(-1)?.temp_c ?? null,
    recentMortalityAvg: last7.length ? last7.reduce((s, l) => s + l.mortality, 0) / last7.length : 0,
  });

  return {
    cycle,
    ageDays,
    targetAge,
    daysRemaining,
    liveBirds,
    lostBirds,
    mortalityTotal,
    cullsTotal,
    mortalityPct,
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
    targetWeightG: cycle.target_weight_g,
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
  cycle: Cycle;
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
      action: { label: "ثبت آمار امروز", href: `/cycles/${x.cycle.id}?tab=daily` },
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
      action: { label: "ثبت گزارش دامپزشکی", href: `/cycles/${x.cycle.id}?tab=daily` },
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
      action: { label: "تحلیل تلفات", href: `/cycles/${x.cycle.id}?tab=daily` },
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
      action: { label: "برنامه رشد", href: `/cycles/${x.cycle.id}?tab=growth` },
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
      action: { label: "جزئیات خوراک", href: `/cycles/${x.cycle.id}?tab=feed` },
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
      action: { label: "ثبت خرید دان", href: `/cycles/${x.cycle.id}?tab=costs` },
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
      action: { label: "تحلیل هزینه", href: `/cycles/${x.cycle.id}?tab=costs` },
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
      action: { label: "ثبت وزن", href: `/cycles/${x.cycle.id}?tab=daily` },
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
      action: { label: "ثبت فروش", href: `/cycles/${x.cycle.id}?tab=sales` },
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
  cycle: Cycle;
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
      .map((a) => ({ ...a, cycleId: m.cycle.id, cycleName: m.cycle.name })),
  );
  const lostBirds = activeMetrics.reduce((s, m) => s + m.lostBirds, 0);
  const initialBirds = activeMetrics.reduce((s, m) => s + m.cycle.initial_count, 0);
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
