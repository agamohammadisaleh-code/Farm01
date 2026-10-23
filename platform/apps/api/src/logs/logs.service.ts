import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Cycle, DailyLog } from "@farm/domain";
import { DATABASE, type Database } from "../db/database";
import { cycles, dailyLogs, sales } from "../db/schema";
import { assertValid } from "../common/errors";
import { todayIso } from "../common/ids";
import { n } from "../common/parse";
import { toCycle, toLog } from "../common/mappers";
import type { SaveLogDto } from "./logs.dto";

@Injectable()
export class LogsService {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  private get db(): any {
    return this.database.db;
  }

  private async cycleOrThrow(farmId: string, cycleId: string): Promise<Cycle> {
    const rows = await this.db
      .select()
      .from(cycles)
      .where(and(eq(cycles.farmId, farmId), eq(cycles.id, cycleId), isNull(cycles.deletedAt)))
      .limit(1);
    if (!rows[0]) throw new NotFoundException("دوره یافت نشد.");
    return toCycle(rows[0]);
  }

  async list(farmId: string, cycleId: string): Promise<DailyLog[]> {
    await this.cycleOrThrow(farmId, cycleId);
    const rows = await this.db
      .select()
      .from(dailyLogs)
      .where(and(eq(dailyLogs.cycleId, cycleId), eq(dailyLogs.farmId, farmId), isNull(dailyLogs.deletedAt)))
      .orderBy(asc(dailyLogs.date));
    return rows.map(toLog);
  }

  /**
   * ثبت/به‌روزرسانی آمار یک روز (upsert).
   *
   * قاعده «یک رکورد در هر روز» با ایندکس یکتا و ON CONFLICT تضمین می‌شود؛
   * همین رفتار در نسخه SQLite هم اعمال شد و دلیلش این است که ثبت دوباره
   * نباید تلفات و مصرف دان را دو برابر کند.
   */
  async save(farmId: string, userId: string, cycleId: string, dto: SaveLogDto, timezone = "Asia/Tehran") {
    const cycle = await this.cycleOrThrow(farmId, cycleId);
    const today = todayIso(timezone);
    const errors: Record<string, string> = {};

    if (dto.date > today) errors.date = "ثبت تاریخ آینده مجاز نیست.";
    if (dto.date < cycle.placement_date) errors.date = "تاریخ پیش از جوجه‌ریزی دوره است.";
    if (cycle.closed_date && dto.date > cycle.closed_date) errors.date = "دوره بسته شده و ثبت تاریخ بعد از آن مجاز نیست.";

    const existing = await this.db
      .select()
      .from(dailyLogs)
      .where(and(eq(dailyLogs.cycleId, cycleId), eq(dailyLogs.date, dto.date)))
      .limit(1);

    const liveBefore = await this.liveBirdsAt(farmId, cycleId, dto.date);
    const lostNow = dto.mortality + (dto.culls ?? 0);
    if (lostNow > liveBefore) {
      errors.mortality = `تلفات و حذف از تعداد زنده (${liveBefore} قطعه) بیشتر است.`;
    }
    assertValid(errors, "ثبت انجام نشد؛ مقادیر را بررسی کنید.");

    const values = {
      farmId,
      cycleId,
      date: dto.date,
      mortality: dto.mortality,
      culls: dto.culls ?? 0,
      feedKg: String(dto.feedKg),
      waterL: String(dto.waterL ?? 0),
      tempC: dto.tempC != null ? String(dto.tempC) : null,
      avgWeightG: dto.avgWeightG ?? null,
      feedType: dto.feedType?.slice(0, 60) ?? null,
      notes: dto.notes?.slice(0, 500) ?? null,
      createdBy: userId,
    };

    if (existing[0]) {
      await this.db
        .update(dailyLogs)
        .set({ ...values, deletedAt: null, updatedAt: new Date() })
        .where(eq(dailyLogs.id, existing[0].id));
      const row = await this.db.select().from(dailyLogs).where(eq(dailyLogs.id, existing[0].id)).limit(1);
      return { ...toLog(row[0]), updated: true };
    }

    const id = dto.clientId && /^[0-9a-zA-Z_-]{8,64}$/.test(dto.clientId) ? dto.clientId : randomUUID();
    await this.db
      .insert(dailyLogs)
      .values({ id, ...values })
      .onConflictDoUpdate({
        target: [dailyLogs.cycleId, dailyLogs.date],
        set: { ...values, deletedAt: null, updatedAt: new Date() },
      });
    const row = await this.db.select().from(dailyLogs).where(eq(dailyLogs.id, id)).limit(1);
    return { ...toLog(row[0]), updated: false };
  }

  /** تعداد زنده در پایان یک روز مشخص (بر مبنای ثبت‌های همان روز و پیش از آن) */
  async liveBirdsAt(farmId: string, cycleId: string, date: string): Promise<number> {
    const cycle = await this.cycleOrThrow(farmId, cycleId);
    const logs = await this.db
      .select()
      .from(dailyLogs)
      .where(and(eq(dailyLogs.cycleId, cycleId), isNull(dailyLogs.deletedAt)));
    const sold = await this.db.select().from(sales).where(and(eq(sales.cycleId, cycleId), isNull(sales.deletedAt)));

    const lostBefore = logs
      .filter((l: any) => String(l.date).slice(0, 10) < date)
      .reduce((s: number, l: any) => s + n(l.mortality) + n(l.culls), 0);
    const soldBefore = sold
      .filter((s: any) => String(s.date).slice(0, 10) < date)
      .reduce((s: number, x: any) => s + n(x.count), 0);
    return Math.max(0, cycle.initial_count - lostBefore - soldBefore);
  }

  async remove(farmId: string, cycleId: string, id: string) {
    await this.cycleOrThrow(farmId, cycleId);
    const rows = await this.db
      .select()
      .from(dailyLogs)
      .where(and(eq(dailyLogs.id, id), eq(dailyLogs.cycleId, cycleId)))
      .limit(1);
    if (!rows[0]) throw new NotFoundException("ثبت روزانه یافت نشد.");
    await this.db.update(dailyLogs).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(dailyLogs.id, id));
    return { ok: true };
  }

  async latest(farmId: string, cycleId: string): Promise<DailyLog | null> {
    await this.cycleOrThrow(farmId, cycleId);
    const rows = await this.db
      .select()
      .from(dailyLogs)
      .where(and(eq(dailyLogs.cycleId, cycleId), isNull(dailyLogs.deletedAt)))
      .orderBy(desc(dailyLogs.date))
      .limit(1);
    return rows[0] ? toLog(rows[0]) : null;
  }
}
