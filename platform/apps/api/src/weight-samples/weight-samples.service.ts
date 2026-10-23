import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, eq, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { sampleUniformity, type WeightSample } from "@farm/domain";
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
    const spread = this.spread(dto);
    await this.db.insert(weightSamples).values({
      id,
      flockId,
      date: dto.date,
      sampleCount: dto.sampleCount,
      avgWeightGr: dto.avgWeightGr,
      minWeightGr: dto.minWeightGr ?? null,
      maxWeightGr: dto.maxWeightGr ?? null,
      cvPct: spread.cvPct,
      uniformityPct: spread.uniformityPct,
      notes: dto.notes?.slice(0, 300) ?? null,
      createdBy: userId,
    });
    const rows = await this.db.select().from(weightSamples).where(eq(weightSamples.id, id)).limit(1);
    return toWeightSample(rows[0]);
  }

  /**
   * یکنواختی و CV نمونه را نرمال می‌کند:
   * ترازو عدد می‌دهد → همان ذخیره می‌شود؛ وگرنه از دامنه وزن برآورد می‌گردد.
   * اعتبارسنجی منطقی: کمینه ≤ میانگین ≤ بیشینه.
   */
  private spread(dto: CreateWeightSampleDto) {
    const errors: Record<string, string> = {};
    if (dto.minWeightGr != null && dto.maxWeightGr != null && dto.minWeightGr > dto.maxWeightGr) {
      errors.maxWeightGr = "بیشترین وزن نباید از کمترین وزن کمتر باشد.";
    }
    if (dto.minWeightGr != null && dto.minWeightGr > dto.avgWeightGr) {
      errors.minWeightGr = "کمترین وزن نباید از میانگین بیشتر باشد.";
    }
    if (dto.maxWeightGr != null && dto.maxWeightGr < dto.avgWeightGr) {
      errors.maxWeightGr = "بیشترین وزن نباید از میانگین کمتر باشد.";
    }
    assertValid(errors, "وزن‌گیری ثبت نشد.");

    const result = sampleUniformity({
      id: "",
      flock_id: "",
      date: dto.date,
      sample_count: dto.sampleCount,
      avg_weight_gr: dto.avgWeightGr,
      min_weight_gr: dto.minWeightGr ?? null,
      max_weight_gr: dto.maxWeightGr ?? null,
      cv_pct: dto.cvPct ?? null,
      uniformity_pct: dto.uniformityPct ?? null,
      notes: null,
      created_by: null,
      created_at: "",
      updated_at: "",
      deleted_at: null,
    });
    return {
      cvPct: result.cvPct == null ? null : String(result.cvPct),
      uniformityPct: result.uniformityPct == null ? null : String(result.uniformityPct),
    };
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
