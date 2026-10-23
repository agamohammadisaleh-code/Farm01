import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, eq, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { WeightSample } from "@farm/domain";
import { DATABASE, type Database } from "../db/database";
import { weightSamples } from "../db/schema";
import { assertValid } from "../common/errors";
import { todayIso } from "../common/ids";
import { toWeightSample } from "../common/mappers";
import { FlockAccess } from "../common/flock-access";
import type { CreateWeightSampleDto } from "./weight-samples.dto";

@Injectable()
export class WeightSamplesService {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    private readonly access: FlockAccess,
  ) {}

  private get db(): any {
    return this.database.db;
  }

  async list(farmId: string, flockId: string): Promise<WeightSample[]> {
    await this.access.require(farmId, flockId);
    const rows = await this.db
      .select()
      .from(weightSamples)
      .where(and(eq(weightSamples.flockId, flockId), isNull(weightSamples.deletedAt)))
      .orderBy(asc(weightSamples.date));
    return rows.map(toWeightSample);
  }

  async create(farmId: string, userId: string, flockId: string, dto: CreateWeightSampleDto, tz = "Asia/Tehran") {
    const flock = await this.access.require(farmId, flockId);
    const errors: Record<string, string> = {};
    if (dto.date > todayIso(tz)) errors.date = "ثبت تاریخ آینده مجاز نیست.";
    if (dto.date < flock.start_date) errors.date = "تاریخ پیش از جوجه‌ریزی گله است.";
    assertValid(errors, "وزن‌گیری ثبت نشد.");

    const id = randomUUID();
    await this.db.insert(weightSamples).values({
      id,
      flockId,
      date: dto.date,
      sampleCount: dto.sampleCount,
      avgWeightGr: dto.avgWeightGr,
      notes: dto.notes?.slice(0, 300) ?? null,
      createdBy: userId,
    });
    const rows = await this.db.select().from(weightSamples).where(eq(weightSamples.id, id)).limit(1);
    return toWeightSample(rows[0]);
  }

  async remove(farmId: string, flockId: string, id: string) {
    await this.access.require(farmId, flockId);
    const rows = await this.db
      .select()
      .from(weightSamples)
      .where(and(eq(weightSamples.id, id), eq(weightSamples.flockId, flockId)))
      .limit(1);
    if (!rows[0]) throw new NotFoundException("وزن‌گیری یافت نشد.");
    await this.db.update(weightSamples).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(weightSamples.id, id));
    return { ok: true };
  }
}
