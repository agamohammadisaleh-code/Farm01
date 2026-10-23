import { farmOverview, type CycleMetrics, type FarmOverview } from "./metrics";
import { getSettings } from "./db";
import { num, toman, compactToman, pct } from "./format";
import { standardAt, feedPhaseForDay, FEED_PROGRAM } from "./standards";
import { formatJalali, faDigits, todayIso } from "./jalali";
import type { Settings } from "./types";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AssistantAnswer {
  content: string;
  chips?: string[];
  engine: "local" | "llm";
  usedData?: string[];
}

export interface AdvisorContext {
  settings: Settings;
  overview: FarmOverview;
  active: CycleMetrics[];
  closed: CycleMetrics[];
  today: string;
}

export function buildAdvisorContext(): AdvisorContext {
  const settings = getSettings();
  const today = todayIso();
  const overview = farmOverview(settings, today);
  return {
    settings,
    overview,
    active: overview.activeMetrics,
    closed: overview.closedMetrics,
    today,
  };
}

const Q_CHIPS = [
  "الان بفروشم یا صبر کنم؟",
  "چقدر دان سفارش بدهم؟",
  "وضعیت سود و زیان چطور است؟",
  "علت افزایش تلفات چیست؟",
  "پیش‌بینی پایان این دوره",
  "کدام هزینه‌ها را کاهش بدهم؟",
];

const money = (n: number) => `${num(Math.round(n))} تومان`;
const one = (n: number, d = 1) => num(n, d);

function cycleName(m: CycleMetrics) {
  return m.cycle.name;
}

/* ---------------------------- تحلیل فروش ---------------------------- */

function sellAdvice(ctx: AdvisorContext): string {
  if (!ctx.active.length) {
    return "در حال حاضر دوره فعالی برای فروش وجود ندارد. پس از جوجه‌ریزی، این بخش وضعیت آمادگی فروش هر سالن را تحلیل می‌کند.";
  }
  const price = ctx.settings.market_price;
  const lines: string[] = [];
  lines.push("### تحلیل زمان فروش");
  lines.push(
    `قیمت بازار مبنای محاسبه: **${money(price)} به ازای هر کیلوگرم وزن زنده**. این عدد در بخش تنظیمات قابل به‌روزرسانی است.`,
  );

  for (const m of ctx.active) {
    const dailyGainKg = (m.liveBirds * Math.max(0, m.dailyGainG)) / 1000;
    const dailyRevenue = dailyGainKg * price;
    const dailyFeedCost = m.expectedDailyFeedKg * ctx.settings.feed_price;
    const dailyOverhead = m.ageDays > 0 ? ((m.totalCost - (m.costBreakdown.find((c) => c.key === "feed")?.amount ?? 0)) / m.ageDays) * 0.5 : 0;
    const marginal = dailyRevenue - dailyFeedCost - dailyOverhead;
    const nowProfit = m.liveBiomassKg * price - m.totalCost;
    const waitProfit = m.projection.projectedProfit;
    const gainPerKg = m.dailyGainG;

    lines.push(`#### ${cycleName(m)} (${m.cycle.house || "بدون سالن"}، روز ${faDigits(m.ageDays)})`);
    lines.push(`- وزن زنده فعلی: **${num(m.currentWeightG)} گرم** (${m.weightVsStdPct >= 0 ? "+" : "−"}${one(Math.abs(m.weightVsStdPct))}٪ نسبت به استاندارد نژاد)`);
    lines.push(`- توده زنده: ${num(m.liveBirds)} قطعه، ${num(m.liveBiomassKg)} کیلوگرم`);
    lines.push(`- سود در صورت فروش امروز: **${compactToman(nowProfit)}**`);
    lines.push(`- سود پیش‌بینی‌شده تا سن هدف (${faDigits(m.projection.targetAge)} روز): **${compactToman(waitProfit)}**`);
    lines.push(
      `- ارزش رشد یک روز صبر کردن: حدود ${money(dailyRevenue)} درآمد در برابر ${money(dailyFeedCost)} هزینه دان و سرباز ≈ **${money(marginal)} سود نهایی روزانه**`,
    );

    let verdict: string;
    if (m.currentWeightG >= m.targetWeightG * 0.97) {
      if (marginal > 0) {
        verdict = `گله به وزن هدف رسیده و هر روز صبر کردن هنوز سود مثبت دارد. توصیه: **فروش پله‌ای**؛ بخشی از گله را همین هفته و بقیه را طی ۳ تا ۵ روز آینده بفروشید تا ریسک قیمت و تلفات کم شود.`;
      } else {
        verdict = `وزن هدف محقق شده و هزینه نگهداری روزانه از ارزش رشد بیشتر است. توصیه: **فروش در اولین فرصت ممکن**.`;
      }
    } else if (m.currentWeightG >= m.targetWeightG * 0.85) {
      verdict = marginal > 0
        ? `گله در آستانه وزن هدف است. با رشد روزانه ${num(gainPerKg)} گرم و حاشیه مثبت، صبر تا ${faDigits(m.projection.targetAge)} روزگی منطقی است؛ اما با پایش روزانه قیمت.`
        : `گله نزدیک وزن هدف است اما حاشیه رشد روزانه منفی شده. فروش سریع‌تر بررسی شود.`;
    } else {
      verdict = `گله هنوز ${num(m.targetWeightG - m.currentWeightG)} گرم با وزن هدف فاصله دارد. فروش زودهنگام به ازای هر کیلوگرم زیان احتمالی دارد؛ تمرکز بر رشد و کنترل تلفات تا رسیدن به وزن هدف.`;
    }
    lines.push(`**نتیجه:** ${verdict}`);

    if (m.breakevenPerKg && price > 0) {
      const marginPerKg = price - m.breakevenPerKg;
      lines.push(
        `- بهای تمام‌شده تا امروز: هر کیلوگرم **${money(m.breakevenPerKg)}**؛ فاصله با قیمت بازار در هر کیلوگرم ${money(marginPerKg)}`,
      );
    }
    lines.push("");
  }

  lines.push("> **نکته:** تصمیم نهایی را با قیمت واقعی خریدار، هزینه حمل و ظرفیت کشتارگاه تنظیم کنید. این تحلیل بر پایه داده‌های ثبت‌شده در سامانه است.");
  return lines.join("\n");
}

