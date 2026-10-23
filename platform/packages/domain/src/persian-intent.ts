/* دستیار فارسی: تبدیل جمله محاوره‌ای کشاورز به یک درخواست ساختاریافته.

   چرا در بسته دامنه و بدون مدل زبانی؟
   ۱. **آفلاین**: موبایل در سالن مرغداری اینترنت ندارد؛ باید همان‌جا کار کند.
   ۲. **قابل آزمون**: هر قاعده با یک جمله و یک خروجی ثابت سنجیده می‌شود.
   ۳. **بی‌خطر**: پارسر فقط «پیشنهاد» می‌سازد؛ هیچ‌چیز بی‌تأیید کاربر ثبت نمی‌شود.

   این ماژول هیچ وابستگی بیرونی ندارد و فقط رشته می‌گیرد و شیء می‌دهد. تشخیص
   گفتار (صوت → متن) جای دیگری انجام می‌شود و نتیجه‌اش به همین تابع می‌رسد.
*/

import { todayIso, jalaliToIso, isoToJalali } from "./jalali";

export type AssistantIntent =
  | "log_daily"
  | "add_weight"
  | "add_expense"
  | "add_sale"
  | "query_water"
  | "query_feed"
  | "query_loading"
  | "query_metrics"
  | "help"
  | "unknown";

export interface IntentEntities {
  date?: string;
  dateLabel?: string;
  mortality?: number;
  cull?: number;
  feedKg?: number;
  waterLiter?: number;
  avgTemp?: number;
  weightGr?: number;
  sampleCount?: number;
  amountRial?: number;
  category?: string;
  description?: string;
  totalWeightKg?: number;
  pricePerKg?: number;
  buyer?: string;
  feedType?: string;
  quantity?: number;
  notes?: string;
  flockHint?: string;
}

export interface AssistantParseResult {
  intent: AssistantIntent;
  /** ۰ تا ۱ — بر پایه تعداد نشانه‌های صریح و کامل بودن فیلدهای لازم */
  confidence: number;
  entities: IntentEntities;
  /** کلید فیلدهای لازم که پیدا نشد */
  missing: string[];
  /** نام فارسی همان فیلدها، برای پرسیدن از کاربر */
  questions: string[];
  /** جمله‌ای که به کاربر نشان داده می‌شود */
  reply: string;
  /** آیا پیش از اجرا باید تأیید شود؟ (ثبت داده: همیشه بله) */
  requiresConfirm: boolean;
  normalized: string;
  raw: string;
}

/* ------------------------------ یکسان‌سازی متن ------------------------------ */

