import test from "node:test";
import assert from "node:assert/strict";
import {
  aggregateOverview,
  computeMetrics,
  expectedMortalityPct,
  COST_CATEGORIES,
  categoryLabel,
} from "../src/metrics";
import { addDaysIso } from "../src/jalali";
import { cvFromUniformity, estimateCvFromRange, sampleUniformity, uniformityFromCv, uniformityVerdict } from "../src/uniformity";
import type { DailyLog, Expense, Flock, Sale, WeightSample } from "../src/types";

const today = "2026-10-23";
const start = addDaysIso(today, -29); // روز ۳۰

function flock(over: Partial<Flock> = {}): Flock {
  return {
    id: "f1",
    farm_id: "farm1",
    hall_id: "hall1",
    name: "گله تست",
    breed: "راس ۳۰۸",
    start_date: start,
    initial_count: 10000,
    chick_price: 27000,
    target_weight_g: 2500,
    target_age_days: 42,
    status: "active",
    closed_date: null,
    notes: null,
    created_by: null,
    created_at: "2026-09-20T10:00:00Z",
    updated_at: "2026-09-20T10:00:00Z",
    deleted_at: null,
    ...over,
  };
}

function logs(
  days = 30,
  per: { mortality?: number; feed?: number; water?: number } = {},
): DailyLog[] {
  const p = { mortality: 2, feed: 700, water: 1300, ...per };
  return Array.from({ length: days }, (_, i) => ({
    id: `l${i + 1}`,
    flock_id: "f1",
    date: addDaysIso(start, i),
    mortality: p.mortality,
    cull: 0,
    feed_kg: p.feed,
    water_liter: p.water,
    avg_temp: 26,
    notes: null,
    created_by: null,
    created_at: `${addDaysIso(start, i)}T08:00:00Z`,
    updated_at: `${addDaysIso(start, i)}T08:00:00Z`,
    deleted_at: null,
  }));
}

function samples(list: { day: number; weight: number; count?: number }[]): WeightSample[] {
  return list.map((s, i) => ({
    id: `w${i + 1}`,
    flock_id: "f1",
    date: addDaysIso(start, s.day),
    sample_count: s.count ?? 100,
    avg_weight_gr: s.weight,
    notes: null,
    created_by: null,
    created_at: "2026-10-01T08:00:00Z",
    updated_at: "2026-10-01T08:00:00Z",
    deleted_at: null,
  }));
}

function expenses(list: Partial<Expense>[] = []): Expense[] {
  return list.map((c, i) => ({
    id: `e${i + 1}`,
    flock_id: "f1",
    date: addDaysIso(start, i),
    category: "feed",
    description: "هزینه",
    amount: 0,
    quantity: null,
    unit: null,
    vendor: null,
    created_by: null,
    created_at: "2026-10-01T08:00:00Z",
    updated_at: "2026-10-01T08:00:00Z",
    deleted_at: null,
    ...c,
  })) as Expense[];
}

const opts = { today, marketPrice: 98000, feedPrice: 33500 };

test("شمارش زنده، تلفات و درصد تلفات", () => {
  const m = computeMetrics(flock(), logs(30), [], [], opts);
  assert.equal(m.ageDays, 30);
  assert.equal(m.mortalityTotal, 60);
  assert.equal(m.liveBirds, 9940);
  assert.ok(Math.abs(m.mortalityPct - 0.6) < 0.001);
  assert.ok(m.expectedMortalityPct > m.mortalityPct); // تلفات کمتر از انتظار
});

test("ضریب تبدیل از دان مصرفی و وزن تولیدی محاسبه می‌شود", () => {
  // وزن‌کشی در آخرین روز ثبت‌شده تا برون‌یابی رشدی انجام نشود
  const l = logs(30, { mortality: 0, feed: 1000, water: 1800 });
  const w = samples([{ day: 29, weight: 2000 }]);
  const m = computeMetrics(flock(), l, [], [], opts, w);
  const expected = (30 * 1000) / ((10000 * 2000) / 1000);
  assert.equal(m.currentWeightG, 2000);
  assert.equal(m.weightSource, "measured");
  assert.ok(m.fcr !== null);
  assert.ok(Math.abs(m.fcr! - expected) < 0.02, `fcr ${m.fcr} != ${expected}`);
  assert.ok(m.stdFcr > 1.3);
});

