/* برنامه‌ریزی نوتیفیکیشن‌های محلی موبایل.

   نوتیفیکیشن «push» از سرور نیازمند سرویس اعلان و توکن دستگاه است؛ اما
   بیشتر چیزی که مرغدار لازم دارد از داده‌ی همان گوشی معلوم است: واکسن
   فردا سررسید است، تلفات امروز بالاست، ثبت دیروز جا افتاده. پس اپ خودش
   زمان‌بندی می‌کند و آفلاین هم کار می‌کند.

   این ماژول فقط «چه چیزی، چه زمانی» را می‌سازد؛ زمان‌بندی واقعی با
   `expo-notifications` در اپ انجام می‌شود.
*/

export type NotificationKind = "vaccination" | "medication" | "withdrawal" | "alert" | "log" | "milestone";

export interface ReminderInput {
  id: string;
  kind: string;
  severity?: "info" | "warning" | "critical" | string;
  title: string;
  detail?: string;
  /** تاریخ سررسید (ISO) */
  due?: string;
  daysLeft?: number;
  flockId?: string;
  flockName?: string;
  href?: string;
}

export interface PlannedNotification {
  /** کلید یکتا: از ارسال تکراری همان هشدار جلوگیری می‌کند */
  key: string;
  kind: NotificationKind;
  title: string;
  body: string;
  /** زمان ارسال (ISO) */
  at: string;
  severity: "info" | "warning" | "critical";
  /** مسیری که با لمس نوتیفیکیشن باز می‌شود */
  deepLink?: string;
}

export interface PlanOptions {
  now: string;
  /** ساعت شروع سکوت شبانه (پیش‌فرض ۲۲) */
  quietStartHour?: number;
  /** ساعت پایان سکوت و اولین ارسال صبح (پیش‌فرض ۷) */
  quietEndHour?: number;
  /** ساعت پیش‌فرض یادآورهای غیرفوری (پیش‌فرض ۹) */
  morningHour?: number;
  /** افق برنامه‌ریزی به روز (پیش‌فرض ۱۴) */
  horizonDays?: number;
  /** سقف تعداد اعلان‌ها؛ iOS سقف ۶۴ اعلان زمان‌بندی‌شده دارد */
  limit?: number;
  /** یادآور واکسن چند روز قبل هم ارسال شود (پیش‌فرض ۱) */
  vaccineLeadDays?: number;
}

function startOfDay(iso: string, hour: number, dayOffset = 0): string {
  const date = new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + dayOffset);
  date.setUTCHours(hour, 0, 0, 0);
  return date.toISOString();
}

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function inQuietHours(iso: string, quietStart: number, quietEnd: number): boolean {
  const hour = new Date(iso).getUTCHours();
  if (quietStart <= quietEnd) return hour >= quietStart && hour < quietEnd;
  return hour >= quietStart || hour < quietEnd;
}

/**
 * اولین زمان مجاز بعد از سکوت شبانه.
 * `releaseHour` ساعت آزادشدن است: هشدار بحرانی در همان اولین ساعت مجاز
 * (پیش‌فرض ۷) می‌رسد، نه ساعت ۹ که برای یادآورهای عادی در نظر گرفته شده.
 */
function avoidQuietHours(iso: string, quietStart: number, quietEnd: number, releaseHour: number): string {
  if (!inQuietHours(iso, quietStart, quietEnd)) return iso;
  const next = new Date(iso);
  const hour = next.getUTCHours();
  if (hour >= quietStart) next.setUTCDate(next.getUTCDate() + 1);
  next.setUTCHours(releaseHour, 0, 0, 0);
  return next.toISOString();
}

/**
 * تبدیل فهرست یادآورها به اعلان‌های زمان‌بندی‌شده.
 *
 * قواعد:
 * - هشدار بحرانی: همان لحظه (اگر شب است، صبح روز بعد).
 * - هشدار عادی: صبح همان روز یا فردا.
 * - واکسن: یک روز قبل از سررسید، ساعت ۹ صبح.
 * - دوره پرهیز دارویی: همان روز پایان (فروش ممنوع).
 * - ثبت جاافتاده: پایان روز اگر هنوز وقت هست، وگرنه صبح فردا.
 * - همه یکتا بر اساس (نوع + شناسه یادآور) و در افق تعیین‌شده.
 */
