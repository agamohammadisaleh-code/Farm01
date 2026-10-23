/* قالب‌بندی فارسی — همه از بسته دامنه می‌آید تا موبایل، وب و PDF یک عدد را
   یک‌جور نشان دهند. واحد پول «تومان» است و مبالغ در پایگاه‌داده هم تومان
   ذخیره می‌شوند (`numeric(14,0)`)، پس تبدیل واحدی انجام نمی‌شود. */

import {
  compactToman,
  formatJalali,
  formatJalaliLong,
  num,
  parseNumber,
  pct as domainPct,
  todayIso,
  weekdayFa,
} from "@farm/domain";

export const fa = (value: number | null | undefined, decimals = 0): string => num(value, decimals);

export const percent = (value: number | null | undefined, decimals = 1): string => domainPct(value, decimals);

export const toman = (value: number | null | undefined, decimals = 0): string => `${num(value, decimals)} تومان`;

export const tomanCompact = (value: number | null | undefined): string => compactToman(value);

export const perKg = (value: number | null | undefined): string => `${num(value)} تومان/کیلو`;

/** وزن: زیر یک کیلوگرم، گرم؛ بالای آن، کیلوگرم — همان چیزی که مرغدار می‌گوید */
export const weight = (grams: number | null | undefined): { value: string; unit: string } => {
  if (grams === null || grams === undefined || !isFinite(grams)) return { value: "—", unit: "" };
  if (grams < 1000) return { value: num(grams), unit: "گرم" };
  return { value: num(grams / 1000, 2), unit: "کیلوگرم" };
};

export const weightText = (grams: number | null | undefined): string => {
  const w = weight(grams);
  return w.unit ? `${w.value} ${w.unit}` : w.value;
};

export const kgText = (value: number | null | undefined, decimals = 0): string => `${num(value, decimals)} کیلوگرم`;

export const literText = (value: number | null | undefined, decimals = 0): string => `${num(value, decimals)} لیتر`;

export const jalali = (iso: string | null | undefined): string => (iso ? formatJalali(iso) : "—");

export const jalaliLong = (iso: string | null | undefined): string => (iso ? formatJalaliLong(iso) : "—");

export const jalaliWithWeekday = (iso: string | null | undefined): string =>
  iso ? `${weekdayFa(iso)} ${formatJalali(iso)}` : "—";

/** ورودی کاربر: «۱۸۰» یا «180» یا «۲٬۴۰۰» → عدد. مقدار نامعتبر → null */
export const toNumber = (raw: string): number | null => {
  const parsed = parseNumber(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

export const dayLabel = (day: number): string => `روز ${num(day)}`;

/** تاریخ امروز به وقت مزرعه (ISO) — همان چیزی که API انتظار دارد */
export { todayIso };
