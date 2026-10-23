import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, isNull } from "drizzle-orm";
import { DATABASE, type Database } from "../db/database";
import {
  dailyLogs,
  farmSettings,
  feedInventory,
  flocks,
  halls,
  medications,
  vaccinations,
} from "../db/schema";
import { todayIso } from "../common/ids";
import { n } from "../common/parse";
import { HealthService } from "../health/health.service";
import { AnalyticsService } from "../analytics/analytics.service";

export type ReminderKind =
  | "vaccination"
  | "medication"
  | "withdrawal"
  | "stock"
  | "log"
  | "milestone"
  /** هشدارهای محاسبه‌شده از قواعد کسب‌وکار (افت آب، تلفات روزانه، FCR، دما) */
  | "alert";
export type ReminderSeverity = "critical" | "warning" | "info";

export interface Reminder {
  id: string;
  kind: ReminderKind;
  severity: ReminderSeverity;
  title: string;
  detail: string;
  /** تاریخ سررسید (YYYY-MM-DD) یا null برای موارد بی‌تاریخ */
  due: string | null;
  /** روزهای مانده؛ منفی یعنی گذشته */
  daysLeft: number | null;
  flockId: string | null;
  flockName: string | null;
  /** مسیر پیشنهادی در کلاینت */
  href: string | null;
  /** اقدام پیشنهادی، برای دکمه در اپ */
  action: { label: string; method: "POST" | "PATCH" | "GET"; path: string } | null;
}

const dayDiff = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400_000);

/**
 * یادآورها و هشدارهای عملیاتی.
 *
 * یک منبع واحد برای «امروز چه کاری باید انجام شود»: واکسن سررسیدشده،
 * پایان دارو، پایان دوره پرهیز پیش از فروش، کمبود دان، ثبت روزانه جاافتاده
 * و رسیدن گله به سن هدف. همه از داده واقعی محاسبه می‌شوند — هیچ یادآور
 * ذخیره‌شده‌ای وجود ندارد که با واقعیت انحراف پیدا کند.
 */
