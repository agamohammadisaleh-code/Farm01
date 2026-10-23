import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, asc, eq, isNull } from "drizzle-orm";
import { breedAt, breedWeightAt, expectedMortalityPct, resolveBreed, standardAt, type CycleMetrics } from "@farm/domain";
import { todayIso } from "../common/ids";
import { DATABASE, type Database } from "../db/database";
import { dailyLogs, feedInventory, weightSamples } from "../db/schema";
import { toLog, toWeightSample } from "../common/mappers";
import { n } from "../common/parse";
import { AnalyticsService } from "../analytics/analytics.service";
import { FarmsService } from "../farms/farms.service";

export interface AiStatus {
  enabled: boolean;
  available: boolean;
  url: string;
  latencyMs: number | null;
  models: string[];
  checkedAt: string;
}

export interface ForecastResult {
  source: "ai" | "local";
  fallback: boolean;
  flockId: string;
  /** نژادی که منحنی‌اش به کار رفت */
  breed: string;
  targetAgeDays: number;
  projectedWeightGr: number;
  targetWeightGr: number;
  confidence: number;
  method: string;
  notes: string[];
  curve: { ageDays: number; weightGr: number; source: string }[];
}

/**
 * دروازه سرویس هوش مصنوعی.
 *
 * قاعده اصلی: **API هرگز به سرویس پایتون وابسته نیست.** اگر سرویس در دسترس
 * نباشد، همان محاسبه با بسته دامنه انجام می‌شود و `source: "local"` برگردانده
 * می‌شود. دلیل: ثبت داده و گزارش نباید به یک سرویس جانبی گره بخورد، و کاربر
 * باید بداند عدد از مدل کدام سرویس آمده است.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly url: string;
  private readonly key: string;
  private readonly timeoutMs: number;

  constructor(
    @Inject(DATABASE) private readonly database: Database,
    private readonly analytics: AnalyticsService,
    private readonly farms: FarmsService,
    config: ConfigService,
  ) {
    this.url = (config.get<string>("AI_URL") ?? "http://127.0.0.1:8000").replace(/\/$/, "");
    this.key = config.get<string>("AI_API_KEY") ?? "";
    this.timeoutMs = Number(config.get<string>("AI_TIMEOUT_MS") ?? 2500);
  }

  private get db(): any {
    return this.database.db;
  }

  /* --------------------------------- ارتباط --------------------------------- */

  private async post<T>(path: string, body: unknown): Promise<T | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.url}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(this.key ? { "X-AI-Key": this.key } : {}) },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        this.logger.warn(`سرویس AI پاسخ ${res.status} داد (${path})`);
        return null;
      }
      return (await res.json()) as T;
    } catch (error) {
      this.logger.debug(`سرویس AI در دسترس نیست (${path}): ${error instanceof Error ? error.message : error}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async status(): Promise<AiStatus> {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(1500, this.timeoutMs));
    try {
      const res = await fetch(`${this.url}/health`, { signal: controller.signal });
      const body = (await res.json()) as { models?: string[] };
      return {
        enabled: true,
        available: res.ok,
        url: this.url,
        latencyMs: Date.now() - started,
        models: body.models ?? [],
        checkedAt: new Date().toISOString(),
      };
    } catch {
      return { enabled: true, available: false, url: this.url, latencyMs: null, models: [], checkedAt: new Date().toISOString() };
    } finally {
      clearTimeout(timer);
    }
  }

  /* -------------------------------- داده گله -------------------------------- */

  private async flockData(farmId: string, flockId: string) {
    const metrics = await this.analytics.flockMetrics(farmId, flockId);
    const [weightRows, logRows] = await Promise.all([
      this.db.select().from(weightSamples).where(and(eq(weightSamples.flockId, flockId), isNull(weightSamples.deletedAt))).orderBy(asc(weightSamples.date)),
      this.db.select().from(dailyLogs).where(and(eq(dailyLogs.flockId, flockId), isNull(dailyLogs.deletedAt))).orderBy(asc(dailyLogs.date)),
    ]);
    const weights = weightRows.map(toWeightSample);
    const logs = logRows.map(toLog);
    const ageOf = (date: string) =>
      Math.max(1, Math.round((Date.parse(date) - Date.parse(metrics.flock.start_date)) / 86400_000) + 1);
    return { metrics, weights, logs, ageOf };
  }

  /* ------------------------------- پیش‌بینی وزن ------------------------------- */

  async forecast(farmId: string, flockId: string): Promise<ForecastResult> {
    const { metrics, weights, ageOf } = await this.flockData(farmId, flockId);
    const payload = {
      flock_id: flockId,
      initial_count: metrics.flock.initial_count,
      weights: weights.map((w: any) => ({ age_days: ageOf(w.date), weight_gr: w.avg_weight_gr })),
      target_weight_gr: metrics.flock.target_weight_g,
      target_age_days: metrics.targetAge,
      breed: metrics.flock.breed,
    };

    const remote = await this.post<{
      projected_weight_gr: number;
      projected_daily_gain_gr: number;
      confidence: number;
      method: string;
      notes: string[];
      breed?: string;
      curve: { age_days: number; weight_gr: number; source: string }[];
    }>("/predict/weight", payload);

    if (remote) {
      return {
        source: "ai",
        fallback: false,
        flockId,
        breed: (remote as { breed?: string }).breed ?? resolveBreed(metrics.flock.breed).breed.nameFa,
        targetAgeDays: metrics.targetAge,
        projectedWeightGr: remote.projected_weight_gr,
        targetWeightGr: metrics.flock.target_weight_g,
        confidence: remote.confidence,
        method: remote.method,
        notes: remote.notes ?? [],
        curve: (remote.curve ?? []).map((p) => ({ ageDays: p.age_days, weightGr: p.weight_gr, source: p.source })),
      };
    }

    return this.localForecast(metrics);
  }

  /**
   * پیش‌بینی محلی: همان عددی که داشبورد نشان می‌دهد.
   * منحنی استاندارد + اصلاح با آخرین وزن اندازه‌گیری‌شده.
   */
  private localForecast(metrics: CycleMetrics): ForecastResult {
    // منحنی همان نژاد گله، نه همیشه راس؛ وگرنه گله کاب همیشه «عقب» دیده می‌شود
    const breed = resolveBreed(metrics.flock.breed);
    const curve: { ageDays: number; weightGr: number; source: string }[] = [];
    for (let day = 1; day <= metrics.targetAge; day++) {
      const std = breedWeightAt(breed.breed.nameFa, day);
      curve.push({ ageDays: day, weightGr: Math.round(std), source: "standard" });
    }
    if (metrics.measuredWeightG != null) {
      const day = Math.min(curve.length, metrics.ageDays);
      curve[day - 1] = { ageDays: day, weightGr: metrics.measuredWeightG, source: "measured" };
    }
    return {
      source: "local",
      fallback: true,
      flockId: metrics.flock.id,
      breed: breed.breed.nameFa,
      targetAgeDays: metrics.targetAge,
      projectedWeightGr: metrics.projection.projectedWeightG,
      targetWeightGr: metrics.flock.target_weight_g,
      confidence: metrics.weighCount >= 3 ? 0.6 : 0.35,
      method: "standard-curve+domain",
      notes: [
        `سرویس تحلیل در دسترس نبود؛ پیش‌بینی با منحنی ${breed.breed.nameFa} و شاخص‌های خود API محاسبه شد.`,
        breed.note,
      ],
      curve,
    };
  }

  /* ------------------------------- تاریخ بارگیری ------------------------------- */

  /**
   * تاریخ بهینه بارگیری.
   *
   * منطق: هر روز آینده «ارزش رشد» را با «هزینه دان آن روز» و «هزینه فرصت
   * تلفات» مقایسه می‌کنیم؛ اولین روزی که خالص منفی شد، روز بارگیری است.
   * جدول تصمیم (`breakdown`) هم برگردانده می‌شود تا عدد قابل توضیح باشد.
   */
  async loadingDate(farmId: string, flockId: string) {
    const { metrics } = await this.flockData(farmId, flockId);
    const breed = resolveBreed(metrics.flock.breed);
    const remote = await this.post<{
      optimal_age_days: number;
      days_from_now: number;
      expected_weight_gr: number;
      expected_live_biomass_kg: number | null;
      expected_revenue: number | null;
      reason: string;
      confidence: number;
      breed?: string;
      economics?: Record<string, unknown>;
      breakdown?: {
        age_days: number;
        days_from_now: number;
        weight_gr: number;
        daily_gain_gr: number;
        marginal_fcr: number;
        feed_kg: number;
        revenue_rial?: number;
        feed_cost_rial?: number;
        mortality_cost_rial?: number;
        net_rial?: number;
        cumulative_rial?: number;
        profitable?: boolean;
      }[];
    }>("/predict/loading-date", {
      flock_id: flockId,
      breed: metrics.flock.breed,
      current_age_days: metrics.ageDays,
      current_weight_gr: metrics.currentWeightG,
      daily_gain_gr: metrics.dailyGainG,
      target_weight_gr: metrics.flock.target_weight_g,
      mortality_pct: metrics.mortalityPct,
      daily_mortality_pct: metrics.dailyMortalityPct,
      live_birds: metrics.liveBirds,
      market_price_per_kg: metrics.marketPrice,
      projected_feed_price: metrics.avgFeedUnitCost || null,
    });

    if (remote) {
      return {
        source: "ai" as const,
        fallback: false,
        flockId,
        breed: remote.breed ?? breed.breed.nameFa,
        optimalAgeDays: remote.optimal_age_days,
        daysFromNow: remote.days_from_now,
        expectedWeightGr: remote.expected_weight_gr,
        expectedLiveBiomassKg: remote.expected_live_biomass_kg,
        expectedRevenue: remote.expected_revenue,
        reason: remote.reason,
        confidence: remote.confidence,
        economics: remote.economics ?? {},
        breakdown: (remote.breakdown ?? []).map((row) => ({
          ageDays: row.age_days,
          daysFromNow: row.days_from_now,
          weightGr: row.weight_gr,
          dailyGainGr: row.daily_gain_gr,
          marginalFcr: row.marginal_fcr,
          feedKg: row.feed_kg,
          revenueRial: row.revenue_rial ?? null,
          feedCostRial: row.feed_cost_rial ?? null,
          mortalityCostRial: row.mortality_cost_rial ?? null,
          netRial: row.net_rial ?? null,
          cumulativeRial: row.cumulative_rial ?? null,
          profitable: row.profitable ?? null,
        })),
        expectedDate: addDays(todayIso(), remote.days_from_now),
      };
    }

    return this.localLoadingPlan(metrics, breed);
  }

  /** برنامه بارگیری محلی — همان منطق، بدون سرویس پایتون */
  private localLoadingPlan(metrics: CycleMetrics, breed: ReturnType<typeof resolveBreed>) {
    const price = metrics.marketPrice;
    const feedPrice = metrics.avgFeedUnitCost || 0;
    const hasPrices = price > 0 && feedPrice > 0;
    const horizon = 28;
    const gain = Math.max(1, metrics.dailyGainG);

    const rows = [];
    let cumulative = 0;
    for (let offset = 0; offset <= horizon; offset++) {
      const age = metrics.ageDays + offset;
      const weight = metrics.currentWeightG + gain * offset;
      const gainDay = offset === 0 ? 0 : gain;
      const std = breedAt(breed.breed.nameFa, age);
      const feedKg = std.dailyFeedG / 1000;
      let netRial: number | null = null;
      let cumulativeRial: number | null = null;
      let revenueRial: number | null = null;
      let feedCostRial: number | null = null;
      let mortalityCostRial: number | null = null;
      if (hasPrices) {
        // همه اعداد برای کل گله‌اند؛ درآمد و هزینه دان هم باید در تعداد زنده
        // ضرب شوند، وگرنه هزینه تلفات در برابر درآمدِ یک پرنده دیده می‌شود.
        const birds = Math.max(1, metrics.liveBirds);
        revenueRial = Math.round((gainDay / 1000) * price * birds);
        feedCostRial = Math.round(feedKg * feedPrice * birds);
        mortalityCostRial = Math.round(birds * (metrics.dailyMortalityPct / 100) * (weight / 1000) * price);
        netRial = revenueRial - feedCostRial - mortalityCostRial;
        cumulative += netRial;
        cumulativeRial = Math.round(cumulative);
      }
      rows.push({
        ageDays: age,
        daysFromNow: offset,
        weightGr: Math.round(weight),
        dailyGainGr: Math.round(gainDay),
        marginalFcr: Number((feedKg * 1000 / Math.max(1, gainDay)).toFixed(2)),
        feedKg: Number(feedKg.toFixed(3)),
        revenueRial,
        feedCostRial,
        mortalityCostRial,
        netRial,
        cumulativeRial,
        profitable: netRial === null ? null : netRial > 0,
      });
    }

    let days: number;
    let reason: string;
    if (hasPrices) {
      const stop = rows.find((r, i) => i > 0 && r.netRial !== null && r.netRial <= 0);
      const capByWeight = rows.find((r) => r.weightGr >= metrics.flock.target_weight_g * 1.15)?.daysFromNow ?? horizon;
      days = Math.min(stop?.daysFromNow ?? capByWeight, capByWeight);
      reason = stop
        ? `تا روز ${metrics.ageDays + days} ارزش رشد روزانه از هزینه دان بیشتر است؛ از فردای آن روز هزینه دان از ارزش رشد پیشی می‌گیرد.`
        : `در افق ${horizon} روزه هنوز رشد سودآور است؛ سقف منطقی وزن (۱٫۱۵ برابر وزن هدف) مبنای توقف قرار گرفت.`;
    } else {
      days = Math.min(horizon, Math.max(0, Math.ceil(Math.max(0, metrics.flock.target_weight_g - metrics.currentWeightG) / gain)));
      reason = `تا رسیدن به وزن هدف ${metrics.flock.target_weight_g} گرم (قیمت بازار یا دان ثبت نشده).`;
    }

    const optimal = rows.find((r) => r.daysFromNow === days) ?? rows[rows.length - 1];
    return {
      source: "local" as const,
      fallback: true,
      flockId: metrics.flock.id,
      breed: breed.breed.nameFa,
      optimalAgeDays: metrics.ageDays + days,
      daysFromNow: days,
      expectedWeightGr: optimal.weightGr,
      expectedLiveBiomassKg: Number(((metrics.liveBirds * optimal.weightGr) / 1000).toFixed(1)),
      expectedRevenue: hasPrices ? Math.round(((metrics.liveBirds * optimal.weightGr) / 1000) * price) : null,
      reason: `${reason} (سرویس تحلیل در دسترس نبود؛ محاسبه محلی با منحنی ${breed.breed.nameFa}.)`,
      confidence: metrics.weighCount >= 3 ? 0.6 : 0.35,
      economics: {
        dailyGainGr: optimal.dailyGainGr,
        marginalFcr: optimal.marginalFcr,
        feedCostRial: optimal.feedCostRial,
        revenueRial: optimal.revenueRial,
        mortalityCostRial: optimal.mortalityCostRial,
        netRial: optimal.netRial,
      },
      breakdown: rows,
      expectedDate: addDays(todayIso(), days),
    };
  }

  /* -------------------------------- ریسک بیماری -------------------------------- */

  /**
   * هشدار زودهنگام بیماری از روند آب، دان، تلفات و دما.
   *
   * آستانه‌های مزرعه (افت آب و تلفات روزانه) به سرویس پایتون پاس می‌شوند تا
   * همان قاعده‌ای که در داشبورد اجرا می‌شود، این‌جا هم همان عدد را بدهد.
   * در حالت محلی، هشدارهای موتور شاخص‌ها (که خودشان از همین قواعد می‌آیند)
   * به عوامل ریسک تبدیل می‌شوند.
   */
  async risk(farmId: string, flockId: string) {
    const { metrics, logs, ageOf } = await this.flockData(farmId, flockId);
    const settings = await this.farms.settings(farmId);
    const waterDropAlertPct = settings.water_drop_alert_pct ?? 10;
    const dailyMortalityAlertPct = settings.daily_mortality_alert_pct ?? 0.5;

    const recent = logs.slice(-14);
    const payloadDaily = recent.map((l: any) => ({
      age_days: ageOf(l.date),
      mortality: l.mortality,
      cull: l.cull,
      feed_kg: l.feed_kg,
      water_liter: l.water_liter,
      avg_temp: l.avg_temp,
    }));

    const remote = await this.post<{
      risk_score: number;
      level: string;
      factors: { key: string; title: string; severity: string; detail: string; score: number }[];
      recommendation: string;
      breed?: string;
      trends?: Record<string, { slope_per_day: number; change_pct: number; direction: string; samples: number }>;
      water_drop_pct?: number;
      daily_mortality_pct?: number;
    }>("/alerts/disease", {
      flock_id: flockId,
      breed: metrics.flock.breed,
      age_days: metrics.ageDays,
      initial_count: metrics.flock.initial_count,
      expected_mortality_pct: expectedMortalityPct(metrics.ageDays),
      water_drop_alert_pct: waterDropAlertPct,
      daily_mortality_alert_pct: dailyMortalityAlertPct,
      daily: payloadDaily,
    });

    if (remote) {
      return {
        source: "ai" as const,
        fallback: false,
        flockId,
        breed: remote.breed ?? resolveBreed(metrics.flock.breed).breed.nameFa,
        riskScore: remote.risk_score,
        level: remote.level,
        factors: remote.factors,
        recommendation: remote.recommendation,
        trends: this.mapTrends(remote.trends),
        waterDropPct: remote.water_drop_pct ?? null,
        dailyMortalityPct: remote.daily_mortality_pct ?? metrics.dailyMortalityPct,
        thresholds: { waterDropAlertPct, dailyMortalityAlertPct },
      };
    }

    return this.localRisk(metrics, logs, waterDropAlertPct, dailyMortalityAlertPct);
  }

  private mapTrends(
    trends?: Record<string, { slope_per_day: number; change_pct: number; direction: string; samples: number }>,
  ) {
    if (!trends) return { water: null, feed: null, mortality: null };
    const one = (t?: { slope_per_day: number; change_pct: number; direction: string; samples: number }) =>
      t ? { slopePerDay: t.slope_per_day, changePct: t.change_pct, direction: t.direction, samples: t.samples } : null;
    return { water: one(trends.water), feed: one(trends.feed), mortality: one(trends.mortality) };
  }

  /** تحلیل محلی ریسک: تبدیل هشدارهای موتور شاخص‌ها به عوامل قابل‌نمایش */
  private localRisk(metrics: CycleMetrics, logs: any[], waterDropAlertPct: number, dailyMortalityAlertPct: number) {
    const factors: { key: string; title: string; severity: string; detail: string; score: number }[] = [];

    for (const alert of metrics.alerts) {
      if (alert.severity === "info") continue;
      factors.push({
        key: alert.id,
        title: alert.title,
        severity: alert.severity,
        detail: alert.detail,
        score: alert.severity === "critical" ? 0.75 : 0.45,
      });
    }

    const ratios = logs
      .slice(-5)
      .filter((l: any) => l.feed_kg > 0 && l.water_liter > 0)
      .map((l: any) => l.water_liter / l.feed_kg);
    if (ratios.length) {
      const avg = ratios.reduce((a: number, b: number) => a + b, 0) / ratios.length;
      if (avg > 2.4) {
        factors.push({
          key: "water-feed-ratio",
          title: "نسبت آب به دان بالاست",
          severity: "warning",
          detail: `میانگین ${avg.toFixed(2)} لیتر بر کیلوگرم؛ نشانه احتمالی بیماری یا گرمای سالن.`,
          score: Math.min(1, (avg - 2.4) / 1.2),
        });
      }
    }

    const weights: Record<string, number> = { critical: 1, warning: 0.6, info: 0.3 };
    const denom = factors.reduce((s, f) => s + (weights[f.severity] ?? 0.5), 0);
    const raw = denom ? factors.reduce((s, f) => s + f.score * (weights[f.severity] ?? 0.5), 0) / denom : 0;
    const score = factors.length ? Math.min(1, raw * (1 + 0.12 * (factors.length - 1))) : 0.05;

    const series = (key: "water_liter" | "feed_kg" | "mortality") => logs.slice(-7).map((l: any) => Number(l[key] ?? 0));
    const trend = (values: number[]) => {
      if (values.length < 2) return null;
      const n = values.length;
      const meanX = (n - 1) / 2;
      const meanY = values.reduce((a, b) => a + b, 0) / n;
      const denomX = values.reduce((sum, _, i) => sum + (i - meanX) ** 2, 0) || 1;
      const slope = values.reduce((sum, v, i) => sum + (i - meanX) * (v - meanY), 0) / denomX;
      const changePct = values[0] ? Number((((values[n - 1] - values[0]) / values[0]) * 100).toFixed(1)) : 0;
      return {
        slopePerDay: Number(slope.toFixed(2)),
        changePct,
        direction: changePct > 3 ? "up" : changePct < -3 ? "down" : "flat",
        samples: n,
      };
    };

    return {
      source: "local" as const,
      fallback: true,
      flockId: metrics.flock.id,
      breed: resolveBreed(metrics.flock.breed).breed.nameFa,
      riskScore: Number(score.toFixed(2)),
      level: score >= 0.65 ? "high" : score >= 0.35 ? "medium" : "low",
      factors,
      recommendation:
        score >= 0.65
          ? "ریسک بالا: با دامپزشک تماس بگیرید و کیفیت آب و تهویه را بررسی کنید."
          : score >= 0.35
            ? "ریسک متوسط: روند تلفات و مصرف آب/دان را روزانه پایش کنید."
            : "پایش روزانه تلفات، مصرف آب و دما ادامه یابد.",
      trends: {
        water: trend(series("water_liter")),
        feed: trend(series("feed_kg")),
        mortality: trend(series("mortality")),
      },
      waterDropPct: metrics.waterChangePct,
      dailyMortalityPct: metrics.dailyMortalityPct,
      thresholds: { waterDropAlertPct, dailyMortalityAlertPct },
    };
  }

  /* --------------------------------- مصرف دان --------------------------------- */

  async feedForecast(farmId: string, timezone = "Asia/Tehran") {
    const today = todayIso(timezone);
    const since = addDays(today, -6);
    const rows = await this.db
      .select({ date: dailyLogs.date, feedKg: dailyLogs.feedKg, flockId: dailyLogs.flockId })
      .from(dailyLogs)
      .where(isNull(dailyLogs.deletedAt));

    const dailyMap = new Map<string, number>();
    for (const row of rows) {
      const date = String(row.date).slice(0, 10);
      if (date < since) continue;
      dailyMap.set(date, (dailyMap.get(date) ?? 0) + n(row.feedKg));
    }
    const series = [...dailyMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
    const recentAvg = series.length ? series.reduce((a, b) => a + b, 0) / series.length : 0;

    const stock = await this.db.select().from(feedInventory).where(eq(feedInventory.farmId, farmId));
    const stockKg = stock.reduce((sum: number, r: any) => sum + n(r.quantityKg), 0);

    const remote = await this.post<{
      next_7_days_kg: number;
      days_of_stock: number | null;
      runs_out: boolean;
    }>("/forecast/feed", {
      current_age_days: 1,
      target_age_days: 42,
      recent_daily_feed_kg: series,
      live_birds: 1,
      stock_kg: stockKg,
    });

    if (remote) {
      return {
        source: "ai" as const,
        fallback: false,
        next7DaysKg: remote.next_7_days_kg,
        daysOfStock: remote.days_of_stock,
        runsOut: remote.runs_out,
        stockKg,
      };
    }

    const dailyBurn = recentAvg || 0;
    const days = dailyBurn > 0 ? stockKg / dailyBurn : null;
    return {
      source: "local" as const,
      fallback: true,
      next7DaysKg: Math.round(dailyBurn * 7 * 1.05),
      daysOfStock: days == null ? null : Number(days.toFixed(1)),
      runsOut: days != null && days < 7,
      stockKg,
    };
  }
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
