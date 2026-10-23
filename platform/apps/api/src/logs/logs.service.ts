import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { DailyLog } from "@farm/domain";
import { DATABASE, type Database } from "../db/database";
import { dailyLogs, sales } from "../db/schema";
import { assertValid } from "../common/errors";
import { todayIso } from "../common/ids";
import { n } from "../common/parse";
import { toLog } from "../common/mappers";
import { FlockAccess } from "../common/flock-access";
import { InventoryService, POOL_FEED_TYPE } from "../inventory/inventory.service";
import type { SaveLogDto } from "./logs.dto";

@Injectable()
export class LogsService {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    private readonly access: FlockAccess,
    private readonly inventory: InventoryService,
  ) {}

  private get db(): any {
    return this.database.db;
  }

  async list(farmId: string, flockId: string): Promise<DailyLog[]> {
    await this.access.require(farmId, flockId);
    const rows = await this.db
      .select()
      .from(dailyLogs)
      .where(and(eq(dailyLogs.flockId, flockId), isNull(dailyLogs.deletedAt)))
      .orderBy(asc(dailyLogs.date));
    return rows.map(toLog);
  }

  /**
   * ثبت/به‌روزرسانی آمار یک روز (upsert) + کسر دان از انبار.
   *
   * قاعده «یک رکورد در هر روز» با ایندکس یکتا و ON CONFLICT تضمین می‌شود.
   * برای انبار، اختلاف مقدار قبلی و جدید کسر/برگردانده می‌شود تا ویرایش یک
   * ثبت، موجودی را دوبار کاهش ندهد.
   */
  async save(farmId: string, userId: string, flockId: string, dto: SaveLogDto, timezone = "Asia/Tehran") {
    const flock = await this.access.require(farmId, flockId);
    const today = todayIso(timezone);
    const errors: Record<string, string> = {};

    if (dto.date > today) errors.date = "ثبت تاریخ آینده مجاز نیست.";
    if (dto.date < flock.start_date) errors.date = "تاریخ پیش از جوجه‌ریزی گله است.";
    if (flock.closed_date && dto.date > flock.closed_date) errors.date = "گله بسته شده و ثبت تاریخ بعد از آن مجاز نیست.";

    const existing = await this.db
      .select()
      .from(dailyLogs)
      .where(and(eq(dailyLogs.flockId, flockId), eq(dailyLogs.date, dto.date)))
      .limit(1);

    const liveBefore = await this.liveBirdsAt(farmId, flockId, dto.date);
    const lostNow = dto.mortality + (dto.cull ?? 0);
    if (lostNow > liveBefore) {
      errors.mortality = `تلفات و حذف از تعداد زنده (${liveBefore} قطعه) بیشتر است.`;
    }
    assertValid(errors, "ثبت انجام نشد؛ مقادیر را بررسی کنید.");

    const values = {
      flockId,
      date: dto.date,
      mortality: dto.mortality,
      cull: dto.cull ?? 0,
      feedKg: String(dto.feedKg),
      waterLiter: String(dto.waterLiter ?? 0),
      avgTemp: dto.avgTemp != null ? String(dto.avgTemp) : null,
      feedType: dto.feedType?.trim().slice(0, 60) || null,
      notes: dto.notes?.slice(0, 500) ?? null,
      createdBy: userId,
    };

    const feedType = values.feedType ?? "دان (کل)";
    const previous = existing[0];

    await this.db.transaction(async (tx: any) => {
      if (previous) {
        await tx
          .update(dailyLogs)
          .set({ ...values, deletedAt: null, updatedAt: new Date() })
          .where(eq(dailyLogs.id, previous.id));
      } else {
        const id = dto.clientId && /^[0-9a-zA-Z_-]{8,64}$/.test(dto.clientId) ? dto.clientId : randomUUID();
        await tx
          .insert(dailyLogs)
          .values({ id, ...values })
          .onConflictDoUpdate({
            target: [dailyLogs.flockId, dailyLogs.date],
            set: { ...values, deletedAt: null, updatedAt: new Date() },
          });
      }

      // کسر مصرف از انبار: برگرداندن مقدار قبلی و کسر مقدار جدید
      if (previous && !previous.deletedAt) {
        await this.inventory.add(tx, farmId, previous.feedType ?? feedType, n(previous.feedKg));
      }
      await this.inventory.add(tx, farmId, feedType, -dto.feedKg);
    });

    const saved = await this.db
      .select()
      .from(dailyLogs)
      .where(and(eq(dailyLogs.flockId, flockId), eq(dailyLogs.date, dto.date)))
      .limit(1);

    return { ...toLog(saved[0]), updated: Boolean(previous) };
  }

  /** تعداد زنده در پایان یک روز (بر مبنای ثبت‌های پیش از آن روز و فروش‌ها) */
  async liveBirdsAt(farmId: string, flockId: string, date: string): Promise<number> {
    const flock = await this.access.require(farmId, flockId);
    const logs = await this.db
      .select()
      .from(dailyLogs)
      .where(and(eq(dailyLogs.flockId, flockId), isNull(dailyLogs.deletedAt)));
    const sold = await this.db.select().from(sales).where(and(eq(sales.flockId, flockId), isNull(sales.deletedAt)));

    const lostBefore = logs
      .filter((l: any) => String(l.date).slice(0, 10) < date)
      .reduce((s: number, l: any) => s + n(l.mortality) + n(l.cull), 0);
    const soldBefore = sold
      .filter((s: any) => String(s.date).slice(0, 10) < date)
      .reduce((s: number, x: any) => s + n(x.count, 0), 0);
    return Math.max(0, flock.initial_count - lostBefore - soldBefore);
  }

  async remove(farmId: string, flockId: string, id: string) {
    await this.access.require(farmId, flockId);
    const rows = await this.db
      .select()
      .from(dailyLogs)
      .where(and(eq(dailyLogs.id, id), eq(dailyLogs.flockId, flockId)))
      .limit(1);
    if (!rows[0]) throw new NotFoundException("ثبت روزانه یافت نشد.");

    await this.db.transaction(async (tx: any) => {
      await tx.update(dailyLogs).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(dailyLogs.id, id));
      // حذف ثبت، مصرف آن روز را به انبار برمی‌گرداند
      await this.inventory.add(tx, farmId, rows[0].feedType ?? POOL_FEED_TYPE, n(rows[0].feedKg));
    });
    return { ok: true };
  }

  async latest(farmId: string, flockId: string): Promise<DailyLog | null> {
    await this.access.require(farmId, flockId);
    const rows = await this.db
      .select()
      .from(dailyLogs)
      .where(and(eq(dailyLogs.flockId, flockId), isNull(dailyLogs.deletedAt)))
      .orderBy(desc(dailyLogs.date))
      .limit(1);
    return rows[0] ? toLog(rows[0]) : null;
  }
}
