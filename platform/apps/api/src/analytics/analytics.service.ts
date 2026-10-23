import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, eq, isNull } from "drizzle-orm";
import { aggregateOverview, computeMetrics, type CycleMetrics } from "@farm/domain";
import { DATABASE, type Database } from "../db/database";
import { dailyLogs, expenses, farmSettings, flocks, sales, weightSamples } from "../db/schema";
import { toExpense, toFlock, toLog, toSale, toWeightSample } from "../common/mappers";
import { todayIso } from "../common/ids";
import { HealthService } from "../health/health.service";

/**
 * تحلیل و شاخص‌ها.
 *
 * تمام محاسبات در بسته `@farm/domain` انجام می‌شود — همان کدی که وب و موبایل
 * مصرف می‌کنند. این لایه فقط داده را می‌خواند و به موتور می‌دهد.
 */
@Injectable()
export class AnalyticsService {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    private readonly health: HealthService,
  ) {}

  private get db(): any {
    return this.database.db;
  }

  private async settingsOf(farmId: string) {
    const rows = await this.db.select().from(farmSettings).where(eq(farmSettings.farmId, farmId)).limit(1);
    const row = rows[0];
    return {
      marketPrice: Number(row?.marketPrice ?? 98000),
      feedPrice: Number(row?.feedPrice ?? 33500),
      timezone: row?.timezone ?? "Asia/Tehran",
      dailyMortalityAlertPct: Number(row?.dailyMortalityAlertPct ?? 0.5),
      waterDropAlertPct: Number(row?.waterDropAlertPct ?? 10),
    };
  }

  private async metricsFor(
    flockRow: any,
    settings: {
      marketPrice: number;
      feedPrice: number;
      timezone: string;
      dailyMortalityAlertPct: number;
      waterDropAlertPct: number;
    },
  ): Promise<CycleMetrics> {
    const flock = toFlock(flockRow);
    const [logRows, costRows, saleRows, weightRows] = await Promise.all([
      this.db.select().from(dailyLogs).where(and(eq(dailyLogs.flockId, flock.id), isNull(dailyLogs.deletedAt))).orderBy(asc(dailyLogs.date)),
      this.db.select().from(expenses).where(and(eq(expenses.flockId, flock.id), isNull(expenses.deletedAt))).orderBy(asc(expenses.date)),
      this.db.select().from(sales).where(and(eq(sales.flockId, flock.id), isNull(sales.deletedAt))).orderBy(asc(sales.date)),
      this.db.select().from(weightSamples).where(and(eq(weightSamples.flockId, flock.id), isNull(weightSamples.deletedAt))).orderBy(asc(weightSamples.date)),
    ]);

    return computeMetrics(
      flock,
      logRows.map(toLog),
      costRows.map(toExpense),
      saleRows.map(toSale),
      {
        today: todayIso(settings.timezone),
        marketPrice: settings.marketPrice,
        feedPrice: settings.feedPrice,
        dailyMortalityAlertPct: settings.dailyMortalityAlertPct,
        waterDropAlertPct: settings.waterDropAlertPct,
      },
      weightRows.map(toWeightSample),
    );
  }

  async flockMetrics(farmId: string, flockId: string) {
    const rows = await this.db
      .select()
      .from(flocks)
      .where(and(eq(flocks.farmId, farmId), eq(flocks.id, flockId), isNull(flocks.deletedAt)))
      .limit(1);
    if (!rows[0]) throw new NotFoundException("گله یافت نشد.");
    const settings = await this.settingsOf(farmId);
    const metrics = await this.metricsFor(rows[0], settings);
    const health = await this.health.summary(farmId, flockId, settings.timezone);
    return { ...metrics, health };
  }

  async overview(farmId: string) {
    const settings = await this.settingsOf(farmId);
    const rows = await this.db
      .select()
      .from(flocks)
      .where(and(eq(flocks.farmId, farmId), isNull(flocks.deletedAt)));

    const metrics = await Promise.all(rows.map((r: any) => this.metricsFor(r, settings)));
    const active = metrics.filter((m) => m.flock.status === "active");
    const closed = metrics.filter((m) => m.flock.status === "closed");

    const healthIssues = await Promise.all(
      active.map(async (m) => {
        const s = await this.health.summary(farmId, m.flock.id, settings.timezone);
        return { flockId: m.flock.id, flockName: m.flock.name, overdue: s.overdue.length, withdrawal: s.activeWithdrawal.length };
      }),
    );

    return {
      ...aggregateOverview(active, closed),
      health: healthIssues.filter((h) => h.overdue > 0 || h.withdrawal > 0),
      generatedAt: new Date().toISOString(),
    };
  }
}
