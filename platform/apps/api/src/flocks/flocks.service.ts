import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Flock } from "@farm/domain";
import { DATABASE, type Database } from "../db/database";
import { dailyLogs, expenses, flocks, halls, sales, weightSamples } from "../db/schema";
import { assertValid } from "../common/errors";
import { todayIso } from "../common/ids";
import { money, n } from "../common/parse";
import { toFlock } from "../common/mappers";
import type { CloseFlockDto, CreateFlockDto, UpdateFlockDto } from "./flocks.dto";
import { AnalyticsService } from "../analytics/analytics.service";

@Injectable()
export class FlocksService {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    private readonly analytics: AnalyticsService,
  ) {}

  private get db(): any {
    return this.database.db;
  }

  async list(farmId: string): Promise<(Flock & { hall_name: string })[]> {
    const rows = await this.db
      .select({ flock: flocks, hallName: halls.name })
      .from(flocks)
      .innerJoin(halls, eq(halls.id, flocks.hallId))
      .where(and(eq(flocks.farmId, farmId), isNull(flocks.deletedAt)))
      .orderBy(asc(flocks.status), desc(flocks.startDate));
    return rows.map((r: any) => ({ ...toFlock(r.flock), hall_name: r.hallName }));
  }

  async get(farmId: string, id: string): Promise<Flock> {
    const rows = await this.db
      .select()
      .from(flocks)
      .where(and(eq(flocks.farmId, farmId), eq(flocks.id, id), isNull(flocks.deletedAt)))
      .limit(1);
    if (!rows[0]) throw new NotFoundException("گله یافت نشد.");
    return toFlock(rows[0]);
  }

  /** سالن باید متعلق به همین مزرعه باشد و ظرفیتش کافی باشد */
  private async resolveHall(farmId: string, hallId: string, initialCount?: number) {
    const rows = await this.db
      .select()
      .from(halls)
      .where(and(eq(halls.farmId, farmId), eq(halls.id, hallId), isNull(halls.deletedAt)))
      .limit(1);
    const hall = rows[0];
    if (!hall) throw new NotFoundException("سالن یافت نشد.");
    const errors: Record<string, string> = {};
    if (initialCount !== undefined && hall.capacity > 0 && initialCount > hall.capacity) {
      errors.initialCount = `ظرفیت سالن «${hall.name}» حداکثر ${hall.capacity} قطعه است.`;
    }
    assertValid(errors);
    return hall;
  }

  async create(farmId: string, userId: string, dto: CreateFlockDto, timezone = "Asia/Tehran"): Promise<Flock> {
    await this.resolveHall(farmId, dto.hallId, dto.initialCount);
    const errors: Record<string, string> = {};
    const today = todayIso(timezone);
    if (dto.startDate > today) errors.startDate = "تاریخ جوجه‌ریزی نمی‌تواند در آینده باشد.";
    if (!dto.name?.trim() && !dto.startDate) errors.name = "نام گله را وارد کنید.";
    assertValid(errors, "گله ایجاد نشد.");

    const id = dto.clientId && /^[0-9a-zA-Z_-]{8,64}$/.test(dto.clientId) ? dto.clientId : randomUUID();
    const dup = await this.db.select().from(flocks).where(eq(flocks.id, id)).limit(1);
    if (dup[0]) return toFlock(dup[0]); // همگام‌سازی تکراری از کلاینت آفلاین

    const hallRows = await this.db.select().from(halls).where(eq(halls.id, dto.hallId)).limit(1);
    const hallName = hallRows[0]?.name ?? "سالن";

    await this.db.transaction(async (tx: any) => {
      await tx.insert(flocks).values({
        id,
        farmId,
        hallId: dto.hallId,
        // اگر نامی داده نشده باشد، از سالن و تاریخ ساخته می‌شود
        name: (dto.name?.trim() || `گله ${hallName} — ${dto.startDate}`).slice(0, 80),
        breed: (dto.breed ?? "راس ۳۰۸").trim().slice(0, 60),
        startDate: dto.startDate,
        initialCount: dto.initialCount,
        chickPrice: String(dto.chickPrice ?? 0),
        targetWeightG: dto.targetWeightG ?? 2500,
        targetAgeDays: dto.targetAgeDays ?? 42,
        createdBy: userId,
      });
      if ((dto.chickPrice ?? 0) > 0) {
        await tx.insert(expenses).values({
          id: randomUUID(),
          flockId: id,
          date: dto.startDate,
          category: "chick",
          description: "خرید جوجه یک‌روزه",
          amount: String(Math.round(dto.initialCount * (dto.chickPrice ?? 0))),
          quantity: String(dto.initialCount),
          unit: "قطعه",
          createdBy: userId,
        });
      }
    });

    return this.get(farmId, id);
  }

  async update(farmId: string, id: string, dto: UpdateFlockDto, timezone = "Asia/Tehran"): Promise<Flock> {
    await this.get(farmId, id);
    if (dto.hallId) await this.resolveHall(farmId, dto.hallId, dto.initialCount);

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (dto.hallId !== undefined) patch.hallId = dto.hallId;
    if (dto.name !== undefined) patch.name = dto.name.trim().slice(0, 80);
    if (dto.breed !== undefined) patch.breed = dto.breed.trim().slice(0, 60);
    if (dto.startDate !== undefined) {
      if (dto.startDate > todayIso(timezone)) {
        assertValid({ startDate: "تاریخ جوجه‌ریزی نمی‌تواند در آینده باشد." });
      }
      patch.startDate = dto.startDate;
    }
    if (dto.initialCount !== undefined) patch.initialCount = dto.initialCount;
    if (dto.chickPrice !== undefined) patch.chickPrice = String(dto.chickPrice);
    if (dto.targetWeightG !== undefined) patch.targetWeightG = dto.targetWeightG;
    if (dto.targetAgeDays !== undefined) patch.targetAgeDays = dto.targetAgeDays;
    if (dto.notes !== undefined) patch.notes = dto.notes.slice(0, 500);

    if (dto.status === "closed") {
      patch.status = "closed";
      patch.closedDate = dto.closedDate ?? todayIso(timezone);
    } else if (dto.status === "active") {
      patch.status = "active";
      patch.closedDate = null;
    }

    await this.db.update(flocks).set(patch).where(and(eq(flocks.id, id), eq(flocks.farmId, farmId)));
    return this.get(farmId, id);
  }

  /** حذف نرم گله و همه رکوردهای وابسته (برای همگام‌سازی آفلاین) */
  /**
   * بستن دوره.
   *
   * بستن، داده را قفل نمی‌کند؛ فقط پایان دوره را اعلام می‌کند تا شاخص‌ها در
   * گزارش‌ها به‌عنوان «تحقق‌یافته» حساب شوند. اگر گله پرنده زنده داشته باشد،
   * هشدار داده می‌شود ولی جلوگیری نمی‌شود (ممکن است تلفات پایان دوره باشد).
   */
  async close(farmId: string, id: string, dto: CloseFlockDto, timezone = "Asia/Tehran") {
    const flock = await this.get(farmId, id);
    if (flock.status === "closed") throw new BadRequestException("این گله پیش‌تر بسته شده است.");

    const closedDate = dto.closedDate ?? todayIso(timezone);
    const errors: Record<string, string> = {};
    if (closedDate > todayIso(timezone)) errors.closedDate = "تاریخ پایان نمی‌تواند در آینده باشد.";
    if (closedDate < flock.start_date) errors.closedDate = "تاریخ پایان نمی‌تواند پیش از جوجه‌ریزی باشد.";
    assertValid(errors, "گله بسته نشد.");

    await this.db
      .update(flocks)
      .set({ status: "closed", closedDate, updatedAt: new Date() })
      .where(and(eq(flocks.id, id), eq(flocks.farmId, farmId)));

    const metrics = await this.analytics.flockMetrics(farmId, id);
    const warnings: string[] = [];
    if (metrics.liveBirds > 0) {
      warnings.push(`${metrics.liveBirds.toLocaleString("fa-IR")} قطعه زنده در گله مانده و فروشی برایشان ثبت نشده است.`);
    }
    if (closedDate < flock.start_date || metrics.ageDays < 7) {
      warnings.push("دوره کوتاه‌تر از یک هفته است؛ شاخص‌های مقایسه‌ای معتبر نیستند.");
    }
    return {
      flock: await this.get(farmId, id),
      summary: {
        ageDays: metrics.ageDays,
        liveBirds: metrics.liveBirds,
        soldBirds: metrics.soldBirds,
        totalFeedKg: metrics.totalFeedKg,
        fcr: metrics.fcr,
        mortalityPct: metrics.mortalityPct,
        totalCost: metrics.totalCost,
        revenue: metrics.revenue,
        netProfit: metrics.netProfit,
        costPerKgLive: metrics.costPerKgLive,
        uniformityPct: metrics.uniformityPct,
      },
      warnings,
    };
  }

  /** بازگشایی گله بسته‌شده برای اصلاح ثبت‌ها */
  async reopen(farmId: string, id: string) {
    const flock = await this.get(farmId, id);
    if (flock.status === "active") throw new BadRequestException("این گله از قبل باز است.");
    await this.db
      .update(flocks)
      .set({ status: "active", closedDate: null, updatedAt: new Date() })
      .where(and(eq(flocks.id, id), eq(flocks.farmId, farmId)));
    return this.get(farmId, id);
  }

  async remove(farmId: string, id: string) {
    await this.get(farmId, id);
    const now = new Date();
    await this.db.transaction(async (tx: any) => {
      await tx.update(flocks).set({ deletedAt: now, updatedAt: now }).where(and(eq(flocks.id, id), eq(flocks.farmId, farmId)));
      for (const table of [dailyLogs, weightSamples, expenses, sales]) {
        await tx.update(table).set({ deletedAt: now }).where(and(eq(table.flockId, id), isNull(table.deletedAt)));
      }
    });
    return { ok: true };
  }

  /** خلاصه شمارشی برای صفحه فهرست */
  async stats(farmId: string, id: string) {
    const flock = await this.get(farmId, id);
    const logs = await this.db.select().from(dailyLogs).where(and(eq(dailyLogs.flockId, id), isNull(dailyLogs.deletedAt)));
    const lost = logs.reduce((s: number, l: any) => s + n(l.mortality) + n(l.cull), 0);
    const soldRows = await this.db.select().from(sales).where(and(eq(sales.flockId, id), isNull(sales.deletedAt)));
    const sold = soldRows.reduce((s: number, r: any) => s + n(r.count, 0), 0);
    const costRows = await this.db.select().from(expenses).where(and(eq(expenses.flockId, id), isNull(expenses.deletedAt)));
    const weighs = await this.db
      .select()
      .from(weightSamples)
      .where(and(eq(weightSamples.flockId, id), isNull(weightSamples.deletedAt)));
    return {
      flock,
      liveBirds: Math.max(0, flock.initial_count - lost - sold),
      logCount: logs.length,
      weighCount: weighs.length,
      totalCost: costRows.reduce((s: number, c: any) => s + money(c.amount), 0),
    };
  }
}
