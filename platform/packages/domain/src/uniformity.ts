import type { WeightSample } from "./types";

/**
 * یکنواختی گله از روی نمونه وزن.
 *
 * تعریف صنعتی: یکنواختی = درصد قطعه‌هایی که وزنشان در بازه ±۱۰٪ میانگین است.
 * اگر توزیع وزن را نرمال بگیریم، این نسبت از ضریب تغییرات (CV) به دست می‌آید:
 *
 *     CV = σ / μ        →   z = 0.10 × μ / σ = 0.10 / CV
 *     uniformity = 2Φ(z) − 1
 *
 * یعنی CV = ۱۰٪ معادل یکنواختی ۶۸٪ و CV = ۸٪ معادل ۷۹٪ است؛ همین رابطه
 * است که در فارم‌ها «CV پایین‌تر = گله یکنواخت‌تر» خوانده می‌شود.
 */

/** تقریب تابع توزیع تجمعی نرمال استاندارد (Abramowitz & Stegun 7.1.26) */
export function normalCdf(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const poly =
    t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = sign * (1 - poly * Math.exp(-x * x));
  return 0.5 * (1 + erf);
}

/** یکنواختی (٪) از ضریب تغییرات (٪) */
export function uniformityFromCv(cvPct: number): number {
  if (!Number.isFinite(cvPct) || cvPct <= 0) return 100;
  const z = 0.1 / (cvPct / 100);
  return clamp(200 * normalCdf(z) - 100, 0, 100);
}

/** ضریب تغییرات (٪) از یکنواختی (٪) — برای وقتی ترازو یکنواختی می‌دهد */
export function cvFromUniformity(uniformityPct: number): number {
  const target = clamp(uniformityPct, 0.01, 99.99); // درصد
  // وارون تقریب: جست‌وجوی دودویی روی رابطه یکنوا
  let lo = 0.1;
  let hi = 200;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    // یکنواختی با افزایش CV کم می‌شود؛ برای رسیدن به هدف، جهت جست‌وجو معکوس است
    if (uniformityFromCv(mid) > target) lo = mid;
    else hi = mid;
  }
  return round((lo + hi) / 2, 2);
}

/**
 * برآورد ضریب تغییرات از حداقل/حداکثر نمونه.
 * قاعده دامنه: برای توزیع نرمال، دامنه ≈ ۴σ پس σ ≈ (max − min) / 4.
 */
export function estimateCvFromRange(minGr: number | null, maxGr: number | null, meanGr: number): number | null {
  if (!minGr || !maxGr || !meanGr || maxGr <= minGr) return null;
  return round(((maxGr - minGr) / 4 / meanGr) * 100, 2);
}

export interface UniformityResult {
  cvPct: number | null;
  uniformityPct: number | null;
  /** منبع عدد: اندازه‌گیری مستقیم ترازو، یا برآورد از دامنه وزن */
  source: "measured" | "range" | null;
}

/** یکنواختی یک نمونه وزن، با اولویت مقدار ثبت‌شده */
export function sampleUniformity(sample: WeightSample): UniformityResult {
  const cv = num(sample.cv_pct);
  const uniformity = num(sample.uniformity_pct);

  if (uniformity != null) {
    return { uniformityPct: round(clamp(uniformity, 0, 100), 1), cvPct: cv ?? cvFromUniformity(uniformity), source: "measured" };
  }
  if (cv != null) {
    return { uniformityPct: round(uniformityFromCv(cv), 1), cvPct: cv, source: "measured" };
  }
  const estimated = estimateCvFromRange(num(sample.min_weight_gr), num(sample.max_weight_gr), sample.avg_weight_gr);
  if (estimated != null) {
    return { uniformityPct: round(uniformityFromCv(estimated), 1), cvPct: estimated, source: "range" };
  }
  return { cvPct: null, uniformityPct: null, source: null };
}

/**
 * ارزیابی یکنواختی در برابر استاندارد.
 * آستانه‌ها بر پایه توصیه رایج فارم‌های گوشتی: بالای ۸۰٪ خوب، ۷۰–۸۰ متوسط.
 */
export function uniformityVerdict(uniformityPct: number | null): "good" | "fair" | "poor" | "unknown" {
  if (uniformityPct == null) return "unknown";
  if (uniformityPct >= 80) return "good";
  if (uniformityPct >= 70) return "fair";
  return "poor";
}

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : null;
};
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round = (v: number, digits: number) => {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
};
