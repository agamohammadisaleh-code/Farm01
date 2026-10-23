/* تبدیل تاریخ شمسی/میلادی و ابزارهای تاریخ */

export const JALALI_MONTHS = [
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند",
];

export const WEEK_DAYS = [
  "یکشنبه",
  "دوشنبه",
  "سه‌شنبه",
  "چهارشنبه",
  "پنجشنبه",
  "جمعه",
  "شنبه",
];

export type Jalali = { jy: number; jm: number; jd: number };

function div(a: number, b: number) {
  return Math.floor(a / b);
}

export function toJalali(gy: number, gm: number, gd: number): Jalali {
  const gDaysInMonth = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  let jy = gy <= 1600 ? 0 : 979;
  let y = gy <= 1600 ? gy - 621 : gy - 1600;
  const gy2 = gm > 2 ? y + 1 : y;
  let days =
    365 * y +
    div(gy2 + 3, 4) -
    div(gy2 + 99, 100) +
    div(gy2 + 399, 400) -
    80 +
    gd +
    gDaysInMonth[gm - 1];
  jy += 33 * div(days, 12053);
  days %= 12053;
  jy += 4 * div(days, 1461);
  days %= 1461;
  if (days > 365) {
    jy += div(days - 1, 365);
    days = (days - 1) % 365;
  }
  const jm = days < 186 ? 1 + div(days, 31) : 7 + div(days - 186, 30);
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
  return { jy, jm, jd };
}

export function toGregorian(jy: number, jm: number, jd: number) {
  let gy = jy <= 979 ? 621 : 1600;
  let y = jy <= 979 ? jy : jy - 979;
  let days =
    365 * y +
    div(y, 33) * 8 +
    div((y % 33) + 3, 4) +
    78 +
    jd +
    (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
  gy += 400 * div(days, 146097);
  days %= 146097;
  if (days > 36524) {
    gy += 100 * div(days, 36524);
    days %= 36524;
    if (days >= 365) days++;
  }
  gy += 4 * div(days, 1461);
  days %= 1461;
  if (days > 365) {
    gy += div(days - 1, 365);
    days = (days - 1) % 365;
  }
  let gd = days + 1;
  const isLeap = (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0;
  const monthDays = [0, 31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 1;
  while (gm <= 12 && gd > monthDays[gm]) {
    gd -= monthDays[gm];
    gm++;
  }
  return { gy, gm, gd };
}

export function jalaliMonthLength(jy: number, jm: number) {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  // اسفند: ۲۹ یا ۳۰ روزه
  const start = toGregorian(jy, 12, 1);
  const next = toGregorian(jy + 1, 1, 1);
  const d1 = Date.UTC(start.gy, start.gm - 1, start.gd);
  const d2 = Date.UTC(next.gy, next.gm - 1, next.gd);
  return Math.round((d2 - d1) / 86400000);
}

export function pad2(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

export function isoToJalali(iso: string): Jalali {
  const [y, m, d] = iso.split("-").map(Number);
  return toJalali(y, m, d);
}

export function jalaliToIso(jy: number, jm: number, jd: number): string {
  const g = toGregorian(jy, jm, jd);
  return `${g.gy}-${pad2(g.gm)}-${pad2(g.gd)}`;
}

/** منطقه زمانی مزرعه (پیش‌فرض: ایران) — مبنای «امروز» در کل سامانه */
export const FARM_TIMEZONE = process.env.FARM_TIMEZONE || "Asia/Tehran";

/** تاریخ امروز به میلادی ISO در منطقه زمانی مزرعه (نه ساعت سرور) */
export function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: FARM_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** ساعت محلی مزرعه به شکل ۱۴:۰۵ */
export function nowTimeFa(): string {
  return new Intl.DateTimeFormat("fa-IR", {
    timeZone: FARM_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
}

export function isoDaysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

const FA_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

export function faDigits(input: string | number): string {
  return String(input)
    .replace(/\d/g, (d) => FA_DIGITS[Number(d)])
    .replace(/\./g, "٫");
}

/** تاریخ شمسی به شکل ۱۴۰۴/۰۵/۰۱ */
export function formatJalali(iso: string): string {
  if (!iso) return "—";
  const { jy, jm, jd } = isoToJalali(iso);
  return faDigits(`${jy}/${pad2(jm)}/${pad2(jd)}`);
}

/** تاریخ شمسی خوانا: ۱ مرداد ۱۴۰۴ */
export function formatJalaliLong(iso: string): string {
  if (!iso) return "—";
  const { jy, jm, jd } = isoToJalali(iso);
  return `${faDigits(jd)} ${JALALI_MONTHS[jm - 1]} ${faDigits(jy)}`;
}

export function weekdayFa(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return WEEK_DAYS[wd];
}

export function todayJalaliLong(): string {
  const iso = todayIso();
  return `${weekdayFa(iso)} ${formatJalaliLong(iso)}`;
}

export function jalaliYearOptions(center = isoToJalali(todayIso()).jy) {
  const out: number[] = [];
  for (let y = center + 1; y >= center - 6; y--) out.push(y);
  return out;
}