test("تنها وزن‌گیری‌های نمونه‌ای منبع وزن‌اند، نه ثبت روزانه", () => {
  const m = computeMetrics(flock(), logs(10), [], [], opts);
  assert.equal(m.measuredWeightG, null);
  assert.equal(m.weighCount, 0);
  assert.equal(m.weightSource, "projected");
});

test("وزن‌کشی قدیمی با نرخ رشد استاندارد برون‌یابی می‌شود", () => {
  const l = logs(20, { mortality: 0, feed: 800, water: 1400 });
  // آخرین نمونه ۱۰ روز پیش
  const w = samples([{ day: 9, weight: 1200 }]);
  const m = computeMetrics(flock(), l, [], [], opts, w);
  assert.ok(m.currentWeightG > 1200, "weight should be extrapolated to today");
  assert.equal(m.weightSource, "projected");
  assert.equal(m.weighCount, 1);
});

test("تعداد نمونه در متریک گزارش می‌شود", () => {
  const m = computeMetrics(flock(), logs(20), [], [], opts, samples([{ day: 10, weight: 900, count: 250 }]));
  assert.equal(m.lastSampleCount, 250);
});

test("هزینه مصرف‌شده بر پایه مصرف دان است نه خرید انبار", () => {
  const l = logs(10, { mortality: 0, feed: 500, water: 900 }); // ۱۰ روز × ۵۰۰ = ۵۰۰۰ کیلو مصرف
  const c = expenses([
    { category: "feed", amount: 33_500_000 * 2, quantity: 2000 }, // ۲۰۰۰ کیلو خرید، ۵۰۰۰ کیلو مصرف
    { category: "chick", amount: 270_000_000 },
  ]);
  const m = computeMetrics(flock(), l, c, [], opts);
  // قیمت واحد دان = ۶۷٬۰۰۰٬۰۰۰ / ۲۰۰۰ = ۳۳٬۵۰۰ → ۵۰۰۰ کیلو مصرف = ۱۶۷٬۵۰۰٬۰۰۰
  assert.ok(Math.abs(m.totalCost - (167_500_000 + 270_000_000)) < 1000, `totalCost=${m.totalCost}`);
  assert.equal(m.feedStockKg, 0);
  assert.equal(m.cashCost, 337_000_000);
  assert.equal(m.inventoryValue, 0);
});

test("موجودی دان منفی نمی‌شود و کفایت روز محاسبه می‌شود", () => {
  const l = logs(10, { mortality: 0, feed: 1000, water: 1800 });
  const m = computeMetrics(flock(), l, expenses([{ category: "feed", amount: 1e6, quantity: 200 }]), [], opts);
  assert.equal(m.feedStockKg, 0);
  assert.ok(m.feedDaysLeft >= 0);
  assert.ok(m.alerts.some((a) => a.id === "feed-stock"));
});

test("هشدار جهش تلفات و تلفات بالای انتظار فعال می‌شود", () => {
  const l = logs(20, { mortality: 1, feed: 600, water: 1100 });
  l[19].mortality = 40;
  const m = computeMetrics(flock(), l, [], [], opts);
  assert.ok(m.alerts.some((a) => a.id === "mortality-spike"), "spike alert missing");

  const high = logs(25, { mortality: 25, feed: 700, water: 1300 });
  const m2 = computeMetrics(flock(), high, [], [], opts);
  assert.ok(m2.alerts.some((a) => a.id === "mortality-high"), "high mortality alert missing");
});

test("وزن پایین‌تر از استاندارد هشدار رشد می‌دهد", () => {
  const l = logs(25, { mortality: 1, feed: 700, water: 1300 });
  const w = samples([{ day: 24, weight: 400 }]);
  const m = computeMetrics(flock(), l, [], [], opts, w);
  assert.ok(m.weightVsStdPct < -6);
  assert.ok(m.alerts.some((a) => a.id === "weight-low"));
});

