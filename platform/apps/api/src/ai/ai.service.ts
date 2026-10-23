import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, asc, eq, isNull } from "drizzle-orm";
import { expectedMortalityPct, standardAt, type CycleMetrics } from "@farm/domain";
import { todayIso } from "../common/ids";
import { DATABASE, type Database } from "../db/database";
import { dailyLogs, feedInventory, weightSamples } from "../db/schema";
import { toLog, toWeightSample } from "../common/mappers";
import { n } from "../common/parse";
import { AnalyticsService } from "../analytics/analytics.service";

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
      curve: { age_days: number; weight_gr: number; source: string }[];
    }>("/predict/weight", payload);

    if (remote) {
      return {
        source: "ai",
        fallback: false,
        flockId,
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
    const curve: { ageDays: number; weightGr: number; source: string }[] = [];
    for (let day = 1; day <= metrics.targetAge; day++) {
      const std = standardAt(day).weightG;
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
      targetAgeDays: metrics.targetAge,
      projectedWeightGr: metrics.projection.projectedWeightG,
      targetWeightGr: metrics.flock.target_weight_g,
      confidence: metrics.weighCount >= 3 ? 0.6 : 0.35,
      method: "standard-curve+domain",
      notes: [
        "سرویس تحلیل در دسترس نبود؛ پیش‌بینی با منحنی استاندارد و شاخص‌های خود API محاسبه شد.",
      ],
      curve,
    };
  }

  /* ------------------------------- تاریخ بارگیری ------------------------------- */

  async loadingDate(farmId: string, flockId: string) {
    const { metrics } = await this.flockData(farmId, flockId);
    const remote = await this.post<{
      optimal_age_days: number;
      days_from_now: number;
      expected_weight_gr: number;
      reason: string;
      confidence: number;
    }>("/predict/loading-date", {
      flock_id: flockId,
      current_age_days: metrics.ageDays,
      current_weight_gr: metrics.currentWeightG,
      daily_gain_gr: metrics.dailyGainG,
      target_weight_gr: metrics.flock.target_weight_g,
      mortality_pct: metrics.mortalityPct,
      market_price_per_kg: metrics.marketPrice,
      projected_feed_price: metrics.avgFeedUnitCost || null,
    });

    if (remote) {
      return {
        source: "ai" as const,
        fallback: false,
        flockId,
        optimalAgeDays: remote.optimal_age_days,
        daysFromNow: remote.days_from_now,
        expectedWeightGr: remote.expected_weight_gr,
        reason: remote.reason,
        confidence: remote.confidence,
        expectedDate: addDays(todayIso(), remote.days_from_now),
      };
    }

    const remaining = Math.max(0, metrics.flock.target_weight_g - metrics.currentWeightG);
    const gain = Math.max(1, metrics.dailyGainG);
    const days = Math.ceil(remaining / gain);
    return {
      source: "local" as const,
      fallback: true,
      flockId,
      optimalAgeDays: metrics.ageDays + days,
      daysFromNow: days,
      expectedWeightGr: Math.round(metrics.currentWeightG + gain * days),
      reason: "برآورد خطی بر پایه رشد روزانه فعلی (سرویس تحلیل در دسترس نبود).",
      confidence: metrics.weighCount >= 3 ? 0.55 : 0.3,
      expectedDate: addDays(todayIso(), days),
    };
  }

  /* -------------------------------- ریسک بیماری -------------------------------- */

  async risk(farmId: string, flockId: string) {
    const { metrics, logs, ageOf } = await this.flockData(farmId, flockId);
    const recent = logs.slice(-14);
    const remote = await this.post<{
      risk_score: number;
      level: string;
      factors: { key: string; title: string; severity: string; detail: string; score: number }[];
      recommendation: string;
    }>("/alerts/disease", {
      flock_id: flockId,
      age_days: metrics.ageDays,
      initial_count: metrics.flock.initial_count,
      expected_mortality_pct: expectedMortalityPct(metrics.ageDays),
      daily: recent.map((l: any) => ({
        age_days: ageOf(l.date),
        mortality: l.mortality,
        cull: l.cull,
        feed_kg: l.feed_kg,
        water_liter: l.water_liter,
        avg_temp: l.avg_temp,
      })),
    });

    if (remote) {
      return {
        source: "ai" as const,
        fallback: false,
        flockId,
        riskScore: remote.risk_score,
        level: remote.level,
        factors: remote.factors,
        recommendation: remote.recommendation,
      };
    }

    /* تحلیل محلی: همان دو قاعده اصلی، بدون سرویس بیرونی */
    const factors: { key: string; title: string; severity: string; detail: string; score: number }[] = [];
    const std = expectedMortalityPct(metrics.ageDays);
    if (metrics.mortalityPct > std + 0.5) {
      factors.push({
        key: "mortality-cumulative",
        title: "تلفات تجمعی بالاتر از استاندارد",
        severity: metrics.mortalityPct > std * 1.5 ? "critical" : "warning",
        detail: `تلفات تجمعی ${metrics.mortalityPct.toFixed(2)}٪ در برابر استاندارد ${std.toFixed(2)}٪.`,
        score: Math.min(1, (metrics.mortalityPct - std) / Math.max(1, std)),
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
    const score = factors.length ? Math.min(1, factors.reduce((s, f) => s + f.score, 0) / factors.length) : 0.05;
    return {
      source: "local" as const,
      fallback: true,
      flockId,
      riskScore: Number(score.toFixed(2)),
      level: score >= 0.65 ? "high" : score >= 0.35 ? "medium" : "low",
      factors,
      recommendation:
        score >= 0.65
          ? "ریسک بالا: با دامپزشک تماس بگیرید و کیفیت آب و تهویه را بررسی کنید."
          : "پایش روزانه تلفات، مصرف آب و دما ادامه یابد.",
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
