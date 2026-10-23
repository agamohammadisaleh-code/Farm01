import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, eq, isNull } from "drizzle-orm";
import { aggregateOverview, computeMetrics, type CycleMetrics } from "@farm/domain";
import { DATABASE, type Database } from "../db/database";
import { costs, cycles, dailyLogs, farmSettings, sales } from "../db/schema";
import { toCost, toCycle, toLog, toSale } from "../common/mappers";
import { todayIso } from "../common/ids";

/**
 * تحلیل و شاخص‌ها.
 *
 * تمام محاسبات در بسته `@farm/domain` انجام می‌شود — همان کدی که وب و موبایل
 * مصرف می‌کنند. این لایه فقط داده را می‌خواند و به موتور می‌دهد.
 */
@Injectable()
export class AnalyticsService {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

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
    };
  }

  private async metricsFor(farmId: string, cycleRow: any, settings: { marketPrice: number; feedPrice: number; timezone: string }): Promise<CycleMetrics> {
    const cycle = toCycle(cycleRow);
    const [logRows, costRows, saleRows] = await Promise.all([
      this.db.select().from(dailyLogs).where(and(eq(dailyLogs.cycleId, cycle.id), isNull(dailyLogs.deletedAt))).orderBy(asc(dailyLogs.date)),
      this.db.select().from(costs).where(and(eq(costs.cycleId, cycle.id), isNull(costs.deletedAt))).orderBy(asc(costs.date)),
      this.db.select().from(sales).where(and(eq(sales.cycleId, cycle.id), isNull(sales.deletedAt))).orderBy(asc(sales.date)),
    ]);

    return computeMetrics(cycle, logRows.map(toLog), costRows.map(toCost), saleRows.map(toSale), {
      today: todayIso(settings.timezone),
      marketPrice: settings.marketPrice,
      feedPrice: settings.feedPrice,
    });
  }

  async cycleMetrics(farmId: string, cycleId: string) {
    const rows = await this.db
      .select()
      .from(cycles)
      .where(and(eq(cycles.farmId, farmId), eq(cycles.id, cycleId), isNull(cycles.deletedAt)))
      .limit(1);
    if (!rows[0]) throw new NotFoundException("دوره یافت نشد.");
    const settings = await this.settingsOf(farmId);
    return this.metricsFor(farmId, rows[0], settings);
  }

  async overview(farmId: string) {
    const settings = await this.settingsOf(farmId);
    const rows = await this.db
      .select()
      .from(cycles)
      .where(and(eq(cycles.farmId, farmId), isNull(cycles.deletedAt)));

    const metrics = await Promise.all(rows.map((r: any) => this.metricsFor(farmId, r, settings)));
    const active = metrics.filter((m) => m.cycle.status === "active");
    const closed = metrics.filter((m) => m.cycle.status === "closed");
    return { ...aggregateOverview(active, closed), generatedAt: new Date().toISOString() };
  }
}