test("پیش‌بینی پایان دوره منطقی و مثبت است", () => {
  const l = logs(30, { mortality: 2, feed: 900, water: 1600 });
  const c = expenses([
    { category: "feed", amount: 33500 * 27000, quantity: 27000 },
    { category: "chick", amount: 270_000_000 },
    { category: "labor", amount: 40_000_000 },
  ]);
  const m = computeMetrics(flock(), l, c, [], opts);
  assert.ok(m.projection.projectedWeightG > m.currentWeightG);
  assert.ok(m.projection.projectedWeightG <= 4300);
  assert.ok(m.projection.projectedFeedKg >= m.totalFeedKg);
  assert.ok(m.projection.projectedCost > m.totalCost);
  assert.ok(m.projection.projectedFcr > 0);
  assert.equal(m.projection.targetAge, 42);
});

test("فروش باعث افزایش درآمد و کاهش قطعه زنده می‌شود", () => {
  const sales: Sale[] = [
    {
      id: "s1",
      flock_id: "f1",
      date: today,
      count: 2000,
      total_weight_kg: 4400,
      price_per_kg: 98000,
      deductions: 0,
      buyer: "کشتارگاه",
      notes: null,
      created_by: null,
      created_at: "2026-10-23T08:00:00Z",
      updated_at: "2026-10-23T08:00:00Z",
      deleted_at: null,
    },
  ];
  const m = computeMetrics(flock(), logs(30), expenses([{ category: "chick", amount: 270_000_000 }]), sales, opts);
  assert.equal(m.soldBirds, 2000);
  assert.equal(m.liveBirds, 10000 - 60 - 2000);
  assert.ok(Math.abs(m.revenue - 4400 * 98000) < 1);
});

test("فروش بدون تعداد، شمارش زنده را کاهش نمی‌دهد ولی وزن را اضافه می‌کند", () => {
  const sales: Sale[] = [
    {
      id: "s2",
      flock_id: "f1",
      date: today,
      count: null,
      total_weight_kg: 500,
      price_per_kg: 98000,
      deductions: 1_000_000,
      buyer: null,
      notes: null,
      created_by: null,
      created_at: "2026-10-23T08:00:00Z",
      updated_at: "2026-10-23T08:00:00Z",
      deleted_at: null,
    },
  ];
  const m = computeMetrics(flock(), logs(30), [], sales, opts);
  assert.equal(m.soldBirds, 0);
  assert.equal(m.liveBirds, 10000 - 60);
  assert.ok(Math.abs(m.revenue - (500 * 98000 - 1_000_000)) < 1);
});

test("دوره بسته‌شده سن را از تاریخ بستن می‌گیرد", () => {
  const closed = flock({ status: "closed", closed_date: addDaysIso(start, 40) });
  const m = computeMetrics(closed, logs(41), [], [], opts);
  assert.equal(m.ageDays, 41);
  assert.equal(m.projection.daysRemaining, 0);
});

test("بدون داده، محاسبات پایه بدون خطا و بدون NaN است", () => {
  const m = computeMetrics(flock(), [], [], [], opts);
  assert.equal(m.fcr, null);
  assert.equal(m.liveBirds, 10000);
  assert.ok(Number.isFinite(m.totalCost));
  assert.ok(Number.isFinite(m.projection.projectedProfit));
  assert.ok(m.alerts.length > 0);
});

test("الگوی تلفات مورد انتظار با سن افزایش می‌یابد", () => {
  assert.ok(expectedMortalityPct(42) > expectedMortalityPct(14));
  assert.ok(expectedMortalityPct(7) > expectedMortalityPct(1));
});

test("دسته‌های هزینه کامل و برچسب‌ها درست هستند", () => {
  assert.equal(COST_CATEGORIES.length, 10);
  assert.equal(categoryLabel("feed"), "دان و خوراک");
  assert.equal(categoryLabel("unknown"), "سایر");
});

