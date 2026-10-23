import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, eq, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Cycle, Sale } from "@farm/domain";
import { DATABASE, type Database } from "../db/database";
import { dailyLogs, sales } from "../db/schema";
import { assertValid } from "../common/errors";
import { FlockAccess } from "../common/flock-access";
import { todayIso } from "../common/ids";
import { n } from "../common/parse";
import { toSale } from "../common/mappers";
import type { CreateSaleDto } from "./sales.dto";

@Injectable()
export class SalesService {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    private readonly access: FlockAccess,
  ) {}

  private get db(): any {
    return this.database.db;
  }

  async list(farmId: string, flockId: string): Promise<Sale[]> {
    await this.access.require(farmId, flockId);
    const rows = await this.db
      .select()
      .from(sales)
      .where(and(eq(sales.flockId, flockId), isNull(sales.deletedAt)))
      .orderBy(asc(sales.date), asc(sales.createdAt));
    return rows.map(toSale);
  }

  async create(farmId: string, userId: string, flockId: string, dto: CreateSaleDto, tz = "Asia/Tehran") {
    const flock = await this.access.require(farmId, flockId);
    const errors: Record<string, string> = {};
    if (dto.date > todayIso(tz)) errors.date = "ثبت تاریخ آینده مجاز نیست.";
    if (dto.date < flock.start_date) errors.date = "تاریخ پیش از جوجه‌ریزی گله است.";

    const logs = await this.db
      .select()
      .from(dailyLogs)
      .where(and(eq(dailyLogs.flockId, flockId), isNull(dailyLogs.deletedAt)));
    const existingSales = await this.db
      .select()
      .from(sales)
      .where(and(eq(sales.flockId, flockId), isNull(sales.deletedAt)));

    const lost = logs.reduce((s: number, l: any) => s + n(l.mortality) + n(l.cull), 0);
    const sold = existingSales.reduce((s: number, x: any) => s + n(x.count), 0);
    const live = Math.max(0, flock.initial_count - lost - sold);
    if (dto.count && dto.count > live) errors.count = `تعداد فروش بیشتر از قطعه زنده موجود (${live}) است.`;
    // وزن کل نمی‌تواند از وزن تقریبی گله زنده بیشتر باشد (کنترل خطای ورود داده)
    if (dto.count && dto.totalWeightKg > dto.count * 4.5) {
      errors.totalWeightKg = "وزن کل با تعداد قطعه هم‌خوانی ندارد (بیش از ۴٫۵ کیلو برای هر قطعه).";
    }
    assertValid(errors, "فروش ثبت نشد.");

    const id = randomUUID();
    await this.db.insert(sales).values({
      id,
      flockId,
      date: dto.date,
      count: dto.count ?? null,
      totalWeightKg: String(dto.totalWeightKg),
      pricePerKg: String(Math.round(dto.pricePerKg)),
      deductions: String(Math.round(dto.deductions ?? 0)),
      buyer: dto.buyer?.slice(0, 80) ?? null,
      notes: dto.notes?.slice(0, 500) ?? null,
      createdBy: userId,
    });
    const rows = await this.db.select().from(sales).where(eq(sales.id, id)).limit(1);
    return toSale(rows[0]);
  }

  async remove(farmId: string, flockId: string, id: string) {
    await this.access.require(farmId, flockId);
    const rows = await this.db
      .select()
      .from(sales)
      .where(and(eq(sales.id, id), eq(sales.flockId, flockId)))
      .limit(1);
    if (!rows[0]) throw new NotFoundException("فروش یافت نشد.");
    await this.db.update(sales).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(sales.id, id));
    return { ok: true };
  }
}