export function planNotifications(reminders: ReminderInput[], options: PlanOptions): PlannedNotification[] {
  const quietStart = options.quietStartHour ?? 22;
  const quietEnd = options.quietEndHour ?? 7;
  const morningHour = options.morningHour ?? 9;
  const horizonDays = options.horizonDays ?? 14;
  const limit = options.limit ?? 40;
  const vaccineLead = options.vaccineLeadDays ?? 1;

  const nowMs = Date.parse(options.now);
  const today = options.now.slice(0, 10);
  const horizonEnd = addDays(today, horizonDays);
  const seen = new Set<string>();
  const planned: PlannedNotification[] = [];

  const push = (item: PlannedNotification) => {
    if (seen.has(item.key)) return;
    if (Date.parse(item.at) < nowMs) return;
    if (item.at.slice(0, 10) > horizonEnd) return;
    seen.add(item.key);
    planned.push(item);
  };

  for (const reminder of reminders) {
    const kind = (["vaccination", "medication", "withdrawal", "alert", "log", "milestone"] as NotificationKind[]).includes(
      reminder.kind as NotificationKind,
    )
      ? (reminder.kind as NotificationKind)
      : "milestone";

    const severity: PlannedNotification["severity"] =
      reminder.severity === "critical" ? "critical" : reminder.severity === "warning" ? "warning" : "info";

    const base = {
      kind,
      title: reminder.title,
      body: reminder.detail ?? reminder.flockName ?? "",
      severity,
      deepLink: reminder.href,
    };

    if (kind === "alert") {
      // هشدارها فوری‌اند؛ شبانه به صبح منتقل می‌شوند
      const at =
        severity === "critical"
          ? avoidQuietHours(new Date(nowMs + 60_000).toISOString(), quietStart, quietEnd, quietEnd)
          : avoidQuietHours(startOfDay(today, morningHour), quietStart, quietEnd, morningHour);
      push({ key: `alert:${reminder.id}`, ...base, at });
      continue;
    }

    if (kind === "vaccination" || kind === "medication") {
      const dueDate = reminder.due?.slice(0, 10) ?? (reminder.daysLeft != null ? addDays(today, reminder.daysLeft) : null);
      if (!dueDate) continue;
      const lead = kind === "vaccination" ? vaccineLead : 0;
      const at = startOfDay(dueDate, morningHour, -lead);
      push({ key: `${kind}:${reminder.id}`, ...base, at });
      continue;
    }

    if (kind === "withdrawal") {
      const dueDate = reminder.due?.slice(0, 10) ?? (reminder.daysLeft != null ? addDays(today, reminder.daysLeft) : null);
      if (!dueDate) continue;
      push({ key: `withdrawal:${reminder.id}`, ...base, at: startOfDay(dueDate, 8) });
      continue;
    }

    if (kind === "log") {
      // اگر هنوز تا پایان روز وقت هست، همان امروز عصر؛ وگرنه صبح فردا
      const evening = startOfDay(today, 20);
      const at = Date.parse(evening) > nowMs ? evening : startOfDay(today, morningHour, 1);
      push({ key: `log:${reminder.id}`, ...base, at });
      continue;
    }

    // milestone: یک روز قبل از تاریخ هدف
    const dueDate = reminder.due?.slice(0, 10) ?? (reminder.daysLeft != null ? addDays(today, reminder.daysLeft) : null);
    if (!dueDate) continue;
    push({ key: `milestone:${reminder.id}`, ...base, at: startOfDay(dueDate, morningHour, -1) });
  }

  return planned
    .sort((a, b) => a.at.localeCompare(b.at))
    .slice(0, limit);
}

/** متن کوتاه نوار وضعیت همگام‌سازی برای نمایش در اپ */
export function syncStatusLabel(pending: number, failed: number, online: boolean): string {
  const fa = (value: number) => String(value).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
  if (failed > 0) return `${fa(failed)} ثبت ناموفق — بررسی کنید`;
  if (!online) return pending > 0 ? `آفلاین — ${fa(pending)} ثبت در انتظار` : "آفلاین";
  if (pending > 0) return `در حال ارسال ${fa(pending)} ثبت…`;
  return "همه‌چیز همگام است";
}