test("تجمیع مزرعه از چند گله", () => {
  const a = computeMetrics(flock(), logs(30), expenses([{ category: "chick", amount: 270_000_000 }]), [], opts);
  const b = computeMetrics(flock({ id: "f2", name: "گله دو" }), logs(20), [], [], opts);
  const o = aggregateOverview([a, b], []);
  assert.equal(o.activeMetrics.length, 2);
  assert.equal(o.liveBirds, a.liveBirds + b.liveBirds);
  assert.ok(o.totalCostAll > 0);
  assert.ok(o.mortalityPctWeighted > 0);
});

test("یکنواختی: CV = ۱۰٪ معادل حدود ۶۸٪ و کمتر بودن CV یعنی یکنواخت‌تر", () => {
  const u = uniformityFromCv(10);
  assert.ok(u > 67.5 && u < 68.5, `uniformity=${u}`);
  assert.ok(uniformityFromCv(6) > uniformityFromCv(12));
});

test("یکنواختی: تبدیل به CV و برگشت پایدار است", () => {
  const cv = cvFromUniformity(80);
  assert.ok(Math.abs(uniformityFromCv(cv) - 80) < 0.05, `cv=${cv}`);
});

test("یکنواختی: برآورد CV از دامنه وزن نمونه", () => {
  // دامنه ۴۰۰ گرم روی میانگین ۱۰۰۰ گرم → σ ≈ ۱۰۰ → CV ≈ ۱۰٪
  assert.equal(estimateCvFromRange(800, 1200, 1000), 10);
  assert.equal(estimateCvFromRange(null, 1200, 1000), null);
});

function sample(over: Partial<WeightSample> = {}): WeightSample {
  return {
    id: "w1",
    flock_id: "f1",
    date: today,
    sample_count: 100,
    avg_weight_gr: 1000,
    notes: null,
    created_by: null,
    created_at: "",
    updated_at: "",
    deleted_at: null,
    ...over,
  };
}

test("یکنواختی: مقدار ثبت‌شده ترازو بر برآورد اولویت دارد", () => {
  const r = sampleUniformity(sample({ uniformity_pct: 85, min_weight_gr: 700, max_weight_gr: 1300 }));
  assert.equal(r.uniformityPct, 85);
  assert.equal(r.source, "measured");
});

test("یکنواختی: در نبود عدد ترازو، از دامنه برآورد می‌شود", () => {
  const r = sampleUniformity(sample({ min_weight_gr: 800, max_weight_gr: 1200 }));
  assert.equal(r.source, "range");
  assert.ok(r.uniformityPct! > 60 && r.uniformityPct! < 75, `u=${r.uniformityPct}`);
});

test("یکنواختی: قضاوت در سه سطح", () => {
  assert.equal(uniformityVerdict(85), "good");
  assert.equal(uniformityVerdict(75), "fair");
  assert.equal(uniformityVerdict(60), "poor");
  assert.equal(uniformityVerdict(null), "unknown");
});

test("متریک گله یکنواختی آخرین نمونه را برمی‌گرداند", () => {
  const m = computeMetrics(
    flock(),
    logs(30),
    [],
    [],
    { today, marketPrice: 98000, feedPrice: 33500 },
    [
      sample({ date: addDaysIso(start, 6), avg_weight_gr: 180, min_weight_gr: 150, max_weight_gr: 210 }),
      sample({ date: addDaysIso(start, 20), avg_weight_gr: 900, min_weight_gr: 800, max_weight_gr: 1000 }),
    ],
  );
  assert.equal(m.weighCount, 2);
  assert.ok(m.uniformityPct != null);
  assert.equal(m.uniformitySeries.length, 2);
  assert.equal(m.avgUniformityPct != null, true);
});

/* ============================ قواعد کسب‌وکار (بخش ۵) ============================ */

