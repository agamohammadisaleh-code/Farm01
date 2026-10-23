import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, eq, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Cycle, Sale } from "@farm/domain";
import { DATABASE, type Database } from "../db/database";
import { cycles, dailyLogs, sales } from "../db/schema";
import { assertValid } from "../common/errors";
import { todayIso } from "../common/ids";
import { n } from "../common/parse";
import { toCycle, toSale } from "../common/mappers";
import type { CreateSaleDto } from "./sales.dto";

@Injectable()
export class SalesService {
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

  async list(farmId: string, cycleId: string): Promise<Sale[]> {
    await this.cycleOrThrow(farmId, cycleId);
    const rows = await this.db
      .select()
      .from(sales)
      .where(and(eq(sales.cycleId, cycleId), eq(sales.farmId, farmId), isNull(sales.deletedAt)))
      .orderBy(asc(sales.date), asc(sales.createdAt));
    return rows.map(toSale);
  }

  async create(farmId: string, userId: string, cycleId: string, dto: CreateSaleDto, tz = "Asia/Tehran") {
    const cycle = await this.cycleOrThrow(farmId, cycleId);
    const errors: Record<string, string> = {};
    if (dto.date > todayIso(tz)) errors.date = "ثبت تاریخ آینده مجاز نیست.";
    if (dto.date < cycle.placement_date) errors.date = "تاریخ پیش از جوجه‌ریزی دوره است.";

    const logs = await this.db
      .select()
      .from(dailyLogs)
      .where(and(eq(dailyLogs.cycleId, cycleId), isNull(dailyLogs.deletedAt)));
    const existingSales = await this.db
      .select()
      .from(sales)
      .where(and(eq(sales.cycleId, cycleId), isNull(sales.deletedAt)));

    const lost = logs.reduce((s: number, l: any) => s + n(l.mortality) + n(l.culls), 0);
    const sold = existingSales.reduce((s: number, x: any) => s + n(x.count), 0);
    const live = Math.max(0, cycle.initial_count - lost - sold);
    if (dto.count > live) errors.count = `تعداد فروش بیشتر از قطعه زنده موجود (${live}) است.`;
    assertValid(errors, "فروش ثبت نشد.");

    const id = randomUUID();
    await this.db.insert(sales).values({
      id,
      farmId,
      cycleId,
      date: dto.date,
      count: dto.count,
      weightKg: String(dto.weightKg),
      pricePerKg: String(Math.round(dto.pricePerKg)),
      deductions: String(Math.round(dto.deductions ?? 0)),
      buyer: dto.buyer?.slice(0, 80) ?? null,
      notes: dto.notes?.slice(0, 500) ?? null,
      createdBy: userId,
    });
    const rows = await this.db.select().from(sales).where(eq(sales.id, id)).limit(1);
    return toSale(rows[0]);
  }

  async remove(farmId: string, cycleId: string, id: string) {
    const rows = await this.db
      .select()
      .from(sales)
      .where(and(eq(sales.id, id), eq(sales.cycleId, cycleId), eq(sales.farmId, farmId)))
      .limit(1);
    if (!rows[0]) throw new NotFoundException("فروش یافت نشد.");
    await this.db.update(sales).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(sales.id, id));
    return { ok: true };
  }
}
