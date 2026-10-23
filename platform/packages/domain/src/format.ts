/* قالب‌بندی اعداد، تومان و درصد */

const faNumFmt = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 0 });
const faDecFmt = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 1 });
const faTwoDecFmt = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 2 });

export function num(n: number | null | undefined, decimals = 0): string {
  if (n === null || n === undefined || !isFinite(n)) return "—";
  const fmt = decimals === 0 ? faNumFmt : decimals === 1 ? faDecFmt : faTwoDecFmt;
  return fmt.format(n);
}

export function toman(n: number | null | undefined, decimals = 0): string {
  if (n === null || n === undefined || !isFinite(n)) return "—";
  return `${num(n, decimals)} تومان`;
}

/** خلاصه‌سازی مبالغ بزرگ برای کارت‌های آماری */
export function compactToman(n: number | null | undefined): string {
  if (n === null || n === undefined || !isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${num(n / 1_000_000_000, 1)} میلیارد تومان`;
  if (abs >= 1_000_000) return `${num(n / 1_000_000, 1)} میلیون تومان`;
  if (abs >= 1_000) return `${num(n / 1_000, 0)} هزار تومان`;
  return `${num(n)} تومان`;
}

/** عدد خلاصه بدون واحد */
export function compactNum(n: number | null | undefined): string {
  if (n === null || n === undefined || !isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${num(n / 1_000_000, 1)} م`;
  if (abs >= 10_000) return `${num(n / 1_000, 0)} هـ`;
  return num(n);
}

export function pct(n: number | null | undefined, decimals = 1): string {
  if (n === null || n === undefined || !isFinite(n)) return "—";
  return `${num(n, decimals)}٪`;
}

export function signedPct(n: number | null | undefined, decimals = 1): string {
  if (n === null || n === undefined || !isFinite(n)) return "—";
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}${num(Math.abs(n), decimals)}٪`;
}

export function kg(n: number | null | undefined, decimals = 0): string {
  if (n === null || n === undefined || !isFinite(n)) return "—";
  return `${num(n, decimals)} کیلوگرم`;
}

export function gram(n: number | null | undefined): string {
  if (n === null || n === undefined || !isFinite(n)) return "—";
  return `${num(n)} گرم`;
}

export function parseNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return NaN;
  const cleaned = String(value)
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[,٬\s]/g, "")
    .replace(/٫/g, ".");
  if (cleaned === "") return NaN;
  return Number(cleaned);
}