/* ---------------------------- تحلیل دان ---------------------------- */

function feedAdvice(ctx: AdvisorContext): string {
  if (!ctx.active.length) return "دوره فعالی برای محاسبه نیاز دان وجود ندارد.";
  const lines = ["### محاسبه نیاز دان و سفارش"];
  for (const m of ctx.active) {
    const needKg = m.expectedDailyFeedKg;
    const bufferDays = 3;
    const orderQty = Math.ceil(needKg * bufferDays);
    const bags = Math.ceil(orderQty / 50);
    const cost = orderQty * ctx.settings.feed_price;
    const phase = feedPhaseForDay(m.ageDays);
    const nextPhase = FEED_PROGRAM.find((p) => p.fromDay > m.ageDays);
    lines.push(`#### ${cycleName(m)} — روز ${faDigits(m.ageDays)} (${phase})`);
    lines.push(`- مصرف روزانه پیش‌بینی‌شده: **${num(needKg, 1)} کیلوگرم** (سرانه ${num(m.avgDailyFeedG)} گرم)`);
    lines.push(`- موجودی انبار: ${num(m.feedStockKg, 0)} کیلوگرم ${m.feedDaysLeft < 2 ? "🔴 **بحرانی**" : m.feedDaysLeft < 4 ? "🟠 کم" : "🟢 کافی"}`);
    lines.push(
      m.feedStockKg < 1
        ? "- کفایت موجودی: **انبار خالی است** — تأمین فوری دان ضروری است"
        : `- کفایت موجودی: ${one(m.feedDaysLeft)} روز`,
    );
    lines.push(`- سفارش پیشنهادی برای ۳ روز آینده: **${num(orderQty)} کیلوگرم** (حدود ${num(bags)} کیسه ۵۰ کیلویی) با برآورد هزینه ${money(cost)}`);
    if (nextPhase) {
      const daysToNext = nextPhase.fromDay - m.ageDays;
      if (daysToNext <= 5) {
        lines.push(
          `- از روز ${nextPhase.fromDay} باید **${nextPhase.name}** مصرف شود؛ آماده‌سازی و سفارش این مرحله را همین حالا شروع کنید (${faDigits(daysToNext)} روز دیگر).`,
        );
      }
    }
    if (m.feedDaysLeft < 2)
      lines.push(
        `- ⚠️ **همین امروز سفارش دان ثبت کنید.** با موجودی فعلی، گله حدود ${one(m.feedDaysLeft)} روز خوراک دارد؛ قطع خوراک حتی یک وعده، افت رشد جبران‌ناپذیر ایجاد می‌کند.`,
      );
    lines.push(
      `- ضریب تبدیل گله: ${m.fcr ? one(m.fcr, 2) : "—"} در برابر استاندارد گله ${one(m.stdFcr, 2)} — ${m.fcr && m.fcr > m.stdFcr * 1.08 ? "بالاتر از استاندارد؛ مدیریت دان‌دهی را بازبینی کنید." : "در محدوده قابل قبول."}`,
    );
    lines.push("");
  }
  lines.push("**راهنمای انبار:** دان هر مرحله را جدا و با تاریخ ورود نگهداری کنید؛ انبار خشک و خنک از کپک‌زدگی (آفلاتوکسین) جلوگیری می‌کند.");
  return lines.join("\n");
}

