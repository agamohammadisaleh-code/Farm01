import { Inject, Injectable, Logger } from "@nestjs/common";
import { and, asc, eq, gt, inArray, isNull } from "drizzle-orm";
import { can, type Role } from "@farm/domain";
import { DATABASE, type Database } from "../db/database";
import { dailyLogs, expenses, flocks, halls, sales, syncReceipts, weightSamples } from "../db/schema";
import { toExpense, toFlock, toLog, toSale, toWeightSample } from "../common/mappers";
import { LogsService } from "../logs/logs.service";
import { ExpensesService } from "../expenses/expenses.service";
import { SalesService } from "../sales/sales.service";
import { WeightSamplesService } from "../weight-samples/weight-samples.service";
import { FarmsService } from "../farms/farms.service";
import type { SyncOperationDto } from "./sync.dto";

export interface SyncPushResult {
  clientId: string;
  status: "applied" | "duplicate" | "failed";
  entityId?: string;
  error?: string;
}

export interface SyncPushResponse {
  serverTime: string;
  results: SyncPushResult[];
  applied: number;
  duplicates: number;
  failed: number;
}

/**
 * همگام‌سازی آفلاین.
 *
 * دو تصمیم مهم:
 * ۱. **بی‌اثری تکرار**: هر عملیات `clientId` دارد و نتیجه‌اش در
 *    `sync_receipts` ثبت می‌شود. اگر تلفن وسط ارسال قطع شود و همان عملیات
 *    دوباره برسد، پاسخ `duplicate` می‌گیرد نه یک ثبت دوم. این جدول از قبل
 *    در مدل داده بود ولی استفاده نمی‌شد.
 * ۲. **خطای یک عملیات، بقیه را متوقف نمی‌کند**: صف موبایل چند ثبت دارد؛
 *    اگر یکی نامعتبر باشد، بقیه باید بنشینند. خطا با پیام فارسی به همان
 *    عملیات برمی‌گردد تا کاربر اصلاحش کند.
 */