test("قاعده ۱: FCR = مجموع دان مصرفی ÷ مجموع وزن زنده تولیدشده", () => {
  const weights = samples([{ day: 20, weight: 1000 }]);
  const sale: Sale[] = [
    {
      id: "s1", flock_id: "f1", date: addDaysIso(start, 25),
      total_weight_kg: 1500, price_per_kg: 98000, buyer: "کشتارگاه",
      count: 1000, deductions: 0, notes: null,
      created_by: null, created_at: "", updated_at: "", deleted_at: null,
    },
  ];
  const m = computeMetrics(flock(), logs(30, { feed: 1000 }), [], sale, { today, marketPrice: 98000, feedPrice: 33500 }, weights);

  // مخرج باید وزن زنده فعلی + وزن فروخته‌شده باشد، نه فقط وزن زنده فعلی
  const produced = m.liveBiomassKg + m.soldWeightKg;
  assert.equal(m.soldWeightKg, 1500);
  assert.ok(Math.abs(m.fcr! - m.totalFeedKg / produced) < 1e-9, "FCR باید دقیقاً دان ÷ وزن تولیدی باشد");
});

test("قاعده ۱: بدون وزن و فروش، FCR تعریف‌نشده است (نه صفر)", () => {
  const m = computeMetrics(flock(), [], [], [], { today, marketPrice: 98000, feedPrice: 33500 });
  assert.equal(m.fcr, null);
});

test("قاعده ۲: نرخ تلفات = تلفات تجمعی ÷ تعداد اولیه × ۱۰۰ (بدون حذف)", () => {
  const list = logs(10, { mortality: 5 }).map((l, i) => (i < 2 ? { ...l, cull: 50 } : l));
  const m = computeMetrics(flock({ initial_count: 10000 }), list, [], [], { today, marketPrice: 98000, feedPrice: 33500 });

  assert.equal(m.mortalityTotal, 50);
  assert.equal(m.cullsTotal, 100);
  assert.ok(Math.abs(m.mortalityPct - (50 / 10000) * 100) < 1e-9, "تلفات ۵۰ از ۱۰٬۰۰۰ = ۰٫۵٪");
  assert.ok(Math.abs(m.cullPct - 1) < 1e-9, "حذف ۱۰۰ از ۱۰٬۰۰۰ = ۱٪");
  assert.ok(Math.abs(m.removalPct - 1.5) < 1e-9, "خارج‌شده کل = ۱٫۵٪");
  // پرنده زنده باید حذف را هم کم کند
  assert.equal(m.liveBirds, 10000 - 150);
});

test("قاعده ۳: قیمت تمام‌شده هر کیلو = مجموع هزینه‌ها ÷ وزن نهایی", () => {
  const weights = samples([{ day: 29, weight: 2000 }]);
  const costs = expenses([
    { category: "chick", amount: 100_000_000, date: start },
    { category: "labor", amount: 20_000_000, date: addDaysIso(start, 5) },
  ]);
  const m = computeMetrics(flock(), logs(30), costs, [], { today, marketPrice: 98000, feedPrice: 33500 }, weights);

  const produced = m.liveBiomassKg + m.soldWeightKg;
  assert.ok(Math.abs(m.costPerKgLive! - m.totalCost / produced) < 1e-9);
  // برابری مستقل: هزینه کل ÷ وزن تولیدی
  assert.ok(Math.abs(m.costPerKgLive! * produced - m.totalCost) < 1e-6);
});

test("قاعده ۴: افت بیش از ۱۰٪ مصرف آب نسبت به میانگین سه روز قبل هشدار می‌دهد", () => {
  const base = logs(10, { water: 2000 });
  const dropped = base.map((l, i) => (i === base.length - 1 ? { ...l, water_liter: 1750 } : l)); // −۱۲٫۵٪
  const m = computeMetrics(flock(), dropped, [], [], { today, marketPrice: 98000, feedPrice: 33500 });

  assert.equal(m.waterBaselineL, 2000);
  assert.equal(m.lastWaterL, 1750);
  assert.ok(m.waterChangePct < -10);
  const alert = m.alerts.find((a) => a.id === "water-drop");
  assert.ok(alert, "هشدار افت آب باید صادر شود");
  assert.equal(alert!.severity, "warning");
});

test("قاعده ۴: افت کمتر از آستانه هشدار نمی‌دهد", () => {
  const base = logs(10, { water: 2000 });
  const slight = base.map((l, i) => (i === base.length - 1 ? { ...l, water_liter: 1850 } : l)); // −۷٫۵٪
  const m = computeMetrics(flock(), slight, [], [], { today, marketPrice: 98000, feedPrice: 33500 });
  assert.equal(m.alerts.find((a) => a.id === "water-drop"), undefined);
});