/* ---------------------------- تحلیل تلفات ---------------------------- */

function mortalityAdvice(ctx: AdvisorContext, question: string): string {
  if (!ctx.active.length) return "دوره فعالی برای تحلیل تلفات وجود ندارد.";
  const q = question;
  const hasResp = /(تنفس|سرفه|نفس|عطسه|خس‌خس|آبریزش)/.test(q);
  const hasDigest = /(اسهال|مدفوع|شکم|روده)/.test(q);
  const hasLameness = /(لنگ|پا|راه|مفصل)/.test(q);
  const hasHeat = /(گرما|دما|تهویه|هوا)/.test(q);
  const lines = ["### تحلیل تلفات و اقدامات پیشنهادی"];

  for (const m of ctx.active) {
    const logs = m.dailySeries;
    const last = logs.at(-1);
    const last7 = logs.slice(-7);
    const avg7 = last7.length ? last7.reduce((s, l) => s + l.mortality, 0) / last7.length : 0;
    const isSpike = last && last.mortality >= Math.max(3, avg7 * 2);
    lines.push(`#### ${cycleName(m)} — روز ${faDigits(m.ageDays)}`);
    lines.push(
      `- تلفات تجمعی: **${num(m.lostBirds)} قطعه (${one(m.mortalityPct)}٪)** در برابر انتظار حدود ${one(m.expectedMortalityPct)}٪`,
    );
    lines.push(`- میانگین تلفات ۷ روز اخیر: ${one(avg7)} قطعه در روز${last ? `؛ آخرین روز: ${num(last.mortality)} قطعه` : ""}`);
    lines.push(`- نسبت آب به دان: ${m.totalFeedKg ? one(m.totalWaterL / m.totalFeedKg, 2) : "—"} | دمای آخرین ثبت: ${last?.tempC != null ? `${one(last.tempC)} درجه` : "—"}`);

    if (last && last.mortality === 0 && m.mortalityPct < m.expectedMortalityPct) {
      lines.push("**وضعیت:** تلفات در محدوده طبیعی است. پایش روزانه و ثبت دقیق را ادامه دهید.");
    } else if (isSpike) {
      lines.push("**وضعیت:** الگوی جهش تلفات مشاهده می‌شود. سه احتمال اصلی را به‌ترتیب بررسی کنید:");
    } else {
      lines.push("**وضعیت:** روند تلفات قابل کنترل است اما نیاز به بررسی دوره‌ای دارد.");
    }

    const checklist: string[] = [];
    if (hasResp) {
      checklist.push("علائم تنفسی: نمونه‌گیری برای تشخیص نیوکاسل/برونشیت و بررسی تهویه و گردوغبار بستر");
    }
    if (hasDigest) {
      checklist.push("علائم گوارشی: بررسی کیفیت آب، تغییر ناگهانی دان و احتمال کوکسیدیوز (مدفوع خونی/آبکی)");
    }
    if (hasLameness) {
      checklist.push("مشکلات پا: کنترل کیفیت بستر، تراکم و تعادل کلسیم/فسفر و ویتامین D3");
    }
    if (hasHeat) {
      checklist.push("استرس گرمایی: دمای سالن، سرعت هوا و دسترسی به آب خنک را فوری کنترل کنید");
    }
    if (checklist.length === 0) {
      checklist.push(
        "دمای سالن و تهویه را با سن پرنده تطبیق دهید (دمای هدف امروز حدود " + one(Math.max(20, 33.5 - m.ageDays * 0.33)) + " درجه)",
        "کیفیت آب و عملکرد خط آبخوری را بررسی کنید",
        "کیفیت و تاریخ تولید دان را کنترل و از خوراک کپک‌زده جلوگیری کنید",
        "تراکم و دسترسی به دانخوری را بازرسی کنید",
        "در صورت ادامه تلفات بیش از دو روز، کالبدشکافی نمونه و مشورت دامپزشک",
      );
    }
    lines.push(...checklist.map((c) => `- ${c}`));
    lines.push(
      `**اثر اقتصادی:** هر ۱٪ کاهش تلفات در این گله معادل حدود ${money((m.cycle.initial_count * 0.01 * m.currentWeightG * ctx.settings.market_price) / 1000)} ارزش زنده است.`,
    );
    lines.push("");
  }
  return lines.join("\n");
}

