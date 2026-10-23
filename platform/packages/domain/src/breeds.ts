/* منحنی‌های مرجع رشد نژادهای رایج گوشتی.

   چرا جدا از `standards.ts`؟ چون `standards.ts` مرجع مقایسه و هشدار «وزن
   عقب‌تر از استاندارد» است و باید ثابت بماند؛ اما پیش‌بینی وزن پایان دوره و
   تاریخ بارگیری باید با منحنی همان نژادی انجام شود که در گله ثبت شده —
   وگرنه گله کاب ۵۰۰ همیشه کمی «عقب» دیده می‌شود و گله هابارد کمی «جلو».

   مقادیر، نقاط مرجع راهنمای مدیریت نژادها (مخلوط نر و ماده، as-hatched) است
   و با همان درون‌یابی هموار روزانه می‌شود. این‌ها مرجع برنامه‌ریزی‌اند، نه
   جایگزین وزن‌گیری واقعی: هر جا وزن واقعی باشد، همان مبنا قرار می‌گیرد. */

import { type StdDay, type StdPoint, MAX_STANDARD_DAY, smoothInterpolate } from "./standards";

export interface BreedCurve {
  /** کلید پایدار برای ذخیره‌سازی و API */
  key: string;
  /** نام فارسی رسمی */
  nameFa: string;
  /** نام انگلیسی برای جست‌وجو */
  nameEn: string;
  /** همه‌ی نام‌هایی که کاربر ممکن است در گفتار یا فرم وارد کند */
  aliases: string[];
  /** سن پیش‌فرض بارگیری (روز) در صورت نبود وزن هدف */
  targetAgeDays: number;
  anchors: StdPoint[];
  /** یادداشت کوتاه برای نمایش کنار پیش‌بینی */
  note: string;
}

export const BREEDS: BreedCurve[] = [
  {
    key: "ross308",
    nameFa: "راس ۳۰۸",
    nameEn: "Ross 308",
    aliases: ["راس", "راس308", "راس ۳۰۸", "ross", "ross308", "ross 308"],
    targetAgeDays: 42,
    anchors: [
      { day: 1, weightG: 45, cumFeedG: 13 },
      { day: 7, weightG: 185, cumFeedG: 155 },
      { day: 14, weightG: 470, cumFeedG: 580 },
      { day: 21, weightG: 940, cumFeedG: 1340 },
      { day: 28, weightG: 1530, cumFeedG: 2320 },
      { day: 35, weightG: 2210, cumFeedG: 3500 },
      { day: 42, weightG: 2880, cumFeedG: 4900 },
      { day: 49, weightG: 3450, cumFeedG: 6400 },
    ],
    note: "منحنی رسمی راس ۳۰۸؛ همان مرجع پیش‌فرض سیستم.",
  },
  {
    key: "cobb500",
    nameFa: "کاب ۵۰۰",
    nameEn: "Cobb 500",
    aliases: ["کاب", "کاب500", "کاب ۵۰۰", "cobb", "cobb500", "cobb 500"],
    targetAgeDays: 42,
    anchors: [
      { day: 1, weightG: 42, cumFeedG: 13 },
      { day: 7, weightG: 180, cumFeedG: 150 },
      { day: 14, weightG: 465, cumFeedG: 570 },
      { day: 21, weightG: 930, cumFeedG: 1330 },
      { day: 28, weightG: 1520, cumFeedG: 2290 },
      { day: 35, weightG: 2160, cumFeedG: 3410 },
      { day: 42, weightG: 2820, cumFeedG: 4800 },
      { day: 49, weightG: 3400, cumFeedG: 6250 },
    ],
    note: "کاب ۵۰۰ کمی دیرتر از راس به وزن هدف می‌رسد؛ تاریخ بارگیری چند روز عقب‌تر می‌افتد.",
  },
  {
    key: "hubbard",
    nameFa: "هابارد",
    nameEn: "Hubbard",
    aliases: ["هابارد", "hubbard", "هابورد", "hubbard flex"],
    targetAgeDays: 42,
    anchors: [
      { day: 1, weightG: 44, cumFeedG: 13 },
      { day: 7, weightG: 178, cumFeedG: 152 },
      { day: 14, weightG: 458, cumFeedG: 565 },
      { day: 21, weightG: 918, cumFeedG: 1320 },
      { day: 28, weightG: 1500, cumFeedG: 2280 },
      { day: 35, weightG: 2140, cumFeedG: 3390 },
      { day: 42, weightG: 2800, cumFeedG: 4760 },
      { day: 49, weightG: 3370, cumFeedG: 6200 },
    ],
    note: "هابارد رشد آغازین کمی کندتر و رشد پایانی پایدارتری دارد.",
  },
  {
    key: "arboracres",
    nameFa: "آربور ایکرز",
    nameEn: "Arbor Acres",
    aliases: ["آربور", "اربر ایکرز", "آربور ایکرز", "arbor", "arbor acres", "arboracres"],
    targetAgeDays: 42,
    anchors: [
      { day: 1, weightG: 43, cumFeedG: 13 },
      { day: 7, weightG: 184, cumFeedG: 154 },
      { day: 14, weightG: 474, cumFeedG: 578 },
      { day: 21, weightG: 948, cumFeedG: 1338 },
      { day: 28, weightG: 1545, cumFeedG: 2315 },
      { day: 35, weightG: 2195, cumFeedG: 3480 },
      { day: 42, weightG: 2855, cumFeedG: 4870 },
      { day: 49, weightG: 3430, cumFeedG: 6370 },
    ],
    note: "آربور ایکرز تقریباً هم‌تراز راس است، با مصرف دان آغازین کمی بیشتر.",
  },
];

