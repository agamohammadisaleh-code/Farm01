import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Cycle } from "@farm/domain";
import { DATABASE, type Database } from "../db/database";
import { costs, cycles, dailyLogs, sales } from "../db/schema";
import { assertValid } from "../common/errors";
import { todayIso } from "../common/ids";
import { money, n } from "../common/parse";
import { toCycle } from "../common/mappers";
import type { CreateCycleDto, UpdateCycleDto } from "./cycles.dto";

@Injectable()
export class CyclesService {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  private get db(): any {
    return this.database.db;
  }

  async list(farmId: string): Promise<Cycle[]> {
    const rows = await this.db
      .select()
      .from(cycles)
      .where(and(eq(cycles.farmId, farmId), isNull(cycles.deletedAt)))
      .orderBy(asc(cycles.status), desc(cycles.placementDate));
    return rows.map(toCycle);
  }

  async get(farmId: string, id: string): Promise<Cycle> {
    const rows = await this.db
      .select()
      .from(cycles)
      .where(and(eq(cycles.farmId, farmId), eq(cycles.id, id), isNull(cycles.deletedAt)))
      .limit(1);
    if (!rows[0]) throw new NotFoundException("دوره یافت نشد.");
    return toCycle(rows[0]);
  }

  async create(farmId: string, userId: string, dto: CreateCycleDto, timezone = "Asia/Tehran"): Promise<Cycle> {
    const errors: Record<string, string> = {};
    const today = todayIso(timezone);
    if (dto.placementDate > today) errors.placementDate = "تاریخ جوجه‌ریزی نمی‌تواند در آینده باشد.";
    if (!dto.name?.trim()) errors.name = "نام دوره را وارد کنید.";
    assertValid(errors, "دوره ایجاد نشد.");

    const id = dto.clientId && /^[0-9a-zA-Z_-]{8,64}$/.test(dto.clientId) ? dto.clientId : randomUUID();
    const dup = await this.db.select().from(cycles).where(eq(cycles.id, id)).limit(1);
    if (dup[0]) return toCycle(dup[0]); // همگام‌سازی تکراری از کلاینت آفلاین

    await this.db.transaction(async (tx: any) => {
      await tx.insert(cycles).values({
        id,
        farmId,
        name: dto.name.trim().slice(0, 80),
        house: (dto.house ?? "").trim().slice(0, 40),
        breed: (dto.breed ?? "راس ۳۰۸").trim().slice(0, 60),
        placementDate: dto.placementDate,
        initialCount: dto.initialCount,
        chickPrice: String(dto.chickPrice ?? 0),
        targetWeightG: dto.targetWeightG ?? 2500,
        targetAgeDays: dto.targetAgeDays ?? 42,
        createdBy: userId,
      });
      // هزینه جوجه به‌صورت خودکار ثبت می‌شود تا بهای تمام‌شده از روز اول کامل باشد
      if ((dto.chickPrice ?? 0) > 0) {
        await tx.insert(costs).values({
          id: randomUUID(),
          farmId,
          cycleId: id,
          date: dto.placementDate,
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

  async update(farmId: string, userId: string, id: string, dto: UpdateCycleDto): Promise<Cycle> {
    const cycle = await this.get(farmId, id);
    const patch: Record<string, unknown> = { updatedAt: new Date() };

    if (dto.name !== undefined) patch.name = dto.name.trim().slice(0, 80);
    if (dto.house !== undefined) patch.house = dto.house.trim().slice(0, 40);
    if (dto.breed !== undefined) patch.breed = dto.breed.trim().slice(0, 60);
    if (dto.placementDate !== undefined) {
      if (dto.placementDate > todayIso()) throw new Error("تاریخ جوجه‌ریزی نمی‌تواند در آینده باشد.");
      patch.placementDate = dto.placementDate;
    }
    if (dto.initialCount !== undefined) patch.initialCount = dto.initialCount;
    if (dto.chickPrice !== undefined) patch.chickPrice = String(dto.chickPrice);
    if (dto.targetWeightG !== undefined) patch.targetWeightG = dto.targetWeightG;
    if (dto.targetAgeDays !== undefined) patch.targetAgeDays = dto.targetAgeDays;
    if (dto.notes !== undefined) patch.notes = dto.notes.slice(0, 500);
    if (dto.status === "closed") {
      patch.status = "closed";
      patch.closedDate = dto.closedDate ?? todayIso();
    } else if (dto.status === "active") {
      patch.status = "active";
      patch.closedDate = null;
    }

    await this.db.update(cycles).set(patch).where(and(eq(cycles.id, cycle.id), eq(cycles.farmId, farmId)));
    return this.get(farmId, id);
  }

  /** حذف نرم دوره و همه رکوردهای وابسته (برای همگام‌سازی آفلاین) */
  async remove(farmId: string, id: string) {
    await this.get(farmId, id);
    const now = new Date();
    await this.db.transaction(async (tx: any) => {
      await tx.update(cycles).set({ deletedAt: now, updatedAt: now }).where(and(eq(cycles.id, id), eq(cycles.farmId, farmId)));
      await tx.update(dailyLogs).set({ deletedAt: now }).where(and(eq(dailyLogs.cycleId, id), isNull(dailyLogs.deletedAt)));
      await tx.update(costs).set({ deletedAt: now }).where(and(eq(costs.cycleId, id), isNull(costs.deletedAt)));
      await tx.update(sales).set({ deletedAt: now }).where(and(eq(sales.cycleId, id), isNull(sales.deletedAt)));
    });
    return { ok: true };
  }

  /** خلاصه شمارشی برای صفحه فهرست */
  async stats(farmId: string, id: string) {
    const cycle = await this.get(farmId, id);
    const logs = await this.db.select().from(dailyLogs).where(and(eq(dailyLogs.cycleId, id), isNull(dailyLogs.deletedAt)));
    const lost = logs.reduce((s: number, l: any) => s + n(l.mortality) + n(l.culls), 0);
    const rows = await this.db.select().from(sales).where(and(eq(sales.cycleId, id), isNull(sales.deletedAt)));
    const sold = rows.reduce((s: number, r: any) => s + n(r.count), 0);
    const costRows = await this.db.select().from(costs).where(and(eq(costs.cycleId, id), isNull(costs.deletedAt)));
    return {
      cycle,
      liveBirds: Math.max(0, cycle.initial_count - lost - sold),
      logCount: logs.length,
      totalCost: costRows.reduce((s: number, c: any) => s + money(c.amount), 0),
    };
  }
}