/* ---------------------------- هزینه و سود ---------------------------- */

function costAdvice(ctx: AdvisorContext): string {
  const o = ctx.overview;
  if (!o.cycles.length) return "هنوز هیچ دوره‌ای ثبت نشده است. با ثبت اولین دوره، تحلیل هزینه و سود فعال می‌شود.";
  const lines = ["### تحلیل هزینه و سود"];
  lines.push(
    `- هزینه مصرف‌شده دوره‌ها (فعال و بسته): **${compactToman(o.totalCostAll)}**\n- سهم دان از این هزینه: **${one(o.totalCostAll ? (o.feedCostTotal / o.totalCostAll) * 100 : 0)}٪**`,
  );
  if (o.costBreakdown.length) {
    lines.push("**ترکیب هزینه‌ها:**");
    for (const c of o.costBreakdown.slice(0, 5)) {
      lines.push(`- ${c.label}: ${compactToman(c.amount)} (${one(c.share)}٪)`);
    }
  }
  lines.push("");
  for (const m of ctx.active) {
    lines.push(`#### ${cycleName(m)}`);
    lines.push(
      `- هزینه هر قطعه تا امروز: **${money(m.costPerBird)}**\n- بهای تمام‌شده هر کیلوگرم وزن زنده: **${m.costPerKgLive ? money(m.costPerKgLive) : "—"}**\n- سود پیش‌بینی‌شده پایان دوره: **${compactToman(m.projection.projectedProfit)}**`,
    );
    if (m.costPerKgLive && ctx.settings.market_price) {
      const margin = ctx.settings.market_price - m.costPerKgLive;
      if (m.ageDays < 25) {
        lines.push(
          `- حاشیه هر کیلوگرم با قیمت فعلی بازار: ${money(margin)} — در سنین پایین بهای هر کیلو به‌طور طبیعی بالاست و این عدد ملاک قضاوت نیست.`,
        );
      } else {
        lines.push(
          `- حاشیه هر کیلوگرم با قیمت فعلی بازار: ${money(margin)} ${margin < 0 ? "🔴 (زیر قیمت تمام‌شده)" : margin < 15000 ? "🟠 (نازک)" : "🟢"}`,
        );
      }
    }
    lines.push("");
  }

  const feedShare = o.totalCostAll ? (o.feedCostTotal / o.totalCostAll) * 100 : 0;
  const tips: string[] = [];
  if (feedShare > 72) tips.push("سهم دان بالاتر از محدوده رایج (۶۵ تا ۷۰ درصد) است؛ کیفیت دان، پرت خوراک و ضریب تبدیل را بازبینی کنید.");
  if (feedShare < 55 && o.totalCostAll > 0) tips.push("سهم دان پایین است؛ احتمالاً برخی هزینه‌ها (نیروی کار، انرژی، دارو) ثبت نشده‌اند. ثبت کامل هزینه‌ها تحلیل را دقیق می‌کند.");
  tips.push(
    "خرید دان به‌صورت قرارداد دوره‌ای و پرداخت پیش‌پرداخت معمولاً ۳ تا ۷ درصد ارزان‌تر از خرید روزانه است.",
    "کاهش تلفات و بهبود FCR بیشترین اثر را بر بهای تمام‌شده دارند؛ هر ۰٫۰۵ بهبود FCR حدود ۲ تا ۳ درصد هزینه دان را کم می‌کند.",
    "مصرف انرژی را با تنظیم دمای هدف و عایق‌بندی سالن کنترل کنید؛ نوسان دمای شبانه بزرگ‌ترین عامل هدررفت سوخت است.",
  );
  lines.push("**پیشنهادهای کاهش هزینه:**");
  lines.push(...tips.map((t) => `- ${t}`));
  return lines.join("\n");
}

