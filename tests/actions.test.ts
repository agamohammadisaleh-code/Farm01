import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// بانک اطلاعاتی مستقل برای تست لایه نوشتن
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "farm-actions-"));
const dbPath = path.join(dir, "actions.db");
process.env.FARM_DB_PATH = dbPath;

type Actions = typeof import("../app/actions");
let actions: Actions;
let cycleId = 0;

function fd(obj: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(obj)) f.append(k, v);
  return f;
}

const TODAY = new Date().toISOString().slice(0, 10);
const PAST = "2026-03-01";

test("آماده‌سازی: ساخت دوره نمونه و پاک‌سازی داده پیش‌فرض", async () => {
  const { getDb } = await import("../lib/db");
  actions = await import("../app/actions");
  const db = getDb();
  db.exec("DELETE FROM sales; DELETE FROM costs; DELETE FROM daily_logs; DELETE FROM cycles;");
  cycleId = Number(
    db
      .prepare(
        `INSERT INTO cycles (name, house, breed, placement_date, initial_count, chick_price, target_weight_g, target_age_days, status)
         VALUES ('تست', 'سالن ۱', 'راس ۳۰۸', ?, 10000, 27000, 2500, 42, 'active')`,
      )
      .run(PAST).lastInsertRowid,
  );
  assert.ok(cycleId > 0);
});

test("ثبت آمار روزانه با ارقام فارسی و اعشار فارسی", async () => {
  const res = await actions.saveDailyLogAction(
    null,
    fd({
      cycle_id: String(cycleId),
      date: PAST,
      mortality: "۳",
      culls: "۱",
      feed_kg: "۱۲۰٫۵",
      water_l: "۲۴۰",
      temp_c: "۲۸٫۵",
      avg_weight_g: "۱۹۵",
      notes: "واکسیناسیون",
    }),
  );
  assert.equal(res.ok, true, JSON.stringify(res));

  const { getDb } = await import("../lib/db");
  const row = getDb()
    .prepare("SELECT mortality, culls, feed_kg, temp_c, avg_weight_g FROM daily_logs WHERE cycle_id=? AND date=?")
    .get(cycleId, PAST) as Record<string, number>;
  assert.equal(row.mortality, 3);
  assert.equal(row.culls, 1);
  assert.equal(row.feed_kg, 120.5);
  assert.equal(row.temp_c, 28.5);
  assert.equal(row.avg_weight_g, 195);
});

test("ثبت دوباره همان روز، رکورد را به‌روزرسانی می‌کند نه تکرار", async () => {
  const res = await actions.saveDailyLogAction(
    null,
    fd({ cycle_id: String(cycleId), date: PAST, mortality: "7", culls: "0", feed_kg: "130", water_l: "250" }),
  );
  assert.equal(res.ok, true);
  const { getDb } = await import("../lib/db");
  const rows = getDb().prepare("SELECT mortality FROM daily_logs WHERE cycle_id=? AND date=?").all(cycleId, PAST) as {
    mortality: number;
  }[];
  assert.equal(rows.length, 1);
  assert.equal(rows[0].mortality, 7);
});

test("رد تلفات بیشتر از تعداد زنده و دمای غیرمنطقی", async () => {
  const res = await actions.saveDailyLogAction(
    null,
    fd({ cycle_id: String(cycleId), date: PAST, mortality: "50000", culls: "0", feed_kg: "10", water_l: "10", temp_c: "80" }),
  );
  assert.equal(res.ok, false);
  const errors = res.errors as Record<string, string> | undefined;
  assert.ok(errors?.mortality);
  assert.ok(errors?.temp_c);
});

test("رد تاریخ آینده و تاریخ پیش از جوجه‌ریزی", async () => {
  const future = await actions.saveDailyLogAction(
    null,
    fd({ cycle_id: String(cycleId), date: "2030-01-01", mortality: "1", culls: "0", feed_kg: "10", water_l: "10" }),
  );
  assert.equal(future.ok, false);
  assert.ok((future.errors as Record<string, string> | undefined)?.date);

  const before = await actions.saveCostAction(
    null,
    fd({ cycle_id: String(cycleId), date: "2025-01-01", category: "feed", description: "قبل از جوجه‌ریزی", amount: "1000" }),
  );
  assert.equal(before.ok, false);
  assert.ok((before.errors as Record<string, string> | undefined)?.date);
});

