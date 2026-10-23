import test from "node:test";
import assert from "node:assert/strict";
import { computeMetrics, expectedMortalityPct, COST_CATEGORIES, categoryLabel } from "../lib/metrics";
import { addDaysIso } from "../lib/jalali";
import type { Cost, Cycle, DailyLog, Sale } from "../lib/types";

const today = "2026-10-23";
const placement = addDaysIso(today, -29); // روز ۳۰

function cycle(over: Partial<Cycle> = {}): Cycle {
  return {
    id: 1,
    name: "دوره تست",
    house: "سالن ۱",
    breed: "راس ۳۰۸",
    placement_date: placement,
    initial_count: 10000,
    chick_price: 27000,
    target_weight_g: 2500,
    target_age_days: 42,
    status: "active",
    closed_date: null,
    notes: null,
    created_at: "2026-09-20 10:00:00",
    ...over,
  };
}

function logs(
  days = 30,
  per: { mortality?: number; feed?: number; water?: number; weight?: number | null } = {},
): DailyLog[] {
  const p = { mortality: 2, feed: 700, water: 1300, weight: null as number | null, ...per };
  return Array.from({ length: days }, (_, i) => ({
    id: i + 1,
    cycle_id: 1,
    date: addDaysIso(placement, i),
    mortality: p.mortality,
    culls: 0,
    feed_kg: p.feed,
    water_l: p.water,
    temp_c: 26,
    avg_weight_g: p.weight,
    feed_type: "دان رشد",
    notes: null,
  }));
}

function costs(list: Partial<Cost>[] = []): Cost[] {
  return list.map((c, i) => ({
    id: i + 1,
    cycle_id: 1,
    date: addDaysIso(placement, i),
    category: "feed",
    description: "هزینه",
    amount: 0,
    quantity: null,
    unit: null,
    vendor: null,
    ...c,
  })) as Cost[];
}

const opts = { today, marketPrice: 98000, feedPrice: 33500 };

test("شمارش زنده، تلفات و درصد تلفات", () => {
  const m = computeMetrics(cycle(), logs(30), [], [], opts);
  assert.equal(m.ageDays, 30);
  assert.equal(m.mortalityTotal, 60);
  assert.equal(m.liveBirds, 9940);
  assert.ok(Math.abs(m.mortalityPct - 0.6) < 0.001);
  assert.ok(m.expectedMortalityPct > m.mortalityPct); // تلفات کمتر از انتظار
});

test("ضریب تبدیل از دان مصرفی و وزن تولیدی محاسبه می‌شود", () => {
  // وزن‌کشی در آخرین روز ثبت شده تا برون‌یابی رشدی انجام نشود
  const l = logs(30, { mortality: 0, feed: 1000, water: 1800 });
  l[29].avg_weight_g = 2000;
  const m = computeMetrics(cycle(), l, [], [], opts);
  const expected = (30 * 1000) / ((10000 * 2000) / 1000);
  assert.equal(m.currentWeightG, 2000);
  assert.ok(m.fcr !== null);
  assert.ok(Math.abs(m.fcr! - expected) < 0.02, `fcr ${m.fcr} != ${expected}`);
  assert.ok(m.stdFcr > 1.3);
});

test("وزن‌کشی قدیمی با نرخ رشد استاندارد برون‌یابی می‌شود", () => {
  const l = logs(20, { mortality: 0, feed: 800, water: 1400 });
  l[19].avg_weight_g = 1200; // ۱۰ روز پیش
  const m = computeMetrics(cycle(), l, [], [], opts);
  assert.ok(m.currentWeightG > 1200, "weight should be extrapolated to today");
  assert.equal(m.weightSource, "projected");
});