/* ---------------------------- رشد ---------------------------- */

function growthAdvice(ctx: AdvisorContext): string {
  if (!ctx.active.length) return "دوره فعالی برای تحلیل رشد وجود ندارد.";
  const lines = ["### تحلیل رشد و عملکرد گله"];
  for (const m of ctx.active) {
    const std = standardAt(m.ageDays);
    lines.push(`#### ${cycleName(m)} — روز ${faDigits(m.ageDays)}`);
    lines.push(`- وزن برآوردی امروز: **${num(m.currentWeightG)} گرم** در برابر استاندارد ${num(std.weightG)} گرم (${m.weightVsStdPct >= 0 ? "+" : "−"}${one(Math.abs(m.weightVsStdPct))}٪)`);
    lines.push(`- آخرین وزن‌کشی: ${m.measuredWeightG ? `${num(m.measuredWeightG)} گرم (${formatJalali(m.lastWeighDate ?? "")})` : "ثبت نشده"}`);
    lines.push(`- رشد روزانه: ${num(m.dailyGainG)} گرم | سرانه مصرف دان: ${num(m.avgDailyFeedG)} گرم`);
    lines.push(`- ضریب تبدیل: ${m.fcr ? one(m.fcr, 2) : "—"} (استاندارد ${one(m.stdFcr, 2)})`);
    const advice = m.weightVsStdPct < -5
      ? "برای جبران عقب‌ماندگی: افزایش دفعات دان‌دهی، کنترل فضای دانخوری، بازبینی کیفیت دان و بررسی سلامت روده. وزن‌کشی هفتگی را دقیق کنید."
      : m.weightVsStdPct > 5
        ? "رشد بالاتر از استاندارد؛ مراقب تهویه و سلامت پا باشید و برنامه دان را با وزن واقعی تنظیم کنید."
        : "رشد در محدوده استاندارد است؛ برنامه فعلی را حفظ کنید.";
    lines.push(`**توصیه:** ${advice}`);
    lines.push("");
  }
  return lines.join("\n");
}

/* ---------------------------- پیش‌بینی ---------------------------- */

function forecastAdvice(ctx: AdvisorContext): string {
  if (!ctx.active.length) return "دوره فعالی برای پیش‌بینی وجود ندارد.";
  const lines = ["### پیش‌بینی پایان دوره"];
  for (const m of ctx.active) {
    const p = m.projection;
    const price = ctx.settings.market_price;
    lines.push(`#### ${cycleName(m)}`);
    lines.push(
      `- سن هدف: روز ${faDigits(p.targetAge)} (${faDigits(p.daysRemaining)} روز دیگر)\n- وزن پیش‌بینی‌شده: **${num(p.projectedWeightG)} گرم**\n- دان پیش‌بینی‌شده: ${num(p.projectedFeedKg)} کیلوگرم\n- ضریب تبدیل پیش‌بینی: ${one(p.projectedFcr, 2)}\n- هزینه تمام‌شده: ${compactToman(p.projectedCost)}\n- درآمد پیش‌بینی‌شده: ${compactToman(p.projectedRevenue)}\n- **سود پیش‌بینی‌شده: ${compactToman(p.projectedProfit)}**`,
    );
    // سناریوها
    const scenarios = [-0.1, 0, 0.1].map((d) => {
      const rev = p.projectedRevenue * (1 + d);
      return `  - قیمت ${d === 0 ? "فعلی" : d > 0 ? "۱۰٪ بالاتر" : "۱۰٪ پایین‌تر"}: سود ${compactToman(rev - p.projectedCost)}`;
    });
    lines.push("**تحلیل حساسیت به قیمت بازار:**");
    lines.push(scenarios.join("\n"));
    const risk = p.projectedProfit < 0 ? "🔴 سناریوی زیان" : p.projectedProfit < p.projectedCost * 0.08 ? "🟠 حاشیه نازک" : "🟢 سود مناسب";
    lines.push(`**ارزیابی ریسک:** ${risk} — قیمت سربه‌سر تقریبی ${money(p.projectedRevenue > 0 ? (p.projectedCost / Math.max(1, p.projectedRevenue / price)) : 0)} به ازای هر کیلوگرم.`);
    lines.push("");
  }
  lines.push("> پیش‌بینی بر پایه روند رشد ثبت‌شده، استاندارد نژاد و هزینه‌های واقعی دوره محاسبه شده است و با هر ثبت جدید به‌روز می‌شود.");
  return lines.join("\n");
}