export const DEFAULT_BREED_KEY = "ross308";

/** تبدیل ارقام فارسی/عربی به لاتین و یکسان‌سازی فاصله‌ها و خط تیره */
function normalize(input: string): string {
  return input
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/\u200c/g, " ")
    .replace(/[-_.]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function breedByKey(key: string): BreedCurve | undefined {
  const k = normalize(key);
  return BREEDS.find((b) => normalize(b.key) === k);
}

export interface BreedResolution {
  breed: BreedCurve;
  /** آیا نام وارد‌شده به نژاد شناخته‌شده نگاشت شد؟ */
  matched: boolean;
  note: string;
}

/**
 * نگاشت آزادِ نام نژاد (فارسی، انگلیسی، با یا بدون فاصله) به منحنی رسمی.
 *
 * نژاد ناشناخته خطا نیست: پیش‌فرض راس ۳۰۸ استفاده می‌شود و در یادداشت
 * صریح گفته می‌شود که این پیش‌فرض است، نه تشخیص. کاربر باید بداند عدد از
 * کدام منحنی آمده.
 */
export function resolveBreed(input?: string | null): BreedResolution {
  const raw = (input ?? "").trim();
  if (!raw) {
    const breed = breedByKey(DEFAULT_BREED_KEY)!;
    return { breed, matched: true, note: `نژادی ثبت نشده؛ منحنی پیش‌فرض ${breed.nameFa} استفاده شد.` };
  }
  const n = normalize(raw);
  const exact = BREEDS.find((b) => normalize(b.nameFa) === n || normalize(b.nameEn) === n || normalize(b.key) === n);
  if (exact) return { breed: exact, matched: true, note: `منحنی ${exact.nameFa} به کار رفت.` };

  const partial = BREEDS.find((b) => b.aliases.some((a) => normalize(a) === n));
  if (partial) return { breed: partial, matched: true, note: `منحنی ${partial.nameFa} به کار رفت.` };

  const loose = BREEDS.find((b) => n.includes(normalize(b.nameEn)) || normalize(b.nameFa).split(" ").some((t) => t.length > 2 && n.includes(t)));
  if (loose) return { breed: loose, matched: true, note: `نزدیک‌ترین منحنی شناخته‌شده: ${loose.nameFa}.` };

  const fallback = breedByKey(DEFAULT_BREED_KEY)!;
  return {
    breed: fallback,
    matched: false,
    note: `نژاد «${raw}» در منحنی‌های موجود نیست؛ منحنی ${fallback.nameFa} به‌عنوان پیش‌فرض به کار رفت.`,
  };
}

export interface BreedStandard extends StdDay {
  breedKey: string;
}

const cache = new Map<string, BreedStandard[]>();

/** منحنی روزانه نژاد (روز ۱ تا ۴۹) با درون‌یابی هموار و مشتق مصرف دان */
export function breedStandards(breed: BreedCurve): BreedStandard[] {
  const hit = cache.get(breed.key);
  if (hit) return hit;

  const xs = breed.anchors.map((a) => a.day);
  const ws = breed.anchors.map((a) => a.weightG);
  const cs = breed.anchors.map((a) => a.cumFeedG);

  const at = (day: number, series: number[]) => smoothInterpolate(xs, series, Math.max(1, Math.min(MAX_STANDARD_DAY, day)));

  const out: BreedStandard[] = [];
  for (let day = 1; day <= MAX_STANDARD_DAY; day++) {
    const w = at(day, ws);
    const cum = at(day, cs);
    const prevCum = day === 1 ? 0 : at(day - 1, cs);
    out.push({
      breedKey: breed.key,
      day,
      weightG: Math.round(w),
      cumFeedG: Math.round(cum),
      dailyFeedG: Math.round(cum - prevCum),
      fcr: Number((cum / w).toFixed(3)),
    });
  }
  cache.set(breed.key, out);
  return out;
}

/** استاندارد نژاد در یک روز مشخص */
export function breedAt(breedInput: string | null | undefined, day: number): BreedStandard {
  const { breed } = resolveBreed(breedInput);
  const list = breedStandards(breed);
  const d = Math.max(1, Math.min(MAX_STANDARD_DAY, Math.round(day)));
  return list[d - 1];
}

/** وزن استاندارد نژاد (گرم) */
export function breedWeightAt(breedInput: string | null | undefined, day: number): number {
  return breedAt(breedInput, day).weightG;
}

/**
 * سن رسیدن به وزن هدف روی منحنی نژاد.
 * خروجی: روز (۱..۴۹) و وزن واقعی همان روز؛ اگر هدف از سقف منحنی بالاتر باشد،
 * سقف برگردانده می‌شود تا عدد غیرواقعی ساخته نشود.
 */
export function ageAtWeight(breedInput: string | null | undefined, targetWeightG: number): { day: number; weightG: number; reached: boolean } {
  const list = breedStandards(resolveBreed(breedInput).breed);
  for (const point of list) {
    if (point.weightG >= targetWeightG) return { day: point.day, weightG: point.weightG, reached: true };
  }
  const last = list[list.length - 1];
  return { day: last.day, weightG: last.weightG, reached: false };
}

/** نژاد با کلید پایدار (برای ذخیره در تنظیمات) */
export function breedStandardByKey(key: string): BreedCurve | undefined {
  return breedByKey(key);
}

/** فهرست کوتاه نژادها برای پر کردن فرم‌های کلاینت */
export function breedOptions(): { key: string; label: string }[] {
  return BREEDS.map((b) => ({ key: b.key, label: b.nameFa }));
}
