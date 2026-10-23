/** تبدیل مقادیر numeric دیتابیس (رشته) به عدد با پیش‌فرض امن */
export function n(value: unknown, fallback = 0): number {
  if (value === null || value === undefined) return fallback;
  const v = typeof value === "number" ? value : Number(value);
  return Number.isFinite(v) ? v : fallback;
}

export function nOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const v = typeof value === "number" ? value : Number(value);
  return Number.isFinite(v) ? v : null;
}

/** تاریخ از دیتابیس: ممکن است Date یا رشته باشد */
export function isoDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

export function isoDateTime(value: unknown): string {
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}

export function money(value: unknown): number {
  return Math.round(n(value));
}