/* ---------------------------- خلاصه ---------------------------- */

function summaryAdvice(ctx: AdvisorContext): string {
  const o = ctx.overview;
  if (!o.cycles.length) {
    return "### وضعیت مزرعه\nهنوز دوره‌ای ثبت نشده است. با انتخاب «دوره جدید» و ثبت تاریخ جوجه‌ریزی، تعداد جوجه و قیمت آن، سامانه محاسبات را آغاز می‌کند.";
  }
  const lines = ["### خلاصه وضعیت مزرعه"];
  lines.push(
    `- دوره‌های فعال: **${num(o.activeMetrics.length)}** | قطعه زنده: **${num(o.liveBirds)}** | توده زنده: ${num(o.liveBiomassKg)} کیلوگرم\n- هزینه دوره‌های فعال: ${compactToman(o.activeCost)}\n- سود پیش‌بینی‌شده دوره‌های فعال: **${compactToman(o.activeProjectedProfit)}**\n- سود محقق‌شده دوره‌های بسته: ${compactToman(o.realizedProfit)}\n- تلفات تجمعی دوره‌های فعال: ${one(o.mortalityPctWeighted)}٪`,
  );
  if (o.alerts.length) {
    lines.push("**مهم‌ترین هشدارها:**");
    for (const a of o.alerts.slice(0, 4)) {
      lines.push(`- ${a.severity === "critical" ? "🔴" : "🟠"} **${a.title}** (${a.cycleName}): ${a.detail}`);
    }
  }
  const top = o.activeMetrics
    .slice()
    .sort((a, b) => b.projection.projectedProfit - a.projection.projectedProfit)[0];
  if (top) {
    lines.push(`**پیشنهاد اولویت‌دار:** در «${top.cycle.name}»، وزن‌کشی این هفته را انجام دهید و موجودی دان را تا ${num(Math.ceil(top.expectedDailyFeedKg * 3))} کیلوگرم تأمین کنید تا روند رشد حفظ شود.`);
  }
  return lines.join("\n");
}

/* ---------------------------- مقایسه ---------------------------- */

function compareAdvice(ctx: AdvisorContext): string {
  if (!ctx.active.length) return "دوره فعالی برای مقایسه وجود ندارد.";
  const lines = ["### مقایسه دوره‌های فعال", "| دوره | روز | وزن (گرم) | اختلاف با استاندارد | تلفات | ضریب تبدیل | هزینه هر قطعه |", "|---|---|---|---|---|---|---|"];
  for (const m of ctx.active) {
    lines.push(
      `| ${m.cycle.name} | ${faDigits(m.ageDays)} | ${num(m.currentWeightG)} | ${m.weightVsStdPct >= 0 ? "+" : "−"}${one(Math.abs(m.weightVsStdPct))}٪ | ${one(m.mortalityPct)}٪ | ${m.fcr ? one(m.fcr, 2) : "—"} | ${money(m.costPerBird)} |`,
    );
  }
  const bestGrowth = ctx.active.slice().sort((a, b) => b.weightVsStdPct - a.weightVsStdPct)[0];
  const worstMortality = ctx.active.slice().sort((a, b) => b.mortalityPct - a.mortalityPct)[0];
  lines.push("");
  lines.push(`- بهترین عملکرد رشد: **${bestGrowth.cycle.name}**`);
  lines.push(`- بالاترین تلفات: **${worstMortality.cycle.name}** — بررسی مدیریت دما، تهویه و کیفیت جوجه توصیه می‌شود.`);
  lines.push("- اختلاف در سالن‌ها معمولاً ناشی از دما، تراکم، کیفیت بستر و کالیبراسیون دانخوری است.");
  return lines.join("\n");
}

/* ---------------------------- سلامت ---------------------------- */