const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/** ارقام فارسی/عربی → لاتین، حروف عربی → فارسی، نیم‌فاصله → فاصله */
export function normalizePersian(input: string): string {
  return input
    .replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)))
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[ۀة]/g, "ه")
    .replace(/\u200c|\u200f|\u200e/g, " ")
    .replace(/[٫،]/g, (m) => (m === "٫" ? "." : "،"))
    .replace(/\u0640/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** ارقام لاتین → فارسی (برای نمایش در پاسخ) */
export function faNum(value: number | string): string {
  return String(value).replace(/\d/g, (d) => FA_DIGITS[Number(d)]);
}

/* -------------------------------- عدد با حروف -------------------------------- */

const WORD_VALUES: Record<string, number> = {
  صفر: 0, یک: 1, دو: 2, سه: 3, چهار: 4, پنج: 5, شش: 6, هفت: 7, هشت: 8, نه: 9, ده: 10,
  یازده: 11, دوازده: 12, سیزده: 13, چهارده: 14, پانزده: 15, شانزده: 16, هفده: 17, هجده: 18, نوزده: 19,
  بیست: 20, سی: 30, چهل: 40, پنجاه: 50, شصت: 60, هفتاد: 70, هشتاد: 80, نود: 90,
  صد: 100, یکصد: 100, دویست: 200, سیصد: 300, چهارصد: 400, پانصد: 500, ششصد: 600, هفتصد: 700, هشتصد: 800, نهصد: 900,
};

const SCALES: Record<string, number> = { هزار: 1_000, میلیون: 1_000_000, میلیارد: 1_000_000_000 };

function evalNumberWords(tokens: string[]): number | null {
  let total = 0;
  let current = 0;
  let seen = false;
  for (const token of tokens) {
    if (token === "و") continue;
    if (token in WORD_VALUES) {
      current += WORD_VALUES[token];
      seen = true;
    } else if (token in SCALES) {
      total += (current || 1) * SCALES[token];
      current = 0;
      seen = true;
    } else {
      return null;
    }
  }
  return seen ? total + current : null;
}

/**
 * «دویست و پنجاه هزار» → «250000»
 * عددهای نوشتاری در گفتار خیلی رایج‌اند (کاربر به‌ندرت می‌گوید «۲۵۰»).
 * فقط بازه‌های عددی کامل تبدیل می‌شوند؛ بقیه متن دست‌نخورده می‌ماند.
 */
export function expandNumberWords(input: string): string {
  const tokens = input.split(" ");
  const out: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    let j = i;
    const run: string[] = [];
    while (j < tokens.length && (tokens[j] in WORD_VALUES || tokens[j] in SCALES || (tokens[j] === "و" && run.length > 0))) {
      run.push(tokens[j]);
      j++;
    }
    while (run.length && run[run.length - 1] === "و") run.pop();
    const value = run.length ? evalNumberWords(run) : null;
    // «میلیون» یا «هزار» تنها (بدون عدد پیش از خود) عدد نیست؛ وگرنه
    // جمله «۴ میلیون تومان» به «4 1000000 تومان» تبدیل می‌شد.
    const startsWithScale = run.length > 0 && run[0] in SCALES;
    if (value !== null && !startsWithScale && run.some((t) => t in WORD_VALUES)) {
      // حتی عدد یک‌کلمه‌ای هم عدد است: «دو تن فروختم» یعنی ۲۰۰۰ کیلوگرم.
      out.push(String(value));
      i = j;
    } else {
      out.push(tokens[i]);
      i++;
    }
  }
  return out.join(" ");
}

/* --------------------------------- تاریخ‌ها --------------------------------- */

const JALALI_MONTHS: Record<string, number> = {
  فروردین: 1, اردیبهشت: 2, خرداد: 3, تیر: 4, مرداد: 5, شهریور: 6,
  مهر: 7, آبان: 8, آذر: 9, دی: 10, بهمن: 11, اسفند: 12,
};

const RELATIVE_DAYS: { pattern: RegExp; days: number; label: string }[] = [
  { pattern: /(?:همین )?(?:امروز|امروزه)/, days: 0, label: "امروز" },
  { pattern: /دیروز/, days: 1, label: "دیروز" },
  { pattern: /پریروز|پری روز/, days: 2, label: "پریروز" },
];

