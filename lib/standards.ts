/* استاندارد مرجع رشد و مصرف دان جوجه گوشتی (نژاد راس ۳۰۸، مخلوط نر و ماده)
   مقادیر به‌صورت نقاط مرجع و درون‌یابی روزانه ارائه شده و برای مقایسه و هشدار استفاده می‌شود.
   منبع تقریبی: راهنمای مدیریت نژاد راس ۳۰۸ (Aviagen) */

export type StdPoint = { day: number; weightG: number; cumFeedG: number };

export const STANDARD_ANCHORS: StdPoint[] = [
  { day: 1, weightG: 45, cumFeedG: 13 },
  { day: 7, weightG: 185, cumFeedG: 155 },
  { day: 14, weightG: 470, cumFeedG: 580 },
  { day: 21, weightG: 940, cumFeedG: 1340 },
  { day: 28, weightG: 1530, cumFeedG: 2320 },
  { day: 35, weightG: 2210, cumFeedG: 3500 },
  { day: 42, weightG: 2880, cumFeedG: 4900 },
  { day: 49, weightG: 3450, cumFeedG: 6400 },
];

export interface StdDay {
  day: number;
  weightG: number;
  cumFeedG: number;
  dailyFeedG: number;
  fcr: number;
}

/** درون‌یابی هموار مونوتون (PCHIP) برای جلوگیری از پرش ناگهانی در منحنی روزانه */
function pchip(xs: number[], ys: number[], x: number): number {
  const n = xs.length;
  if (x <= xs[0]) return ys[0];
  if (x >= xs[n - 1]) return ys[n - 1];

  const h: number[] = [];
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    h.push(xs[i + 1] - xs[i]);
    d.push((ys[i + 1] - ys[i]) / h[i]);
  }
  const m: number[] = new Array(n).fill(0);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) {
      m[i] = 0;
    } else {
      const w1 = 2 * h[i] + h[i - 1];
      const w2 = h[i] + 2 * h[i - 1];
      m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
    }
  }

  let k = 0;
  while (k < n - 2 && x > xs[k + 1]) k++;
  const t = (x - xs[k]) / h[k];
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  return h00 * ys[k] + h10 * h[k] * m[k] + h01 * ys[k + 1] + h11 * h[k] * m[k + 1];
}

const XS = STANDARD_ANCHORS.map((a) => a.day);
const WS = STANDARD_ANCHORS.map((a) => a.weightG);
const CS = STANDARD_ANCHORS.map((a) => a.cumFeedG);

function interpolate(day: number, key: "weightG" | "cumFeedG"): number {
  const d = Math.max(1, Math.min(49, day));
  return pchip(XS, key === "weightG" ? WS : CS, d);
}

export const MAX_STANDARD_DAY = 49;

export const STANDARDS: StdDay[] = (() => {
  const out: StdDay[] = [];
  for (let day = 1; day <= MAX_STANDARD_DAY; day++) {
    const w = interpolate(day, "weightG");
    const cum = interpolate(day, "cumFeedG");
    const prevCum = day === 1 ? 0 : interpolate(day - 1, "cumFeedG");
    out.push({
      day,
      weightG: Math.round(w),
      cumFeedG: Math.round(cum),
      dailyFeedG: Math.round(cum - prevCum),
      fcr: Number((cum / w).toFixed(3)),
    });
  }
  return out;
})();

export function standardAt(day: number): StdDay {
  const d = Math.max(1, Math.min(MAX_STANDARD_DAY, Math.round(day)));
  return STANDARDS[d - 1];
}

export function standardWeightG(day: number): number {
  return standardAt(day).weightG;
}

export function standardCumFeedG(day: number): number {
  return standardAt(day).cumFeedG;
}

export const FEED_PROGRAM = [
  { name: "دان آغازین", fromDay: 1, toDay: 10, color: "#f0b429" },
  { name: "دان رشد", fromDay: 11, toDay: 24, color: "#1e8a5f" },
  { name: "دان پایانی", fromDay: 25, toDay: 49, color: "#2c6e9b" },
];

export function feedPhaseForDay(day: number): string {
  const p = FEED_PROGRAM.find((f) => day >= f.fromDay && day <= f.toDay);
  return p ? p.name : "دان پایانی";
}
