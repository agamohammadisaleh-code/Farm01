import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// بانک اطلاعاتی موقت مخصوص تست
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "farm-test-"));
process.env.FARM_DB_PATH = path.join(dir, "test.db");

type DbModule = typeof import("../lib/db");
let mod: DbModule;

test("آماده‌سازی بانک اطلاعاتی موقت", async () => {
  mod = await import("../lib/db");
  assert.ok(mod.getDb());
});

test("اسکیمای پایه و شاخص یکتایی ثبت روزانه ساخته می‌شود", () => {
  const db = mod.getDb();
  const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map((r) => r.name);
  for (const t of ["cycles", "daily_logs", "costs", "sales", "settings", "schema_meta"]) {
    assert.ok(tables.includes(t), `table ${t} missing`);
  }
  const idx = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_logs_unique'").get();
  assert.ok(idx, "unique index missing");
});

test("ثبت دوم برای همان روز به‌روزرسانی می‌شود (upsert)", () => {
  const db = mod.getDb();
  const cycleId = Number(
    db
      .prepare(
        `INSERT INTO cycles (name, house, breed, placement_date, initial_count, chick_price, target_weight_g, target_age_days)
         VALUES ('تست', 'سالن', 'راس', '2026-09-24', 1000, 27000, 2500, 42)`,
      )
      .run().lastInsertRowid,
  );
  const up = db.prepare(
    `INSERT INTO daily_logs (cycle_id, date, mortality, culls, feed_kg, water_l)
     VALUES (?, '2026-10-01', ?, 0, ?, 0)
     ON CONFLICT(cycle_id, date) DO UPDATE SET mortality=excluded.mortality, feed_kg=excluded.feed_kg`,
  );
  up.run(cycleId, 2, 50);
  up.run(cycleId, 7, 61);
  const rows = db.prepare("SELECT mortality, feed_kg FROM daily_logs WHERE cycle_id=?").all(cycleId) as {
    mortality: number;
    feed_kg: number;
  }[];
  assert.equal(rows.length, 1, "duplicate daily log rows");
  assert.equal(rows[0].mortality, 7);
  assert.equal(rows[0].feed_kg, 61);
});

test("حذف دوره، ثبت‌ها و هزینه‌های وابسته را پاک می‌کند", () => {
  const db = mod.getDb();
  const cycleId = Number(
    db
      .prepare(
        `INSERT INTO cycles (name, house, breed, placement_date, initial_count, chick_price, target_weight_g, target_age_days)
         VALUES ('حذف', '', 'راس', '2026-09-24', 100, 0, 2500, 42)`,
      )
      .run().lastInsertRowid,
  );
  db.prepare("INSERT INTO costs (cycle_id, date, category, description, amount) VALUES (?, '2026-10-01', 'feed', 'x', 10)").run(cycleId);
  db.prepare("DELETE FROM cycles WHERE id=?").run(cycleId);
  const left = db.prepare("SELECT COUNT(*) c FROM costs WHERE cycle_id=?").get(cycleId) as { c: number };
  assert.equal(left.c, 0);
});

test("پاک‌سازی پس از تست", () => {
  fs.rmSync(dir, { recursive: true, force: true });
  assert.ok(true);
});