test("هزینه با ارقام فارسی و جداکننده هزارگان ثبت می‌شود", async () => {
  const res = await actions.saveCostAction(
    null,
    fd({
      cycle_id: String(cycleId),
      date: TODAY,
      category: "feed",
      description: "خرید دان",
      amount: "۳۳٬۵۰۰٬۰۰۰",
      quantity: "۱٬۰۰۰",
      unit: "کیلوگرم",
      vendor: "کارخانه",
    }),
  );
  assert.equal(res.ok, true, JSON.stringify(res));
  const { getDb } = await import("../lib/db");
  const row = getDb().prepare("SELECT amount, quantity FROM costs WHERE cycle_id=?").get(cycleId) as {
    amount: number;
    quantity: number;
  };
  assert.equal(row.amount, 33_500_000);
  assert.equal(row.quantity, 1000);
});

test("رد مبلغ صفر و شرح خالی در هزینه", async () => {
  const res = await actions.saveCostAction(
    null,
    fd({ cycle_id: String(cycleId), date: TODAY, category: "other", description: "", amount: "0" }),
  );
  assert.equal(res.ok, false);
  const e = res.errors as Record<string, string> | undefined;
  assert.ok(e?.amount);
  assert.ok(e?.description);
});

test("فروش بیش از موجودی رد و فروش مجاز ثبت می‌شود", async () => {
  const over = await actions.saveSaleAction(
    null,
    fd({ cycle_id: String(cycleId), date: TODAY, count: "999999", weight_kg: "100", price_per_kg: "98000", deductions: "0" }),
  );
  assert.equal(over.ok, false);
  assert.ok((over.errors as Record<string, string> | undefined)?.count);

  const good = await actions.saveSaleAction(
    null,
    fd({ cycle_id: String(cycleId), date: TODAY, count: "500", weight_kg: "1100", price_per_kg: "۹۸۰۰۰", deductions: "0", buyer: "کشتارگاه" }),
  );
  assert.equal(good.ok, true, JSON.stringify(good));

  const { getDb } = await import("../lib/db");
  const row = getDb().prepare("SELECT count, price_per_kg FROM sales WHERE cycle_id=?").get(cycleId) as {
    count: number;
    price_per_kg: number;
  };
  assert.equal(row.count, 500);
  assert.equal(row.price_per_kg, 98000);
});

test("حذف ثبت روزانه و هزینه", async () => {
  const { getDb } = await import("../lib/db");
  const db = getDb();
  const log = db.prepare("SELECT id FROM daily_logs WHERE cycle_id=?").get(cycleId) as { id: number };
  await actions.deleteDailyLogAction(log.id);
  const leftLogs = db.prepare("SELECT COUNT(*) c FROM daily_logs WHERE cycle_id=?").get(cycleId) as { c: number };
  assert.equal(leftLogs.c, 0);

  const cost = db.prepare("SELECT id FROM costs WHERE cycle_id=?").get(cycleId) as { id: number };
  await actions.deleteCostAction(cost.id);
  const leftCosts = db.prepare("SELECT COUNT(*) c FROM costs WHERE cycle_id=?").get(cycleId) as { c: number };
  assert.equal(leftCosts.c, 0);
});

test("اعتبارسنجی تنظیمات", async () => {
  const bad = await actions.saveSettingsAction(
    null,
    fd({ farm_name: "", market_price: "0", feed_price: "0", target_weight_g: "100", target_age_days: "100" }),
  );
  assert.equal(bad.ok, false);
  const be = bad.errors as Record<string, string> | undefined;
  assert.ok(be?.market_price);
  assert.ok(be?.target_age_days);

  const good = await actions.saveSettingsAction(
    null,
    fd({ farm_name: "مزرعه تست", market_price: "۹۸۰۰۰", feed_price: "33500", target_weight_g: "2500", target_age_days: "42", default_breed: "راس ۳۰۸" }),
  );
  assert.equal(good.ok, true);
  const { getSettings } = await import("../lib/db");
  assert.equal(getSettings().market_price, 98000);
});

test("پاک‌سازی فایل تست", () => {
  fs.rmSync(dir, { recursive: true, force: true });
  assert.ok(true);
});