test("قاعده ۴: آستانه افت آب از تنظیمات مزرعه خوانده می‌شود", () => {
  const base = logs(10, { water: 2000 });
  const dropped = base.map((l, i) => (i === base.length - 1 ? { ...l, water_liter: 1750 } : l));
  const m = computeMetrics(flock(), dropped, [], [], {
    today, marketPrice: 98000, feedPrice: 33500, waterDropAlertPct: 20,
  });
  assert.equal(m.alerts.find((a) => a.id === "water-drop"), undefined, "با آستانه ۲۰٪ افت ۱۲٫۵٪ هشدار نیست");
});

test("قاعده ۵: نرخ تلفات روزانه بالای ۰٫۵٪ هشدار می‌دهد", () => {
  // ۱۰٬۰۰۰ قطعه، ۸۰ تلفات در روز آخر → ۰٫۸٪ نرخ روزانه
  const list = logs(10, { mortality: 2 });
  list[list.length - 1] = { ...list[list.length - 1], mortality: 80 };
  const m = computeMetrics(flock({ initial_count: 10000 }), list, [], [], { today, marketPrice: 98000, feedPrice: 33500 });

  assert.ok(m.dailyMortalityPct > 0.5, `نرخ روزانه ${m.dailyMortalityPct}`);
  const alert = m.alerts.find((a) => a.id === "mortality-daily");
  assert.ok(alert, "هشدار تلفات روزانه باید صادر شود");
});

test("قاعده ۵: تلفات روزانه زیر آستانه بدون هشدار است", () => {
  const list = logs(10, { mortality: 2 }); // ۲ از ۱۰٬۰۰۰ = ۰٫۰۲٪
  const m = computeMetrics(flock({ initial_count: 10000 }), list, [], [], { today, marketPrice: 98000, feedPrice: 33500 });
  assert.equal(m.alerts.find((a) => a.id === "mortality-daily"), undefined);
});

test("قاعده ۵: آستانه تلفات روزانه قابل تنظیم است", () => {
  const list = logs(10, { mortality: 2 });
  list[list.length - 1] = { ...list[list.length - 1], mortality: 80 }; // ۰٫۸٪
  const strict = computeMetrics(flock({ initial_count: 10000 }), list, [], [], {
    today, marketPrice: 98000, feedPrice: 33500, dailyMortalityAlertPct: 0.2,
  });
  assert.ok(strict.alerts.find((a) => a.id === "mortality-daily"));

  const lenient = computeMetrics(flock({ initial_count: 10000 }), list, [], [], {
    today, marketPrice: 98000, feedPrice: 33500, dailyMortalityAlertPct: 5,
  });
  assert.equal(lenient.alerts.find((a) => a.id === "mortality-daily"), undefined);
});

test("نرخ تلفات روزانه نسبت به پرندگان زنده همان روز محاسبه می‌شود", () => {
  // ۱۰٬۰۰۰ اولیه، ۵٬۰۰۰ فروش رفته، ۱٬۰۰۰ تلفات پیش‌تر؛ روز آخر ۳۰ تلفات از ~۴٬۰۰۰ زنده
  const list = logs(5, { mortality: 100 });
  list[list.length - 1] = { ...list[list.length - 1], mortality: 30 };
  const saleList: Sale[] = [
    {
      id: "s1", flock_id: "f1", date: addDaysIso(start, 1), total_weight_kg: 100, price_per_kg: 90000,
      buyer: null, count: 5000, deductions: 0, notes: null, created_by: null,
      created_at: "", updated_at: "", deleted_at: null,
    },
  ];
  const m = computeMetrics(flock({ initial_count: 10000 }), list, [], saleList, { today, marketPrice: 98000, feedPrice: 33500 });
  const liveBefore = m.liveBirds + 30;
  assert.ok(Math.abs(m.dailyMortalityPct - (30 / liveBefore) * 100) < 1e-9);
});