function shift(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

interface DateHit {
  iso: string;
  label: string;
  matchedText: string;
}

/** تاریخ در جمله: نسبی (امروز/دیروز/۳ روز پیش) یا شمسی (۱۴۰۵/۰۸/۰۲ یا ۲ آبان) */
export function parsePersianDate(input: string, today = todayIso()): DateHit | null {
  // ورودی ممکن است خام باشد (ارقام فارسی)، پس همین‌جا یکسان‌سازی می‌کنیم
  const text = normalizePersian(input);
  for (const rel of RELATIVE_DAYS) {
    const m = rel.pattern.exec(text);
    if (m) return { iso: shift(today, rel.days), label: rel.label, matchedText: m[0] };
  }

  const relN = /(\d+)\s*(?:روز|روزه)\s*(?:پیش|قبل|گذشته)/.exec(text);
  if (relN) {
    const days = Number(relN[1]);
    return { iso: shift(today, days), label: `${Number(relN[1])} روز پیش`, matchedText: relN[0] };
  }

  const isoLike = /(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(text);
  if (isoLike) {
    const y = Number(isoLike[1]);
    const mo = Number(isoLike[2]);
    const d = Number(isoLike[3]);
    if (y > 1300 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      try {
        return { iso: jalaliToIso(y, mo, d), label: `${isoLike[1]}/${isoLike[2]}/${isoLike[3]}`, matchedText: isoLike[0] };
      } catch {
        /* تاریخ نامعتبر؛ ادامه می‌دهیم */
      }
    }
    if (y > 1900) {
      return { iso: `${isoLike[1]}-${isoLike[2].padStart(2, "0")}-${isoLike[3].padStart(2, "0")}`, label: isoLike[0], matchedText: isoLike[0] };
    }
  }

  const monthDay = new RegExp(`(\\d{1,2})\\s*(?:م|ام|اُم)?\\s*(${Object.keys(JALALI_MONTHS).join("|")})`).exec(text);
  if (monthDay) {
    const day = Number(monthDay[1]);
    const month = JALALI_MONTHS[monthDay[2]];
    const { jy } = isoToJalali(today);
    if (day >= 1 && day <= 31) {
      try {
        return { iso: jalaliToIso(jy, month, day), label: `${monthDay[1]} ${monthDay[2]}`, matchedText: monthDay[0] };
      } catch {
        /* ignore */
      }
    }
  }
  return null;
}

/* ---------------------------------- واحدها ---------------------------------- */

interface Measure {
  value: number;
  unit: "kg" | "gr" | "liter" | "ton" | "rial" | "tomans" | "celsius" | "count";
  raw: string;
}

const UNIT_PATTERNS: { unit: Measure["unit"]; scale: number; re: RegExp }[] = [
  { unit: "kg", scale: 1, re: /(\d+(?:\.\d+)?)\s*(?:کیلو\s?گرم|کیلوگرم|کیلو|کیلیو|kg)(?![آ-یA-Za-z])/ },
  { unit: "ton", scale: 1, re: /(\d+(?:\.\d+)?)\s*(?:تن)(?![آ-یA-Za-z])/ },
  { unit: "gr", scale: 1, re: /(\d+(?:\.\d+)?)\s*(?:گرم|گرمی|gr)(?![آ-یA-Za-z])/ },
  { unit: "liter", scale: 1, re: /(\d+(?:\.\d+)?)\s*(?:لیتر|لیتری|lit)(?![آ-یA-Za-z])/ },
  { unit: "celsius", scale: 1, re: /(\d+(?:\.\d+)?)\s*(?:درجه|سانتی\s?گراد|سلسیوس)/ },
];

function findMeasure(text: string, unit: Measure["unit"]): Measure | null {
  for (const p of UNIT_PATTERNS) {
    if (p.unit !== unit) continue;
    const m = p.re.exec(text);
    if (m) return { value: Number(m[1]) * p.scale, unit, raw: m[0] };
  }
  return null;
}

/** مبلغ ریالی از جمله: «۹۸ هزار تومان» → ۹۸۰٬۰۰۰ ریال */
function findMoney(text: string): Measure | null {
  const re = /(\d+(?:\.\d+)?)\s*(هزار|میلیون|میلیارد)?\s*(تومان|تومن|ریال|تومنی)/;
  const m = re.exec(text);
  if (!m) return null;
  let value = Number(m[1]);
  if (m[2] === "هزار") value *= 1_000;
  else if (m[2] === "میلیون") value *= 1_000_000;
  else if (m[2] === "میلیارد") value *= 1_000_000_000;
  const isToman = m[3] !== "ریال";
  return { value: Math.round(isToman ? value * 10 : value), unit: isToman ? "tomans" : "rial", raw: m[0] };
}

/* --------------------------------- نیّت‌ها --------------------------------- */

const INTENT_KEYWORDS: { intent: AssistantIntent; words: string[]; weight: number }[] = [
  { intent: "add_sale", words: ["فروختم", "فروش", "فروخته", "کشتارگاه", "بارگیری کردم", "تحویل دادم", "بار زدم"], weight: 3 },
  { intent: "add_weight", words: ["وزن", "وزن کردم", "توزین", "میانگین وزن", "نمونه گیری", "ترازو"], weight: 2 },
  { intent: "log_daily", words: ["تلفات", "تلف شد", "مرد", "مردار", "حذف", "دان", "خوراک", "غذا", "آب", "دما", "دمای", "گرمای", "ثبت کن", "ثبت روزانه"], weight: 2 },
  { intent: "add_expense", words: ["خریدم", "خرید", "هزینه", "پرداخت", "دادم", "صورتحساب", "فاکتور", "دارو", "واکسن", "جوجه", "کارگر", "گازوئیل"], weight: 2 },
  { intent: "query_water", words: ["آب", "مصرف آب"], weight: 1 },
  { intent: "query_feed", words: ["دان", "خوراک", "کنسانتره"], weight: 1 },
  { intent: "query_loading", words: ["بارگیری", "کی بفروشم", "چه زمانی بفروشم", "تاریخ فروش", "وزن نهایی", "کی بار"], weight: 2 },
  { intent: "query_metrics", words: ["وضعیت", "چطوره", "چقدر", "چند", "گزارش", "شاخص", "ضریب تبدیل", "سود", "تلفات کل"], weight: 1 },
];

function scoreIntents(text: string): { intent: AssistantIntent; score: number }[] {
  const scores = INTENT_KEYWORDS.map((entry) => {
    const hits = entry.words.filter((w) => text.includes(w)).length;
    return { intent: entry.intent, score: hits * entry.weight };
  });
  return scores.filter((s) => s.score > 0).sort((a, b) => b.score - a.score);
}

const QUESTION_MARK = /(\?|؟)|چقدر|چند|چیه|چه خبر|کی |کِی |آیا|بگو/;

function isQuestion(text: string): boolean {
  return QUESTION_MARK.test(text);
}

/* ------------------------------- استخراج فیلد ------------------------------- */

function numberAfterKeyword(text: string, keyword: RegExp, window = 18): number | null {
  const re = new RegExp(`(?:${keyword.source})[^\\d]{0,${window}}(\\d+(?:\\.\\d+)?)`);
  const m = re.exec(text);
  return m ? Number(m[1]) : null;
}

function numberBeforeKeyword(text: string, keyword: RegExp, window = 18): number | null {
  const re = new RegExp(`(\\d+(?:\\.\\d+)?)[^\\d]{0,${window}}(?:${keyword.source})`);
  const m = re.exec(text);
  return m ? Number(m[1]) : null;
}

const CATEGORY_WORDS: { category: string; label: string; words: string[] }[] = [
  { category: "chick", label: "جوجه یک‌روزه", words: ["جوجه"] },
  { category: "feed", label: "دان", words: ["دان", "خوراک", "کنسانتره", "ذرت", "سویا"] },
  { category: "medication", label: "دارو", words: ["دارو", "آنتی بیوتیک", "ویتامین", "مکمل"] },
  { category: "vaccine", label: "واکسن", words: ["واکسن", "واکسیناسیون"] },
  { category: "labor", label: "دستمزد", words: ["کارگر", "دستمزد", "حقوق"] },
  { category: "energy", label: "انرژی", words: ["برق", "گاز", "گازوئیل", "آب و برق", "سوخت"] },
  { category: "litter", label: "بستر", words: ["بستر", "خاک اره", "کاه", "پوسته"] },
  { category: "transport", label: "حمل و نقل", words: ["حمل", "کرایه", "باری"] },
  { category: "equipment", label: "تجهیزات", words: ["تجهیزات", "دستگاه", "دانخوری", "آبخوری"] },
];

const FEED_TYPE_WORDS = [
  { type: "دان آغازین", words: ["آغازین", "استارتر", "starter"] },
  { type: "دان رشد", words: ["رشد", "گروئر", "grower"] },
  { type: "دان پایانی", words: ["پایانی", "فینیشر", "finisher"] },
];

/* --------------------------------- پاسخ‌ها --------------------------------- */

const FIELD_LABELS: Record<string, string> = {
  mortality: "تعداد تلفات",
  feedKg: "مقدار دان (کیلوگرم)",
  waterLiter: "مقدار آب (لیتر)",
  weightGr: "میانگین وزن (گرم)",
  sampleCount: "تعداد نمونه",
  amountRial: "مبلغ هزینه",
  totalWeightKg: "وزن فروش (کیلوگرم)",
  pricePerKg: "قیمت هر کیلو",
  date: "تاریخ",
};

function askFor(missing: string[]): string {
  const labels = missing.map((m) => FIELD_LABELS[m] ?? m).join("، ");
  return `برای ثبت، این موارد را هم بگویید: ${labels}.`;
}

function money(rial: number): string {
  const short = (v: number) => faNum(String(Number(v.toFixed(2))));
  if (rial >= 1_000_000_000) return `${short(rial / 1_000_000_000)} میلیارد ریال`;
  if (rial >= 1_000_000) return `${short(rial / 1_000_000)} میلیون ریال`;
  if (rial >= 1_000) return `${short(rial / 1_000)} هزار ریال`;
  return `${faNum(rial)} ریال`;
}

/** گرد کردن اعتماد به دو رقم تا خروجی API تمیز بماند */
function conf(value: number): number {
  return Number(Math.min(0.98, Math.max(0, value)).toFixed(2));
}

function num(v: number): string {
  return faNum(Number.isInteger(v) ? String(v) : String(Number(v.toFixed(1))));
}

/* ------------------------------- تابع اصلی ------------------------------- */

export interface ParseOptions {
  /** تاریخ امروز به میلادی؛ برای آزمون قطعی تزریق می‌شود */
  today?: string;
  /** نام گله‌ای که کاربر در جمله گفته (اختیاری) */
  flocks?: { id: string; name: string }[];
}

export function parseAssistantText(raw: string, options: ParseOptions = {}): AssistantParseResult {
  const normalized = expandNumberWords(normalizePersian(raw));
  const text = normalized;
  const empty = (intent: AssistantIntent, reply: string): AssistantParseResult => ({
    intent,
    confidence: intent === "unknown" ? 0 : 0.2,
    entities: {},
    missing: [],
    questions: [],
    reply,
    requiresConfirm: false,
    normalized,
    raw,
  });

  if (!text) {
    return empty("unknown", "جمله‌ای نشنیدم. مثلاً بگویید «امروز ۱۲ تا تلف شد و ۹۰ کیلو دان خورد».");
  }

  const dateHit = parsePersianDate(text, options.today ?? todayIso());
  const entities: IntentEntities = {};
  if (dateHit) {
    entities.date = dateHit.iso;
    entities.dateLabel = faNum(dateHit.label);
  }

  /* گله: اگر نام گله در جمله آمده باشد، همان انتخاب می‌شود */
  if (options.flocks?.length) {
    const found = options.flocks.find((f) => f.name && text.includes(normalizePersian(f.name)));
    if (found) entities.flockHint = found.id;
  }

  const ranked = scoreIntents(text);
  const question = isQuestion(text);

  /* ---------------------------- پرسش‌ها (فقط خواندن) ---------------------------- */
  // در جمله پرسشی، فقط نیّت‌های خواندن رقابت می‌کنند؛ وگرنه «مصرف آب چطور
  // بوده؟» به‌خاطر کلیدواژه «آب» در ثبت روزانه می‌افتاد.
  if (question) {
    const queryOnly = scoreIntents(text).filter((r) =>
      ["query_water", "query_feed", "query_loading", "query_metrics"].includes(r.intent),
    );
    if (queryOnly.length) {
      const top = queryOnly[0].intent;
      const replies: Record<string, string> = {
        query_water: "مصرف آب را با میانگین سه روز قبل مقایسه می‌کنم و نتیجه را می‌گویم.",
        query_feed: "مصرف دان، موجودی انبار و روزهای باقی‌مانده را حساب می‌کنم.",
        query_loading: "تاریخ بهینه بارگیری را از روی منحنی رشد و قیمت‌های ثبت‌شده حساب می‌کنم.",
        query_metrics: "شاخص‌های گله (FCR، تلفات، قیمت تمام‌شده و سود) را می‌آورم.",
      };
      return { ...empty(top as AssistantIntent, replies[top]), confidence: 0.78, entities, requiresConfirm: false };
    }
    if (/تلف|مردار/.test(text)) {
      return { ...empty("query_metrics", "تلفات تجمعی و نرخ روزانه را حساب می‌کنم."), confidence: 0.6, entities, requiresConfirm: false };
    }
  }

  /* ------------------------------- ثبت روزانه ------------------------------- */
  const wantsLog = ranked.some((r) => r.intent === "log_daily") || /تلفات|دان|آب|دما/.test(text);

  if (wantsLog && !ranked.some((r) => r.intent === "add_sale" || r.intent === "add_expense" || r.intent === "add_weight")) {
    // «۱۲ تا تلف شد» رایج‌ترین شکل گفتار است؛ عدد پیش از فعل، نه بعدش.
    // (اگر اول سراغ «بعد از کلیدواژه» برویم، عدد بعدی جمله — مثلاً «۹۰ کیلو
    //  دان» — به‌اشتباه تلفات ثبت می‌شد.)
    const mortalityBefore = numberBeforeKeyword(text, /(?:تا|عدد|قطعه)?\s*(?:تلف|مرد)/);
    const mortalityAfter = numberAfterKeyword(text, /تلفات|تلفات روزانه|مردار/);
    const mortality = mortalityBefore ?? mortalityAfter;
    const cull = numberBeforeKeyword(text, /(?:تا|عدد|قطعه)?\s*حذف/) ?? numberAfterKeyword(text, /حذف/);

    const feed = findMeasure(text, "kg") ?? findMeasure(text, "ton");
    const water = findMeasure(text, "liter");
    const temp = findMeasure(text, "celsius");

    if (mortality !== null && /تلف|مرد/.test(text)) entities.mortality = Math.round(mortality);
    if (cull !== null) entities.cull = Math.round(cull);
    if (feed) entities.feedKg = feed.unit === "ton" ? feed.value * 1000 : feed.value;
    if (!feed) {
      const feedNum = numberAfterKeyword(text, /دان|خوراک|غذا/) ?? numberBeforeKeyword(text, /کیلو.*دان|دان/);
      if (feedNum !== null) entities.feedKg = feedNum;
    }
    if (water) entities.waterLiter = water.value;
    else {
      const w = numberAfterKeyword(text, /آب/) ?? numberBeforeKeyword(text, /لیتر.*آب/);
      if (w !== null) entities.waterLiter = w;
    }
    const t = temp?.value ?? numberAfterKeyword(text, /دما|دمای|گرمای/);
    if (t !== null && t !== undefined) entities.avgTemp = Math.round(t * 10) / 10;

    const feedType = FEED_TYPE_WORDS.find((f) => f.words.some((w) => text.includes(w)));
    if (feedType) entities.feedType = feedType.type;

    const missing: string[] = [];
    if (entities.mortality === undefined && entities.feedKg === undefined && entities.waterLiter === undefined && entities.avgTemp === undefined) {
      missing.push("mortality", "feedKg");
    }
    if (!entities.date) {
      entities.date = options.today ?? todayIso();
      entities.dateLabel = "امروز";
    }

    const parts: string[] = [];
    if (entities.mortality !== undefined) parts.push(`تلفات ${num(entities.mortality)} قطعه`);
    if (entities.cull) parts.push(`حذف ${num(entities.cull)} قطعه`);
    if (entities.feedKg !== undefined) parts.push(`دان ${num(entities.feedKg)} کیلوگرم`);
    if (entities.waterLiter !== undefined) parts.push(`آب ${num(entities.waterLiter)} لیتر`);
    if (entities.avgTemp !== undefined) parts.push(`دمای ${num(entities.avgTemp)} درجه`);

    const reply = missing.length
      ? `ثبت روزانه ${entities.dateLabel}: ${parts.join("، ") || "چیزی پیدا نکردم"}. ${askFor(missing)}`
      : `ثبت روزانه ${entities.dateLabel}: ${parts.join("، ")}. تأیید می‌کنید؟`;

    const fields = parts.length;
    return {
      intent: "log_daily",
      confidence: conf(0.35 + fields * 0.15 + (dateHit ? 0.1 : 0)),
      entities,
      missing,
      questions: missing.map((m) => `چند ${FIELD_LABELS[m] ?? m}؟`),
      reply,
      requiresConfirm: true,
      normalized,
      raw,
    };
  }

  /* --------------------------------- وزن‌گیری --------------------------------- */
  if (ranked.some((r) => r.intent === "add_weight")) {
    const weight = findMeasure(text, "kg");
    const gr = findMeasure(text, "gr");
    const weightGr = gr ? gr.value : weight ? weight.value * 1000 : numberAfterKeyword(text, /وزن|توزین/);
    const sampleCount =
      numberBeforeKeyword(text, /نمونه|قطعه|عدد/) ?? numberAfterKeyword(text, /نمونه/) ?? undefined;

    const missing: string[] = [];
    if (weightGr === null || weightGr === undefined) missing.push("weightGr");
    if (!entities.date) {
      entities.date = options.today ?? todayIso();
      entities.dateLabel = "امروز";
    }
    if (weightGr !== null && weightGr !== undefined) entities.weightGr = Math.round(weightGr);
    if (sampleCount !== null && sampleCount !== undefined) entities.sampleCount = Math.round(sampleCount);

    const reply = missing.length
      ? `وزن‌گیری را ثبت می‌کنم، اما ${askFor(missing)}`
      : `وزن‌گیری ${entities.dateLabel}: میانگین ${num(entities.weightGr!)} گرم${entities.sampleCount ? ` از ${num(entities.sampleCount)} نمونه` : ""}. تأیید می‌کنید؟`;

    return {
      intent: "add_weight",
      confidence: conf(missing.length ? 0.45 : 0.82),
      entities,
      missing,
      questions: missing.map((m) => `چند ${FIELD_LABELS[m] ?? m}؟`),
      reply,
      requiresConfirm: true,
      normalized,
      raw,
    };
  }

  /* ---------------------------------- فروش ---------------------------------- */
  if (ranked.some((r) => r.intent === "add_sale")) {
    // وزن فروش: «۱۵۰۰ کیلو» یا «۱٫۵ تن»
    const ton = findMeasure(text, "ton");
    const kg = findMeasure(text, "kg");
    const totalWeightKg = ton ? ton.value * 1000 : kg ? kg.value : numberAfterKeyword(text, /فروش|فروختم|بارگیری/);

    // قیمت هر کیلو: «کیلویی ۹۸ هزار تومان» باید ۹۸۰٬۰۰۰ ریال شود، نه ۹۸.
    // واحد پول بخشی از همین عبارت است، پس جدا از مبلغ کل خوانده می‌شود.
    let pricePerKg: number | undefined;
    const perKg = /(?:کیلویی|هر کیلو|قیمت هر کیلو|کیلو)\s*(?:به|با|:)?\s*(\d+(?:\.\d+)?)\s*(هزار|میلیون|میلیارد)?\s*(تومان|تومن|ریال)/.exec(text);
    if (perKg) {
      let value = Number(perKg[1]);
      if (perKg[2] === "هزار") value *= 1_000;
      else if (perKg[2] === "میلیون") value *= 1_000_000;
      else if (perKg[2] === "میلیارد") value *= 1_000_000_000;
      pricePerKg = Math.round(perKg[3] === "ریال" ? value : value * 10);
    } else {
      const withoutWeight = text.replace(/(\d+(?:\.\d+)?)\s*(?:کیلوگرم|کیلو|تن)/g, "");
      const moneyHit = findMoney(withoutWeight);
      if (moneyHit) pricePerKg = moneyHit.value;
    }

    // خریدار: «به کشتارگاه فروختم» یا «فروختم به کشتارگاه»
    const buyerMatch =
      /(?:به|از)\s+([^\d،.]+?)\s+(?:فروختم|فروش|دادم|تحویل)/.exec(text) ??
      /(?:فروختم|فروش|تحویل دادم)\s+به\s+([^\d،.]+?)(?:\s|$)/.exec(text);
    if (buyerMatch) {
      const candidate = buyerMatch[1].replace(/\b(?:کیلو|تومان|ریال)\b/g, "").trim();
      if (candidate.length >= 2 && !/کیلو|تومان|ریال|دیروز|امروز/.test(candidate)) entities.buyer = candidate;
    }

    if (totalWeightKg !== null && totalWeightKg !== undefined) entities.totalWeightKg = Math.round(totalWeightKg * 10) / 10;
    if (pricePerKg !== undefined) entities.pricePerKg = pricePerKg;

    const missing: string[] = [];
    if (entities.totalWeightKg === undefined) missing.push("totalWeightKg");
    if (entities.pricePerKg === undefined) missing.push("pricePerKg");
    if (!entities.date) {
      entities.date = options.today ?? todayIso();
      entities.dateLabel = "امروز";
    }

    const reply = missing.length
      ? `فروش را ثبت می‌کنم، اما ${askFor(missing)}`
      : `فروش ${entities.dateLabel}: ${num(entities.totalWeightKg!)} کیلوگرم به قیمت هر کیلو ${money(entities.pricePerKg!)}${entities.buyer ? ` به ${entities.buyer}` : ""}. تأیید می‌کنید؟`;

    return {
      intent: "add_sale",
      confidence: conf(missing.length ? 0.45 : 0.84),
      entities,
      missing,
      questions: missing.map((m) => `چند ${FIELD_LABELS[m] ?? m}؟`),
      reply,
      requiresConfirm: true,
      normalized,
      raw,
    };
  }

  /* ---------------------------------- هزینه ---------------------------------- */
  if (ranked.some((r) => r.intent === "add_expense")) {
    const hit = findMoney(text);
    const quantity = findMeasure(text, "kg")?.value ?? findMeasure(text, "ton")?.value;
    if (hit) entities.amountRial = hit.value;
    if (quantity !== undefined) entities.quantity = quantity;

    const category = CATEGORY_WORDS.find((c) => c.words.some((w) => text.includes(w)));
    const feedType = FEED_TYPE_WORDS.find((f) => f.words.some((w) => text.includes(w)));
    if (category) entities.category = category.category;
    if (feedType && category?.category === "feed") entities.feedType = feedType.type;

    const cleaned = text
      .replace(hit?.raw ?? "", "")
      .replace(/(?:خریدم|خرید|هزینه|پرداخت|دادم|کردم|برای|بابت|یه|یک|تومان|تومن|ریال)/g, "")
      .replace(/\d+(?:\.\d+)?\s*(?:کیلو|کیلوگرم|تن|گرم|لیتر)?/g, "")
      .replace(/\s+/g, " ")
      .trim();
    entities.description = cleaned.length >= 2 ? cleaned.slice(0, 120) : category?.label ?? "هزینه";

    const missing: string[] = [];
    if (entities.amountRial === undefined) missing.push("amountRial");
    if (!entities.date) {
      entities.date = options.today ?? todayIso();
      entities.dateLabel = "امروز";
    }

    const reply = missing.length
      ? `هزینه را ثبت می‌کنم، اما ${askFor(missing)}`
      : `هزینه «${entities.description}»${entities.category ? ` در دسته ${CATEGORY_WORDS.find((c) => c.category === entities.category)?.label}` : ""} به مبلغ ${money(entities.amountRial!)} با تاریخ ${entities.dateLabel}. تأیید می‌کنید؟`;

    return {
      intent: "add_expense",
      confidence: conf(missing.length ? 0.4 : 0.8),
      entities,
      missing,
      questions: missing.map((m) => `چند ${FIELD_LABELS[m] ?? m}؟`),
      reply,
      requiresConfirm: true,
      normalized,
      raw,
    };
  }

  /* ---------------------------------- پرسش ---------------------------------- */
  if (ranked.length) {
    const top = ranked[0].intent;
    if (top === "query_loading") {
      return { ...empty("query_loading", "تاریخ بهینه بارگیری را حساب می‌کنم."), confidence: 0.7, entities };
    }
    if (top === "query_water" || top === "query_feed" || top === "query_metrics") {
      return { ...empty(top, "این را از داده‌های همین گله پاسخ می‌دهم."), confidence: 0.6, entities };
    }
  }

  if (/^(سلام|درود|وقت بخیر|هی)(?![آ-ی])/.test(text) || text.includes("چه کار می کنی") || text.includes("راهنما")) {
    return {
      ...empty("help", "می‌توانم ثبت روزانه، وزن‌گیری، هزینه و فروش را با جمله شما ثبت کنم و وضعیت گله را بگویم."),
      confidence: 0.9,
      entities,
    };
  }

  return {
    ...empty(
      "unknown",
      "متوجه نشدم. نمونه: «امروز ۱۲ تا تلف شد، ۹۰ کیلو دان و ۱۸۰ لیتر آب»، «۲۰۰ گرم وزن گرفتم از ۵۰ تا نمونه»، «۴ میلیون تومان دان خریدم».",
    ),
  };
}

/** نمونه‌جمله‌ها برای چیپ‌های رابط کاربری */
export function assistantExamples(): { text: string; intent: AssistantIntent }[] {
  return [
    { text: "امروز ۱۲ تا تلف شد و ۹۰ کیلو دان خورد و آبش ۱۸۰ لیتر بود", intent: "log_daily" },
    { text: "دمای سالن ۲۷ درجه بود", intent: "log_daily" },
    { text: "میانگین وزن ۱۲۰۰ گرم از ۵۰ نمونه", intent: "add_weight" },
    { text: "۴ میلیون تومان دان آغازین خریدم", intent: "add_expense" },
    { text: "دیروز ۱۵۰۰ کیلو به کشتارگاه فروختم کیلویی ۹۸ هزار تومان", intent: "add_sale" },
    { text: "مصرف آب این هفته چطور بوده؟", intent: "query_water" },
    { text: "کی بارگیری کنم؟", intent: "query_loading" },
  ];
}