function healthAdvice(ctx: AdvisorContext): string {
  const lines = ["### برنامه سلامت و پیشگیری"];
  for (const m of ctx.active) {
    lines.push(`#### ${cycleName(m)} — روز ${faDigits(m.ageDays)}`);
    const checks: string[] = [];
    if (m.ageDays <= 10) checks.push("برنامه واکسیناسیون آغازین (نیوکاسل/برونشیت) را طبق نظر دامپزشک کامل کنید.");
    if (m.ageDays >= 14 && m.ageDays <= 28) checks.push("پایش کوکسیدیوز و کیفیت بستر؛ بستر خیس عامل اصلی مشکلات روده است.");
    if (m.ageDays > 28) checks.push("دوره پایانی: کاهش استرس، تهویه قوی و پایش سلامت پا و تنفس.");
    const tempTarget = Math.max(20, 33.5 - m.ageDays * 0.33);
    checks.push(`دمای هدف سالن امروز حدود ${one(tempTarget)} درجه سانتی‌گراد؛ اختلاف بیش از ۲ درجه با این عدد را اصلاح کنید.`);
    checks.push("آبخوری‌ها روزانه شسته و کلر باقی‌مانده آب کنترل شود.");
    lines.push(...checks.map((c) => `- ${c}`));
    lines.push("");
  }
  if (!ctx.active.length) lines.push("دوره فعالی وجود ندارد.");
  lines.push("**اصل طلایی:** پیشگیری ارزان‌تر از درمان است؛ هزینه واکسن و بهداشت کمتر از ۳٪ هزینه دوره است اما بیشترین اثر را بر تلفات دارد.");
  return lines.join("\n");
}

/* ---------------------------- انتخاب مسیر ---------------------------- */

type Intent = "sell" | "feed" | "mortality" | "cost" | "growth" | "forecast" | "summary" | "compare" | "health" | "help";

const INTENT_PATTERNS: { intent: Intent; re: RegExp }[] = [
  { intent: "sell", re: /(فروش|بفروش|بفروشم|قیمت بازار|نرخ روز|صبر کنم|نگه دارم|کشتار)/ },
  { intent: "feed", re: /(دان|خوراک|سفارش|انبار|کیسه|نهاده|سویا|ذرت)/ },
  { intent: "mortality", re: /(تلفات|مرگ|مردن|تلف|جهش|بیمار|علت)/ },
  { intent: "forecast", re: /(پیش.?بینی|پایان دوره|آینده|چقدر سود|تا آخر)/ },
  { intent: "cost", re: /(هزینه|سود|زیان|حاشیه|بهای تمام|اقتصاد|صرفه)/ },
  { intent: "growth", re: /(وزن|رشد|ضریب تبدیل|fcr|افزایش وزن)/ },
  { intent: "compare", re: /(مقایسه|کدام سالن|بهتر عمل|تفاوت)/ },
  { intent: "health", re: /(واکسن|بیماری|سلامت|بهداشت|تهویه|دما|کوکسیدیوز|نیوکاسل)/ },
  { intent: "summary", re: /(وضعیت|خلاصه|گزارش|چطور است|اوضاع|مرور)/ },
  { intent: "help", re: /(چه کاری|چیکار|پیشنهاد|کمک|راهنما|چه کنم)/ },
];

export function detectIntent(q: string): Intent {
  for (const { intent, re } of INTENT_PATTERNS) if (re.test(q)) return intent;
  if (/(فروش|sell)/i.test(q)) return "sell";
  return "summary";
}