@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    @Inject(DATABASE) private readonly database: Database,
    private readonly logs: LogsService,
    private readonly expenses: ExpensesService,
    private readonly sales: SalesService,
    private readonly weights: WeightSamplesService,
    private readonly farms: FarmsService,
  ) {}

  private get db(): any {
    return this.database.db;
  }

  /* --------------------------------- ارسال --------------------------------- */

  async push(farmId: string, userId: string, role: Role, operations: SyncOperationDto[], timezone: string) {
    const results: SyncPushResult[] = [];

    for (const op of operations) {
      const duplicate = await this.receipt(farmId, op.clientId);
      if (duplicate) {
        results.push({ clientId: op.clientId, status: "duplicate", entityId: duplicate.entityId });
        continue;
      }

      try {
        const entityId = await this.apply(farmId, userId, role, op, timezone);
        await this.record(farmId, op.clientId, op.type, entityId);
        results.push({ clientId: op.clientId, status: "applied", entityId });
      } catch (error) {
        const message = this.persianError(error);
        this.logger.warn(`عملیات ${op.type} (${op.clientId}) رد شد: ${message}`);
        results.push({ clientId: op.clientId, status: "failed", error: message });
      }
    }

    const applied = results.filter((r) => r.status === "applied").length;
    const duplicates = results.filter((r) => r.status === "duplicate").length;
    const failed = results.filter((r) => r.status === "failed").length;

    return {
      serverTime: new Date().toISOString(),
      results,
      applied,
      duplicates,
      failed,
    } satisfies SyncPushResponse;
  }

  private async apply(
    farmId: string,
    userId: string,
    role: Role,
    op: SyncOperationDto,
    timezone: string,
  ): Promise<string> {
    const p = op.payload as any;

    switch (op.type) {
      case "log.save": {
        if (!can(role, "log:write")) throw new Error("نقش شما اجازه ثبت روزانه ندارد.");
        const saved = await this.logs.save(
          farmId,
          userId,
          op.flockId,
          {
            date: p.date,
            mortality: Number(p.mortality ?? 0),
            cull: Number(p.cull ?? 0),
            feedKg: Number(p.feedKg ?? 0),
            waterLiter: p.waterLiter == null ? 0 : Number(p.waterLiter),
            avgTemp: p.avgTemp == null ? undefined : Number(p.avgTemp),
            feedType: p.feedType ?? undefined,
            notes: p.notes ?? undefined,
            clientId: op.clientId,
          },
          timezone,
        );
        return saved.id;
      }
      case "weight.create": {
        if (!can(role, "log:write")) throw new Error("نقش شما اجازه ثبت وزن‌گیری ندارد.");
        const saved = await this.weights.create(
          farmId,
          userId,
          op.flockId,
          {
            date: p.date,
            sampleCount: Number(p.sampleCount ?? 30),
            avgWeightGr: Number(p.avgWeightGr ?? 0),
            minWeightGr: p.minWeightGr == null ? undefined : Number(p.minWeightGr),
            maxWeightGr: p.maxWeightGr == null ? undefined : Number(p.maxWeightGr),
            notes: p.notes ?? undefined,
          },
          timezone,
        );
        return saved.id;
      }
      case "expense.create": {
        if (!can(role, "cost:write")) throw new Error("ثبت هزینه فقط برای مالک و مدیر مجاز است.");
        const saved = await this.expenses.create(
          farmId,
          userId,
          op.flockId,
          {
            date: p.date,
            category: p.category,
            description: p.description,
            amount: Number(p.amount ?? 0),
            quantity: p.quantity == null ? undefined : Number(p.quantity),
            unit: p.unit ?? undefined,
            vendor: p.vendor ?? undefined,
            feedType: p.feedType ?? undefined,
          },
          timezone,
        );
        return saved.id;
      }
      case "sale.create": {
        if (!can(role, "sale:write")) throw new Error("ثبت فروش فقط برای مالک و مدیر مجاز است.");
        const saved = await this.sales.create(
          farmId,
          userId,
          op.flockId,
          {
            date: p.date,
            totalWeightKg: Number(p.totalWeightKg ?? 0),
            pricePerKg: Number(p.pricePerKg ?? 0),
            buyer: p.buyer ?? undefined,
            count: p.count == null ? undefined : Number(p.count),
            deductions: p.deductions == null ? undefined : Number(p.deductions),
            notes: p.notes ?? undefined,
          },
          timezone,
        );
        return saved.id;
      }
      default:
        throw new Error("نوع عملیات پشتیبانی نمی‌شود.");
    }
  }

  /**
   * پیام خطای فارسی برای همان عملیات.
   * سرویس‌ها خطای اعتبارسنجی را به شکل `{ message, errors: { field: "..." } }`
   * می‌دهند؛ پیام کلی («مقادیر را بررسی کنید») به کاربر موبایل کمکی نمی‌کند،
   * پس دقیق‌ترین پیام فیلد انتخاب می‌شود تا بداند کدام عدد را اصلاح کند.
   */
  private persianError(error: unknown): string {
    if (typeof error === "object" && error !== null) {
      const anyError = error as {
        response?: unknown;
        message?: string;
        getResponse?: () => unknown;
      };
      const response = (typeof anyError.getResponse === "function" ? anyError.getResponse() : anyError.response) as
        | { message?: unknown; errors?: Record<string, string> }
        | string
        | undefined;

      if (typeof response === "string" && response.trim()) return response;
      if (response && typeof response === "object") {
        if (response.errors && typeof response.errors === "object") {
          const first = Object.values(response.errors).find((v) => typeof v === "string" && v.trim());
          if (first) return first;
        }
        if (Array.isArray(response.message) && response.message.length) return String(response.message[0]);
        if (typeof response.message === "string" && response.message.trim()) return response.message;
      }
      if (anyError.message) return anyError.message;
    }
    return "ثبت در سرور ناموفق بود.";
  }

  private async receipt(farmId: string, clientId: string) {
    const rows = await this.db
      .select()
      .from(syncReceipts)
      .where(and(eq(syncReceipts.farmId, farmId), eq(syncReceipts.clientId, clientId)))
      .limit(1);
    return rows[0] ?? null;
  }

  private async record(farmId: string, clientId: string, entity: string, entityId: string) {
    await this.db
      .insert(syncReceipts)
      .values({ id: `sr-${clientId}-${entity}`.slice(0, 120), farmId, clientId, entity, entityId })
      .onConflictDoNothing();
  }

  /* --------------------------------- دریافت --------------------------------- */

  /**
   * دریافت افزایشی: فقط ردیف‌هایی که بعد از `since` تغییر کرده‌اند.
   * ردیف‌های حذف‌شده هم با `deleted: true` می‌آیند تا گوشی بتواند محلی را
   * پاک کند؛ بدون این، حذف روی موبایل هرگز دیده نمی‌شد.
   */
  async pull(farmId: string, since: string | undefined, timezone: string) {
    const serverTime = new Date().toISOString();
    const sinceDate = since ? new Date(since) : new Date(0);
    const changed = (column: any) => gt(column, sinceDate);

    const flockRows = await this.db
      .select({ flock: flocks, hallName: halls.name })
      .from(flocks)
      .innerJoin(halls, eq(halls.id, flocks.hallId))
      .where(and(eq(flocks.farmId, farmId), changed(flocks.updatedAt)))
      .orderBy(asc(flocks.updatedAt));

    const flockIds = (
      await this.db.select({ id: flocks.id }).from(flocks).where(eq(flocks.farmId, farmId))
    ).map((r: any) => r.id);

    const scoped = (table: any) =>
      flockIds.length ? and(inArray(table.flockId, flockIds), changed(table.updatedAt)) : eq(table.id, "__none__");

    const [logRows, weightRows, expenseRows, saleRows] = await Promise.all([
      this.db.select().from(dailyLogs).where(scoped(dailyLogs)).orderBy(asc(dailyLogs.updatedAt)),
      this.db.select().from(weightSamples).where(scoped(weightSamples)),
      this.db.select().from(expenses).where(scoped(expenses)),
      this.db.select().from(sales).where(scoped(sales)),
    ]);

    const settings = await this.farms.settings(farmId);
    const hallRows = await this.db.select().from(halls).where(and(eq(halls.farmId, farmId), isNull(halls.deletedAt)));

    return {
      serverTime,
      since: since ?? null,
      timezone,
      halls: hallRows.map((r: any) => ({ id: r.id, name: r.name, capacity: Number(r.capacity) })),
      flocks: flockRows.map((r: any) => ({
        ...toFlock(r.flock),
        hall_name: r.hallName,
        deleted: Boolean(r.flock.deletedAt),
      })),
      logs: logRows.map((r: any) => ({ ...toLog(r), deleted: Boolean(r.deletedAt) })),
      weights: weightRows.map((r: any) => ({ ...toWeightSample(r), deleted: Boolean(r.deletedAt) })),
      expenses: expenseRows.map((r: any) => ({ ...toExpense(r), deleted: Boolean(r.deletedAt) })),
      sales: saleRows.map((r: any) => ({ ...toSale(r), deleted: Boolean(r.deletedAt) })),
      settings,
    };
  }
}
