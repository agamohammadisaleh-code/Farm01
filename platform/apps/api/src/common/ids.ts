import { randomUUID } from "node:crypto";

/** شناسه پیش‌فرض سرور؛ کلاینت آفلاین می‌تواند شناسه خودش را بفرستد */
export function newId(provided?: string | null): string {
  if (provided && /^[0-9a-zA-Z_-]{8,64}$/.test(provided)) return provided;
  return randomUUID();
}

/** تاریخ کاری به شکل YYYY-MM-DD در منطقه زمانی مزرعه */
export function todayIso(timeZone = "Asia/Tehran"): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