@Injectable()
export class RemindersService {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    private readonly health: HealthService,
    private readonly analytics: AnalyticsService,
  ) {}

  private get db(): any {
    return this.database.db;
  }

  async list(farmId: string, opts: { horizonDays?: number; timezone?: string } = {}): Promise<{ asOf: string; reminders: Reminder[]; counts: Record<string, number> }> {
    const timezone = opts.timezone ?? "Asia/Tehran";
    const horizon = Math.min(60, Math.max(1, opts.horizonDays ?? 7));
    const today = todayIso(timezone);

    const settingsRows = await this.db.select().from(farmSettings).where(eq(farmSettings.farmId, farmId)).limit(1);
    const feedAlertDays = settingsRows[0]?.feedAlertDays ?? 3;

    const flockRows = await this.db
      .select({ flock: flocks, hallName: halls.name })
      .from(flocks)
      .innerJoin(halls, eq(halls.id, flocks.hallId))
      .where(and(eq(flocks.farmId, farmId), isNull(flocks.deletedAt), eq(flocks.status, "active")))
      .orderBy(asc(flocks.startDate));

    const reminders: Reminder[] = [];

    for (const row of flockRows) {
      const flock = row.flock;
      const flockName = flock.name;
      const ageDays = Math.max(1, dayDiff(String(flock.startDate).slice(0, 10), today) + 1);

      /* ------------------------------ واکسیناسیون ------------------------------ */
      const vacs = await this.health.listVaccinations(farmId, flock.id, timezone);
      for (const v of vacs) {
        if (v.status === "done" || v.status === "skipped") continue;
        const daysLeft = v.days_until;
        if (daysLeft < 0) {
          reminders.push({
            id: `vac-overdue-${v.id}`,
            kind: "vaccination",
            severity: "critical",
            title: `واکسن عقب‌افتاده: ${v.name}`,
            detail: `${Math.abs(daysLeft)} روز از تاریخ برنامه‌ریزی‌شده گذشته است.`,
            due: v.scheduled_date,
            daysLeft,
            flockId: flock.id,
            flockName,
            href: `/flocks/${flock.id}?tab=health`,
            action: { label: "ثبت انجام واکسن", method: "PATCH", path: `/flocks/${flock.id}/vaccinations/${v.id}` },
          });
        } else if (daysLeft <= horizon) {
          reminders.push({
            id: `vac-due-${v.id}`,
            kind: "vaccination",
            severity: daysLeft === 0 ? "warning" : "info",
            title: `واکسن در پیش: ${v.name}`,
            detail: daysLeft === 0 ? "امروز موعد واکسیناسیون است." : `${daysLeft} روز تا موعد واکسیناسیون.`,
            due: v.scheduled_date,
            daysLeft,
            flockId: flock.id,
            flockName,
            href: `/flocks/${flock.id}?tab=health`,
            action: { label: "ثبت انجام واکسن", method: "PATCH", path: `/flocks/${flock.id}/vaccinations/${v.id}` },
          });
        }
      }

      /* -------------------------------- دارو -------------------------------- */
      const meds = await this.db
        .select()
        .from(medications)
        .where(and(eq(medications.flockId, flock.id), isNull(medications.deletedAt)));
      for (const m of meds) {
        if (!m.endDate) continue;
        const end = String(m.endDate).slice(0, 10);
        const daysLeft = dayDiff(today, end);
        if (daysLeft >= 0 && daysLeft <= horizon) {
          reminders.push({
            id: `med-end-${m.id}`,
            kind: "medication",
            severity: "info",
            title: `پایان دارو: ${m.name}`,
            detail: daysLeft === 0 ? "امروز آخرین روز مصرف است." : `${daysLeft} روز تا پایان دوره مصرف.`,
            due: end,
            daysLeft,
            flockId: flock.id,
            flockName,
            href: `/flocks/${flock.id}?tab=health`,
            action: null,
          });
        }

        // دوره پرهیز: تا وقتی تمام نشده، فروش این گله مجاز نیست
        const withdrawal = m.withdrawalDays ?? 0;
        if (withdrawal > 0) {
          const clearDate = addDays(end, withdrawal);
          const untilClear = dayDiff(today, clearDate);
          if (untilClear >= 0) {
            reminders.push({
              id: `withdraw-${m.id}`,
              kind: "withdrawal",
              severity: untilClear === 0 ? "warning" : "critical",
              title: `دوره پرهیز دارویی: ${m.name}`,
              detail:
                untilClear === 0
                  ? "دوره پرهیز امروز پایان می‌یابد؛ از فردا فروش مجاز است."
                  : `${untilClear} روز تا پایان دوره پرهیز (${withdrawal} روز). فروش در این بازه مجاز نیست.`,
              due: clearDate,
              daysLeft: untilClear,
              flockId: flock.id,
              flockName,
              href: `/flocks/${flock.id}?tab=health`,
              action: null,
            });
          }
        }
      }

      /* --------------------------- هشدارهای قواعد --------------------------- */
      /**
       * قواعد ۴ و ۵ (افت مصرف آب و نرخ تلفات روزانه) و بقیه هشدارهای موتور
       * شاخص‌ها، از همین‌جا در فهرست یادآورها دیده می‌شوند تا کاربر یک فهرست
       * واحد «امروز چه کاری لازم است» داشته باشد، نه دو جای جدا.
       */
      const metrics = await this.analytics.flockMetrics(farmId, flock.id);
      for (const alert of metrics.alerts) {
        if (alert.severity !== "critical" && alert.severity !== "warning") continue;
        reminders.push({
          id: `alert-${alert.id}-${flock.id}`,
          kind: "alert",
          severity: alert.severity,
          title: `${alert.title} — ${flockName}`,
          detail: alert.detail,
          due: today,
          daysLeft: 0,
          flockId: flock.id,
          flockName,
          href: alert.action?.href ?? `/flocks/${flock.id}?tab=daily`,
          action: null,
        });
      }

      /* ------------------------------ ثبت روزانه ------------------------------ */
      const lastLog = await this.db
        .select({ date: dailyLogs.date })
        .from(dailyLogs)
        .where(and(eq(dailyLogs.flockId, flock.id), isNull(dailyLogs.deletedAt)))
        .orderBy(asc(dailyLogs.date));
      const latest = lastLog.at(-1)?.date ? String(lastLog.at(-1).date).slice(0, 10) : null;
      const missingDays = latest ? dayDiff(latest, today) : null;
      if (missingDays === null || missingDays > 0) {
        const days = missingDays ?? ageDays;
        reminders.push({
          id: `log-${flock.id}`,
          kind: "log",
          severity: days >= 2 ? "warning" : "info",
          title: `ثبت روزانه جاافتاده: ${flockName}`,
          detail: latest
            ? `آخرین ثبت برای ${latest} است؛ ${days} روز ثبت نشده.`
            : "برای این گله هنوز هیچ ثبت روزانه‌ای انجام نشده است.",
          due: today,
          daysLeft: 0,
          flockId: flock.id,
          flockName,
          href: `/flocks/${flock.id}?tab=daily`,
          action: { label: "ثبت امروز", method: "POST", path: `/flocks/${flock.id}/logs` },
        });
      }

      /* -------------------------------- نقاط عطف -------------------------------- */
      const targetAge = Number(flock.targetAgeDays ?? 42);
      const daysToTarget = targetAge - ageDays;
      if (daysToTarget <= horizon) {
        reminders.push({
          id: `milestone-${flock.id}`,
          kind: "milestone",
          severity: "info",
          title: daysToTarget <= 0 ? `گله به سن هدف رسید: ${flockName}` : `نزدیک سن بارگیری: ${flockName}`,
          detail:
            daysToTarget > 0
              ? `${daysToTarget} روز تا سن هدف ${targetAge} روز. برنامه فروش و هماهنگی کشتارگاه را نهایی کنید.`
              : `سن گله ${ageDays} روز است و از سن هدف ${targetAge} روز گذشته.`,
          due: addDays(today, Math.max(0, daysToTarget)),
          daysLeft: daysToTarget,
          flockId: flock.id,
          flockName,
          href: `/flocks/${flock.id}?tab=summary`,
          action: { label: "برآورد بارگیری", method: "GET", path: `/ai/flocks/${flock.id}/loading-date` },
        });
      }
    }

    /* ------------------------------ انبار دان ------------------------------ */
    const stockRows = await this.db.select().from(feedInventory).where(eq(feedInventory.farmId, farmId));
    const feedRows = await this.db
      .select({ flockId: dailyLogs.flockId, feedKg: dailyLogs.feedKg, date: dailyLogs.date })
      .from(dailyLogs)
      .innerJoin(flocks, eq(flocks.id, dailyLogs.flockId))
      .where(and(eq(flocks.farmId, farmId), isNull(dailyLogs.deletedAt)));

    const since = addDays(today, -6);
    const recentFeed = feedRows
      .filter((r: any) => String(r.date).slice(0, 10) >= since)
      .reduce((sum: number, r: any) => sum + n(r.feedKg), 0);
    const dailyBurn = recentFeed / 7;

    for (const row of stockRows) {
      const qty = n(row.quantityKg);
      const daysLeft = dailyBurn > 0 ? Math.floor(qty / dailyBurn) : null;
      const low = qty <= 0 || (daysLeft !== null && daysLeft <= feedAlertDays);
      if (!low) continue;
      reminders.push({
        id: `stock-${row.id}`,
        kind: "stock",
        severity: qty <= 0 ? "critical" : "warning",
        title: `کمبود انبار: ${row.feedType}`,
        detail:
          qty <= 0
            ? `موجودی این نوع دان ${qty.toLocaleString("fa-IR")} کیلوگرم است${qty < 0 ? " (کمبود ثبت خرید)" : ""}.`
            : `موجودی ${Math.round(qty).toLocaleString("fa-IR")} کیلوگرم؛ با مصرف فعلی حدود ${daysLeft} روز کافی است.`,
        due: today,
        daysLeft: daysLeft,
        flockId: null,
        flockName: null,
        href: "/inventory",
        action: { label: "ثبت خرید دان", method: "POST", path: "/farm/inventory" },
      });
    }

    const order: Record<ReminderSeverity, number> = { critical: 0, warning: 1, info: 2 };
    reminders.sort((a, b) => {
      const sev = order[a.severity] - order[b.severity];
      if (sev !== 0) return sev;
      return (a.daysLeft ?? 0) - (b.daysLeft ?? 0);
    });

    return {
      asOf: today,
      reminders,
      counts: {
        total: reminders.length,
        critical: reminders.filter((r) => r.severity === "critical").length,
        warning: reminders.filter((r) => r.severity === "warning").length,
        info: reminders.filter((r) => r.severity === "info").length,
      },
    };
  }

  /** تعداد یادآورهای بحرانی — برای نشان (badge) در اپ موبایل */
  async badge(farmId: string, timezone = "Asia/Tehran") {
    const { counts } = await this.list(farmId, { timezone });
    return counts;
  }
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
