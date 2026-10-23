import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, isNull } from "drizzle-orm";
import type { CycleMetrics } from "@farm/domain";
import { categoryLabel, formatJalali, flockAgeDays } from "@farm/domain";
import { DATABASE, type Database } from "../db/database";
import { dailyLogs, expenses, farmSettings, farms, flocks, halls, medications, sales, vaccinations, weightSamples } from "../db/schema";
import { toExpense, toLog, toMedication, toSale, toVaccination, toWeightSample } from "../common/mappers";
import { todayIso } from "../common/ids";
import { AnalyticsService } from "../analytics/analytics.service";
import { buildFlockExcel, buildFarmExcel } from "./report-excel";
import { buildFlockPdf } from "./report-pdf";

export interface FlockReport {
  meta: {
    generatedAt: string;
    farmName: string;
    hallName: string;
    flockName: string;
    breed: string;
    startDate: string;
    startDateJalali: string;
    closedDate: string | null;
    status: string;
    ageDays: number;
    generatedBy: string;
  };
  summary: CycleMetrics;
  tables: {
    logs: ReturnType<typeof toLog>[];
    weights: ReturnType<typeof toWeightSample>[];
    vaccinations: ReturnType<typeof toVaccination>[];
    medications: ReturnType<typeof toMedication>[];
    expenses: ReturnType<typeof toExpense>[];
    sales: ReturnType<typeof toSale>[];
  };
}

export type ReportFormat = "json" | "xlsx" | "pdf";

/**
 * گزارش‌ها.
 *
 * منبع همه اعداد همان `computeMetrics` است که داشبورد استفاده می‌کند؛ گزارش
 * هرگز محاسبه جداگانه ندارد، وگرنه عدد گزارش با عدد صفحه اختلاف پیدا می‌کند.
 */
@Injectable()
export class ReportsService {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    private readonly analytics: AnalyticsService,
  ) {}

  private get db(): any {
    return this.database.db;
  }

  private async settings(farmId: string) {
    const rows = await this.db.select().from(farmSettings).where(eq(farmSettings.farmId, farmId)).limit(1);
    return rows[0] ?? null;
  }

  async flockReport(farmId: string, flockId: string, generatedBy = ""): Promise<FlockReport> {
    const rows = await this.db
      .select({ farm: farms, hall: halls, flock: flocks })
      .from(flocks)
      .innerJoin(halls, eq(halls.id, flocks.hallId))
      .innerJoin(farms, eq(farms.id, flocks.farmId))
      .where(and(eq(flocks.farmId, farmId), eq(flocks.id, flockId), isNull(flocks.deletedAt)))
      .limit(1);
    const row = rows[0];
    if (!row) {
      const { NotFoundException } = await import("@nestjs/common");
      throw new NotFoundException("گله یافت نشد.");
    }

    const settings = await this.settings(farmId);
    const tz = settings?.timezone ?? "Asia/Tehran";
    const summary = await this.analytics.flockMetrics(farmId, flockId);

    const [logRows, weightRows, vacRows, medRows, expRows, saleRows] = await Promise.all([
      this.db.select().from(dailyLogs).where(and(eq(dailyLogs.flockId, flockId), isNull(dailyLogs.deletedAt))).orderBy(asc(dailyLogs.date)),
      this.db.select().from(weightSamples).where(and(eq(weightSamples.flockId, flockId), isNull(weightSamples.deletedAt))).orderBy(asc(weightSamples.date)),
      this.db.select().from(vaccinations).where(and(eq(vaccinations.flockId, flockId), isNull(vaccinations.deletedAt))).orderBy(asc(vaccinations.scheduledDate)),
      this.db.select().from(medications).where(and(eq(medications.flockId, flockId), isNull(medications.deletedAt))).orderBy(asc(medications.startDate)),
      this.db.select().from(expenses).where(and(eq(expenses.flockId, flockId), isNull(expenses.deletedAt))).orderBy(asc(expenses.date)),
      this.db.select().from(sales).where(and(eq(sales.flockId, flockId), isNull(sales.deletedAt))).orderBy(asc(sales.date)),
    ]);

    const start = String(row.flock.startDate).slice(0, 10);
    return {
      meta: {
        generatedAt: new Date().toISOString(),
        farmName: row.farm.name,
        hallName: row.hall.name,
        flockName: row.flock.name,
        breed: row.flock.breed,
        startDate: start,
        startDateJalali: formatJalali(start),
        closedDate: row.flock.closedDate ? String(row.flock.closedDate).slice(0, 10) : null,
        status: row.flock.status,
        ageDays: flockAgeDays({ ...(row.flock as any), start_date: start }, todayIso(tz)),
        generatedBy,
      },
      summary,
      tables: {
        logs: logRows.map(toLog),
        weights: weightRows.map(toWeightSample),
        vaccinations: vacRows.map(toVaccination),
        medications: medRows.map(toMedication),
        expenses: expRows.map(toExpense),
        sales: saleRows.map(toSale),
      },
    };
  }

  async farmReport(farmId: string) {
    const settings = await this.settings(farmId);
    const tz = settings?.timezone ?? "Asia/Tehran";
    const farmRows = await this.db.select().from(farms).where(eq(farms.id, farmId)).limit(1);
    const overview = await this.analytics.overview(farmId);
    return {
      meta: {
        generatedAt: new Date().toISOString(),
        farmName: farmRows[0]?.name ?? "مزرعه",
        asOf: todayIso(tz),
      },
      overview,
    };
  }

  /**
   * خروجی فایل.
   * Excel و PDF هر دو فارسی/RTL هستند: PDF با فونت وزیرمتن جاسازی‌شده و
   * بازآرایی حروف، Excel با جهت راست‌به‌چپ در هر برگه.
   */
  async exportFlock(farmId: string, flockId: string, format: ReportFormat, generatedBy = "") {
    const report = await this.flockReport(farmId, flockId, generatedBy);
    const safeName = report.meta.flockName.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, "_").slice(0, 60);
    const stamp = new Date().toISOString().slice(0, 10);

    if (format === "json") {
      return {
        filename: `report-${safeName}-${stamp}.json`,
        contentType: "application/json; charset=utf-8",
        body: Buffer.from(JSON.stringify(report, null, 2), "utf8"),
      };
    }
    if (format === "xlsx") {
      const buffer = await buildFlockExcel(report, categoryLabel);
      return {
        filename: `report-${safeName}-${stamp}.xlsx`,
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        body: buffer,
      };
    }
    const buffer = await buildFlockPdf(report);
    return { filename: `report-${safeName}-${stamp}.pdf`, contentType: "application/pdf", body: buffer };
  }

  async exportFarm(farmId: string, format: "json" | "xlsx") {
    const report = await this.farmReport(farmId);
    const safeName = report.meta.farmName.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, "_").slice(0, 60);
    const stamp = new Date().toISOString().slice(0, 10);
    if (format === "json") {
      return {
        filename: `farm-${safeName}-${stamp}.json`,
        contentType: "application/json; charset=utf-8",
        body: Buffer.from(JSON.stringify(report, null, 2), "utf8"),
      };
    }
    const buffer = await buildFarmExcel(report, categoryLabel);
    return {
      filename: `farm-${safeName}-${stamp}.xlsx`,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      body: buffer,
    };
  }
}
