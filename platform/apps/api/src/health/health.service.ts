import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, eq, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Medication, Vaccination } from "@farm/domain";
import { DATABASE, type Database } from "../db/database";
import { medications, vaccinations } from "../db/schema";
import { assertValid } from "../common/errors";
import { todayIso } from "../common/ids";
import { toMedication, toVaccination } from "../common/mappers";
import { FlockAccess } from "../common/flock-access";
import type { CreateMedicationDto, CreateVaccinationDto, UpdateVaccinationDto } from "./health.dto";

/** وضعیت مؤثر واکسیناسیون: «عقب‌افتاده» ذخیره نمی‌شود، از تاریخ محاسبه می‌شود */
export type EffectiveVaccinationStatus = "scheduled" | "done" | "skipped" | "overdue";

export interface VaccinationView extends Vaccination {
  effective_status: EffectiveVaccinationStatus;
  days_until: number;
}

@Injectable()
export class HealthService {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    private readonly access: FlockAccess,
  ) {}

  private get db(): any {
    return this.database.db;
  }

  private view(v: Vaccination, today: string): VaccinationView {
    const days = Math.round((Date.parse(v.scheduled_date) - Date.parse(today)) / 86400_000);
    const effective: EffectiveVaccinationStatus =
      v.status === "done" || v.status === "skipped" ? v.status : days < 0 ? "overdue" : "scheduled";
    return { ...v, effective_status: effective, days_until: days };
  }

  /* ------------------------------- واکسیناسیون ------------------------------- */

  async listVaccinations(farmId: string, flockId: string, tz = "Asia/Tehran"): Promise<VaccinationView[]> {
    await this.access.require(farmId, flockId);
    const rows = await this.db
      .select()
      .from(vaccinations)
      .where(and(eq(vaccinations.flockId, flockId), isNull(vaccinations.deletedAt)))
      .orderBy(asc(vaccinations.scheduledDate));
    const today = todayIso(tz);
    return rows.map((r: any) => this.view(toVaccination(r), today));
  }

  async createVaccination(farmId: string, flockId: string, dto: CreateVaccinationDto, tz = "Asia/Tehran") {
    await this.access.require(farmId, flockId);
    const errors: Record<string, string> = {};
    if (dto.scheduledDate > todayIso(tz) && dto.status === "done") {
      errors.scheduledDate = "واکسن انجام‌شده نمی‌تواند تاریخ آینده داشته باشد.";
    }
    if (dto.doneDate && dto.doneDate > todayIso(tz)) errors.doneDate = "تاریخ انجام نمی‌تواند در آینده باشد.";
    assertValid(errors, "واکسیناسیون ثبت نشد.");

    const id = randomUUID();
    const status = dto.status ?? (dto.doneDate ? "done" : "scheduled");
    await this.db.insert(vaccinations).values({
      id,
      flockId,
      name: dto.name.trim().slice(0, 80),
      scheduledDate: dto.scheduledDate,
      doneDate: dto.doneDate ?? null,
      status,
      notes: dto.notes?.slice(0, 300) ?? null,
    });
    return this.listVaccinations(farmId, flockId).then((rows) => rows.find((v) => v.id === id));
  }

  async updateVaccination(farmId: string, flockId: string, id: string, dto: UpdateVaccinationDto, tz = "Asia/Tehran") {
    await this.access.require(farmId, flockId);
    const rows = await this.db
      .select()
      .from(vaccinations)
      .where(and(eq(vaccinations.id, id), eq(vaccinations.flockId, flockId)))
      .limit(1);
    if (!rows[0]) throw new NotFoundException("واکسیناسیون یافت نشد.");

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (dto.name !== undefined) patch.name = dto.name.trim().slice(0, 80);
    if (dto.scheduledDate !== undefined) patch.scheduledDate = dto.scheduledDate;
    if (dto.notes !== undefined) patch.notes = dto.notes.slice(0, 300);
    if (dto.doneDate !== undefined) {
      if (dto.doneDate > todayIso(tz)) assertValid({ doneDate: "تاریخ انجام نمی‌تواند در آینده باشد." });
      patch.doneDate = dto.doneDate;
      if (!dto.status) patch.status = "done";
    }
    if (dto.status !== undefined) {
      patch.status = dto.status;
      if (dto.status !== "done") patch.doneDate = null;
      else if (!dto.doneDate && !rows[0].doneDate) patch.doneDate = todayIso(tz);
    }
    await this.db.update(vaccinations).set(patch).where(eq(vaccinations.id, id));
    const updated = await this.listVaccinations(farmId, flockId);
    return updated.find((v) => v.id === id);
  }

  async removeVaccination(farmId: string, flockId: string, id: string) {
    await this.access.require(farmId, flockId);
    const rows = await this.db
      .select()
      .from(vaccinations)
      .where(and(eq(vaccinations.id, id), eq(vaccinations.flockId, flockId)))
      .limit(1);
    if (!rows[0]) throw new NotFoundException("واکسیناسیون یافت نشد.");
    await this.db.update(vaccinations).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(vaccinations.id, id));
    return { ok: true };
  }

  /* ---------------------------------- دارو ---------------------------------- */

  async listMedications(farmId: string, flockId: string): Promise<Medication[]> {
    await this.access.require(farmId, flockId);
    const rows = await this.db
      .select()
      .from(medications)
      .where(and(eq(medications.flockId, flockId), isNull(medications.deletedAt)))
      .orderBy(asc(medications.startDate));
    return rows.map(toMedication);
  }

  async createMedication(farmId: string, flockId: string, dto: CreateMedicationDto, tz = "Asia/Tehran") {
    await this.access.require(farmId, flockId);
    const errors: Record<string, string> = {};
    if (dto.startDate > todayIso(tz)) errors.startDate = "تاریخ شروع نمی‌تواند در آینده باشد.";
    if (dto.endDate && dto.endDate < dto.startDate) errors.endDate = "تاریخ پایان نمی‌تواند پیش از شروع باشد.";
    assertValid(errors, "دارو ثبت نشد.");

    const id = randomUUID();
    await this.db.insert(medications).values({
      id,
      flockId,
      name: dto.name.trim().slice(0, 80),
      dose: dto.dose.trim().slice(0, 80),
      startDate: dto.startDate,
      endDate: dto.endDate ?? null,
      withdrawalDays: dto.withdrawalDays ?? null,
      notes: dto.notes?.slice(0, 300) ?? null,
    });
    const rows = await this.db.select().from(medications).where(eq(medications.id, id)).limit(1);
    return toMedication(rows[0]);
  }

  async removeMedication(farmId: string, flockId: string, id: string) {
    await this.access.require(farmId, flockId);
    const rows = await this.db
      .select()
      .from(medications)
      .where(and(eq(medications.id, id), eq(medications.flockId, flockId)))
      .limit(1);
    if (!rows[0]) throw new NotFoundException("دارو یافت نشد.");
    await this.db.update(medications).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(medications.id, id));
    return { ok: true };
  }

  /**
   * خلاصه سلامت گله: واکسن‌های عقب‌افتاده، نزدیک و دوره پرهیز دارویی فعال.
   * در تحلیل و هشدارها استفاده می‌شود.
   */
  async summary(farmId: string, flockId: string, tz = "Asia/Tehran") {
    const [vax, meds] = await Promise.all([
      this.listVaccinations(farmId, flockId, tz),
      this.listMedications(farmId, flockId),
    ]);
    const today = todayIso(tz);
    const activeWithdrawal = meds.filter((m) => {
      if (!m.withdrawal_days) return false;
      const end = m.end_date ?? m.start_date;
      const until = new Date(Date.parse(end) + m.withdrawal_days * 86400_000).toISOString().slice(0, 10);
      return until >= today;
    });
    return {
      vaccinations: vax,
      medications: meds,
      overdue: vax.filter((v) => v.effective_status === "overdue"),
      dueSoon: vax.filter((v) => v.effective_status === "scheduled" && v.days_until >= 0 && v.days_until <= 3),
      activeWithdrawal,
    };
  }
}