export function answerLocally(question: string, ctx: AdvisorContext): AssistantAnswer {
  const intent = detectIntent(question);
  const map: Record<Intent, () => string> = {
    sell: () => sellAdvice(ctx),
    feed: () => feedAdvice(ctx),
    mortality: () => mortalityAdvice(ctx, question),
    cost: () => costAdvice(ctx),
    growth: () => growthAdvice(ctx),
    forecast: () => forecastAdvice(ctx),
    summary: () => summaryAdvice(ctx),
    compare: () => compareAdvice(ctx),
    health: () => healthAdvice(ctx),
    help: () => summaryAdvice(ctx) + "\n\n" + "**کارهایی که می‌توانم انجام دهم:** تحلیل زمان فروش، محاسبه سفارش دان، بررسی تلفات، پیش‌بینی پایان دوره، مقایسه سالن‌ها و تحلیل هزینه‌ها. کافی است سؤال خود را به فارسی بپرسید.",
  };
  let content = map[intent]();

  if (ctx.active.length === 0 && ctx.overview.cycles.length === 0) {
    content = "### شروع کار\nبرای اینکه بتوانم تحلیل کنم، ابتدا یک دوره جدید ثبت کنید:\n- نام دوره و سالن\n- تاریخ جوجه‌ریزی و تعداد جوجه\n- قیمت هر قطعه جوجه و وزن هدف\n\nپس از ثبت، وضعیت رشد، هزینه، تلفات و پیش‌بینی سود را برایتان محاسبه می‌کنم.";
  }

  const chipMap: Record<Intent, string[]> = {
    sell: ["پیش‌بینی پایان این دوره", "وضعیت سود و زیان چطور است؟", "نقطه سربه‌سر چقدر است؟"],
    feed: ["ضریب تبدیل چقدر است؟", "وضعیت سود و زیان چطور است؟", "کدام هزینه‌ها را کاهش بدهم؟"],
    mortality: ["برنامه واکسیناسیون چیست؟", "دمای سالن باید چند باشد؟", "وضعیت کلی مزرعه"],
    cost: ["کدام هزینه‌ها را کاهش بدهم؟", "الان بفروشم یا صبر کنم؟", "پیش‌بینی پایان این دوره"],
    growth: ["چقدر دان سفارش بدهم؟", "مقایسه سالن‌ها", "الان بفروشم یا صبر کنم؟"],
    forecast: ["الان بفروشم یا صبر کنم؟", "وضعیت سود و زیان چطور است؟", "چقدر دان سفارش بدهم؟"],
    summary: Q_CHIPS.slice(0, 3),
    compare: ["الان بفروشم یا صبر کنم؟", "تحلیل تلفات", "وضعیت سود و زیان چطور است؟"],
    health: ["علت افزایش تلفات چیست؟", "چقدر دان سفارش بدهم؟", "وضعیت کلی مزرعه"],
    help: Q_CHIPS,
  };

  return {
    content,
    engine: "local",
    chips: chipMap[intent],
    usedData: [
      ...ctx.active.map((m) => `دوره: ${m.cycle.name}`),
      "استاندارد رشد راس ۳۰۸",
      `قیمت بازار: ${num(ctx.settings.market_price)} تومان`,
    ].slice(0, 6),
  };
}

/* ---------------------------- اتصال اختیاری به LLM ---------------------------- */

export function farmContextPrompt(ctx: AdvisorContext): string {
  const o = ctx.overview;
  const active = ctx.active
    .map(
      (m) => `- ${m.cycle.name} (${m.cycle.house}): روز ${m.ageDays}/${m.projection.targetAge}, زنده ${m.liveBirds} از ${m.cycle.initial_count}, وزن ${m.currentWeightG}g (استاندارد ${m.stdWeightG}g), FCR ${m.fcr?.toFixed(2) ?? "?"} (استاندارد ${m.stdFcr.toFixed(2)}), تلفات ${m.mortalityPct.toFixed(1)}% (انتظار ${m.expectedMortalityPct.toFixed(1)}%), دان مصرفی ${m.totalFeedKg.toFixed(0)}kg, موجودی ${m.feedStockKg.toFixed(0)}kg, هزینه کل ${Math.round(m.totalCost)}, بهای هر کیلو ${m.costPerKgLive?.toFixed(0)}, قیمت بازار ${ctx.settings.market_price}, سود پیش‌بینی ${Math.round(m.projection.projectedProfit)}`,
    )
    .join("\n");
  return `تو یک مشاور متخصص پرورش مرغ گوشتی هستی. فقط فارسی و مختصر پاسخ بده و از داده‌های زیر استفاده کن.
مزرعه: ${ctx.settings.farm_name}
دوره‌های فعال:
${active || "ندارد"}
سود محقق‌شده دوره‌های بسته: ${Math.round(o.realizedProfit)}
تاریخ امروز (شمسی): ${formatJalali(ctx.today)}`;
}

export async function askLLM(question: string, history: ChatMessage[], ctx: AdvisorContext): Promise<AssistantAnswer | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        temperature: 0.3,
        max_tokens: 900,
        messages: [
          { role: "system", content: farmContextPrompt(ctx) },
          ...history.slice(-6).map((m) => ({ role: m.role, content: m.content })),
          { role: "user", content: question },
        ],
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = json.choices?.[0]?.message?.content?.trim();
    if (!content) return null;
    return { content, engine: "llm", chips: Q_CHIPS.slice(0, 3) };
  } catch {
    return null;
  }
}

export async function getAssistantAnswer(question: string, history: ChatMessage[]): Promise<AssistantAnswer> {
  const ctx = buildAdvisorContext();
  const llm = await askLLM(question, history, ctx);
  if (llm) return llm;
  return answerLocally(question, ctx);
}

export { Q_CHIPS };