test("هزینه مصرف‌شده بر پایه مصرف دان است نه خرید انبار", () => {
  const l = logs(10, { mortality: 0, feed: 500, water: 900 }); // ۱۰ روز × ۵۰۰ = ۵۰۰۰ کیلو مصرف
  const c = costs([
    { category: "feed", amount: 33_500_000 * 2, quantity: 2000 }, // ۲۰۰۰ کیلو خرید، ۵۰۰۰ کیلو مصرف
    { category: "chick", amount: 270_000_000 },
  ]);
  const m = computeMetrics(cycle(), l, c, [], opts);
  // قیمت واحد دان = ۶۷٬۰۰۰٬۰۰۰ / ۲۰۰۰ = ۳۳٬۵۰۰ → ۵۰۰۰ کیلو مصرف = ۱۶۷٬۵۰۰٬۰۰۰
  assert.ok(Math.abs(m.totalCost - (167_500_000 + 270_000_000)) < 1000, `totalCost=${m.totalCost}`);
  assert.equal(m.feedStockKg, 0);
  assert.equal(m.cashCost, 337_000_000);
  assert.ok(m.inventoryValue === 0);
});

test("موجودی دان منفی نمی‌شود و کفایت روز محاسبه می‌شود", () => {
  const l = logs(10, { mortality: 0, feed: 1000, water: 1800 });
  const m = computeMetrics(cycle(), l, costs([{ category: "feed", amount: 1e6, quantity: 200 }]), [], opts);
  assert.equal(m.feedStockKg, 0);
  assert.ok(m.feedDaysLeft >= 0);
  assert.ok(m.alerts.some((a) => a.id === "feed-stock"));
});

test("هشدار جهش تلفات و تلفات بالای انتظار فعال می‌شود", () => {
  const l = logs(20, { mortality: 1, feed: 600, water: 1100 });
  l[19].mortality = 40;
  const m = computeMetrics(cycle(), l, [], [], opts);
  assert.ok(m.alerts.some((a) => a.id === "mortality-spike"), "spike alert missing");

  const high = logs(25, { mortality: 25, feed: 700, water: 1300 });
  const m2 = computeMetrics(cycle(), high, [], [], opts);
  assert.ok(m2.alerts.some((a) => a.id === "mortality-high"), "high mortality alert missing");
});

test("وزن پایین‌تر از استاندارد هشدار رشد می‌دهد", () => {
  const l = logs(25, { mortality: 1, feed: 700, water: 1300, weight: 400 });
  const m = computeMetrics(cycle(), l, [], [], opts);
  assert.ok(m.weightVsStdPct < -6);
  assert.ok(m.alerts.some((a) => a.id === "weight-low"));
});

test("پیش‌بینی پایان دوره منطقی و مثبت است", () => {
  const l = logs(30, { mortality: 2, feed: 900, water: 1600 });
  const c = costs([
    { category: "feed", amount: 33500 * 27000, quantity: 27000 },
    { category: "chick", amount: 270_000_000 },
    { category: "labor", amount: 40_000_000 },
  ]);
  const m = computeMetrics(cycle(), l, c, [], opts);
  assert.ok(m.projection.projectedWeightG > m.currentWeightG);
  assert.ok(m.projection.projectedWeightG <= 4300);
  assert.ok(m.projection.projectedFeedKg >= m.totalFeedKg);
  assert.ok(m.projection.projectedCost > m.totalCost);
  assert.ok(m.projection.projectedFcr > 0);
  assert.ok(m.projection.targetAge === 42);
});

test("فروش باعث افزایش درآمد و کاهش قطعه زنده می‌شود", () => {
  const sales: Sale[] = [
    { id: 1, cycle_id: 1, date: today, count: 2000, weight_kg: 4400, price_per_kg: 98000, deductions: 0, buyer: "کشتارگاه", notes: null },
  ];
  const m = computeMetrics(cycle(), logs(30), costs([{ category: "chick", amount: 270_000_000 }]), sales, opts);
  assert.equal(m.soldBirds, 2000);
  assert.equal(m.liveBirds, 10000 - 60 - 2000);
  assert.ok(Math.abs(m.revenue - 4400 * 98000) < 1);
});

test("دوره بسته‌شده سن را از تاریخ بستن می‌گیرد", () => {
  const closed = cycle({ status: "closed", closed_date: addDaysIso(placement, 40) });
  const m = computeMetrics(closed, logs(41), [], [], opts);
  assert.equal(m.ageDays, 41);
  assert.equal(m.projection.daysRemaining, 0);
});

test("بدون داده، محاسبات پایه بدون خطا و بدون NaN است", () => {
  const m = computeMetrics(cycle(), [], [], [], opts);
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
