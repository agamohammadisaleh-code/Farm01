import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, eq, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Cost, Cycle } from "@farm/domain";
import { DATABASE, type Database } from "../db/database";
import { costs, cycles } from "../db/schema";
import { assertValid } from "../common/errors";
import { todayIso } from "../common/ids";
import { toCost, toCycle } from "../common/mappers";
import type { CreateCostDto } from "./costs.dto";

@Injectable()
export class CostsService {
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

  async list(farmId: string, cycleId: string): Promise<Cost[]> {
    await this.cycleOrThrow(farmId, cycleId);
    const rows = await this.db
      .select()
      .from(costs)
      .where(and(eq(costs.cycleId, cycleId), eq(costs.farmId, farmId), isNull(costs.deletedAt)))
      .orderBy(asc(costs.date), asc(costs.createdAt));
    return rows.map(toCost);
  }

  private validateDate(cycle: Cycle, date: string, tz: string) {
    const errors: Record<string, string> = {};
    if (date > todayIso(tz)) errors.date = "ثبت تاریخ آینده مجاز نیست.";
    if (date < cycle.placement_date) errors.date = "تاریخ پیش از جوجه‌ریزی دوره است.";
    assertValid(errors, "هزینه ثبت نشد.");
  }

  async create(farmId: string, userId: string, cycleId: string, dto: CreateCostDto, tz = "Asia/Tehran") {
    const cycle = await this.cycleOrThrow(farmId, cycleId);
    this.validateDate(cycle, dto.date, tz);

    const id = randomUUID();
    await this.db.insert(costs).values({
      id,
      farmId,
      cycleId,
      date: dto.date,
      category: dto.category,
      description: dto.description.trim().slice(0, 200),
      amount: String(Math.round(dto.amount)),
      quantity: dto.quantity != null ? String(dto.quantity) : null,
      unit: dto.unit?.slice(0, 20) ?? null,
      vendor: dto.vendor?.slice(0, 80) ?? null,
      createdBy: userId,
    });
    const rows = await this.db.select().from(costs).where(eq(costs.id, id)).limit(1);
    return toCost(rows[0]);
  }

  async update(farmId: string, cycleId: string, id: string, dto: CreateCostDto, tz = "Asia/Tehran") {
    const cycle = await this.cycleOrThrow(farmId, cycleId);
    this.validateDate(cycle, dto.date, tz);
    const existing = await this.db
      .select()
      .from(costs)
      .where(and(eq(costs.id, id), eq(costs.cycleId, cycleId), eq(costs.farmId, farmId)))
      .limit(1);
    if (!existing[0]) throw new NotFoundException("هزینه یافت نشد.");

    await this.db
      .update(costs)
      .set({
        date: dto.date,
        category: dto.category,
        description: dto.description.trim().slice(0, 200),
        amount: String(Math.round(dto.amount)),
        quantity: dto.quantity != null ? String(dto.quantity) : null,
        unit: dto.unit?.slice(0, 20) ?? null,
        vendor: dto.vendor?.slice(0, 80) ?? null,
        updatedAt: new Date(),
      })
      .where(eq(costs.id, id));
    const rows = await this.db.select().from(costs).where(eq(costs.id, id)).limit(1);
    return toCost(rows[0]);
  }

  async remove(farmId: string, cycleId: string, id: string) {
    const rows = await this.db
      .select()
      .from(costs)
      .where(and(eq(costs.id, id), eq(costs.cycleId, cycleId), eq(costs.farmId, farmId)))
      .limit(1);
    if (!rows[0]) throw new NotFoundException("هزینه یافت نشد.");
    await this.db.update(costs).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(costs.id, id));
    return { ok: true };
  }
}
