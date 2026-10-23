import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { addDaysIso, todayIso } from "./jalali";
import { feedPhaseForDay, standardAt } from "./standards";
import type { CostCategory, Settings } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = process.env.FARM_DB_PATH || path.join(DATA_DIR, "farm.db");

declare global {
  // eslint-disable-next-line no-var
  var __farmDb: Database.Database | undefined;
}

function createDb(): Database.Database {
  if (!fs.existsSync(path.dirname(DB_PATH))) fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS cycles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      house TEXT NOT NULL DEFAULT '',
      breed TEXT NOT NULL DEFAULT 'راس ۳۰۸',
      placement_date TEXT NOT NULL,
      initial_count INTEGER NOT NULL,
      chick_price REAL NOT NULL DEFAULT 0,
      target_weight_g INTEGER NOT NULL DEFAULT 2500,
      target_age_days INTEGER NOT NULL DEFAULT 42,
      status TEXT NOT NULL DEFAULT 'active',
      closed_date TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS daily_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cycle_id INTEGER NOT NULL REFERENCES cycles(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      mortality INTEGER NOT NULL DEFAULT 0,
      culls INTEGER NOT NULL DEFAULT 0,
      feed_kg REAL NOT NULL DEFAULT 0,
      water_l REAL NOT NULL DEFAULT 0,
      temp_c REAL,
      avg_weight_g INTEGER,
      feed_type TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS costs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cycle_id INTEGER NOT NULL REFERENCES cycles(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      quantity REAL,
      unit TEXT,
      vendor TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cycle_id INTEGER NOT NULL REFERENCES cycles(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      count INTEGER NOT NULL,
      weight_kg REAL NOT NULL,
      price_per_kg REAL NOT NULL,
      deductions REAL NOT NULL DEFAULT 0,
      buyer TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_logs_cycle ON daily_logs(cycle_id, date);
    CREATE INDEX IF NOT EXISTS idx_costs_cycle ON costs(cycle_id, date);
    CREATE INDEX IF NOT EXISTS idx_sales_cycle ON sales(cycle_id, date);
  `);

  migrate(db);

  const initialized = db.prepare("SELECT value FROM settings WHERE key = 'initialized'").get() as
    | { value: string }
    | undefined;
  if (!initialized) {
    seed(db);
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('initialized', '1')").run();
  }
  return db;
}

const SCHEMA_VERSION = 2;

/** مهاجرت‌های افزایشی و اصلاح یکپارچگی داده */
function migrate(db: Database.Database) {
  db.exec("CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  const current = Number(
    (db.prepare("SELECT value FROM schema_meta WHERE key = 'version'").get() as { value: string } | undefined)?.value ??
      1,
  );
  if (current >= SCHEMA_VERSION) return;

  const tx = db.transaction(() => {
    if (current < 2) {
      // حذف ثبت‌های تکراری یک روز (نگه‌داشتن آخرین رکورد) و سپس قید یکتایی
      db.exec(`
        DELETE FROM daily_logs
        WHERE id NOT IN (
          SELECT MAX(id) FROM daily_logs GROUP BY cycle_id, date
        )
      `);
      db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_logs_unique ON daily_logs(cycle_id, date)");
    }
    db.prepare("INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('version', ?)").run(String(SCHEMA_VERSION));
  });
  tx();
}

export function getDb(): Database.Database {
  if (!globalThis.__farmDb) globalThis.__farmDb = createDb();
  return globalThis.__farmDb;
}

export function resetDemoData() {
  const db = getDb();
  db.exec("DELETE FROM sales; DELETE FROM costs; DELETE FROM daily_logs; DELETE FROM cycles; DELETE FROM settings;");
  seed(db);
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('initialized', '1')").run();
}

export function clearAllData() {
  const db = getDb();
  db.exec("DELETE FROM sales; DELETE FROM costs; DELETE FROM daily_logs; DELETE FROM cycles;");
}

export const DEFAULT_SETTINGS: Settings = {
  farm_name: "مرغداری نمونه سبز دشت",
  market_price: 98000,
  feed_price: 33500,
  target_weight_g: 2500,
  target_age_days: 42,
  default_breed: "راس ۳۰۸",
};

export function getSettings(): Settings {
  const db = getDb();
  const rows = db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const out = { ...DEFAULT_SETTINGS };
  for (const k of Object.keys(out) as (keyof Settings)[]) {
    const v = map.get(k);
    if (v !== undefined) {
      if (k === "farm_name" || k === "default_breed") out[k] = v as never;
      else (out as unknown as Record<string, number>)[k] = Number(v);
    }
  }
  return out;
}

export function saveSettings(patch: Partial<Settings>) {
  const db = getDb();
  const stmt = db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
  const tx = db.transaction(() => {
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === null) continue;
      stmt.run(k, String(v));
    }
  });
  tx();
}

/* ------------------------------- داده نمونه ------------------------------- */

function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round = (n: number, d = 0) => Math.round(n * 10 ** d) / 10 ** d;

interface SeedCycle {
  name: string;
  house: string;
  breed: string;
  ageDays: number;
  initial: number;
  chickPrice: number;
  targetWeight: number;
  status: "active" | "closed";
  weightFactor: number;
  mortalityFactor: number;
  closedAge?: number;
  endedDaysAgo?: number;
  notes?: string;
}

function seed(db: Database.Database) {
  const today = todayIso();
  const rand = mulberry32(20261023);

  const defaults: Record<string, string> = {
    farm_name: DEFAULT_SETTINGS.farm_name,
    market_price: String(DEFAULT_SETTINGS.market_price),
    feed_price: String(DEFAULT_SETTINGS.feed_price),
    target_weight_g: String(DEFAULT_SETTINGS.target_weight_g),
    target_age_days: String(DEFAULT_SETTINGS.target_age_days),
    default_breed: DEFAULT_SETTINGS.default_breed,
  };
  const setSetting = db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
  for (const [k, v] of Object.entries(defaults)) setSetting.run(k, v);

  const specs: SeedCycle[] = [
    {
      name: "دوره پاییزه — سالن ۱",
      house: "سالن ۱",
      breed: "راس ۳۰۸",
      ageDays: 32,
      initial: 12000,
      chickPrice: 27000,
      targetWeight: 2450,
      status: "active",
      weightFactor: 0.985,
      mortalityFactor: 1.35,
      notes: "تأمین جوجه از هچری البرز — برنامه واکسیناسیون کامل",
    },
    {
      name: "دوره مهر — سالن ۲",
      house: "سالن ۲",
      breed: "راس ۳۰۸",
      ageDays: 18,
      initial: 8000,
      chickPrice: 28500,
      targetWeight: 2500,
      status: "active",
      weightFactor: 1.002,
      mortalityFactor: 0.85,
      notes: "سالن تازه ضدعفونی شده — بستر نو",
    },
    {
      name: "دوره تابستانه — سالن ۳",
      house: "سالن ۳",
      breed: "هوبارد",
      ageDays: 46,
      initial: 9000,
      chickPrice: 26000,
      targetWeight: 2350,
      status: "closed",
      weightFactor: 0.995,
      mortalityFactor: 1.6,
      closedAge: 46,
      endedDaysAgo: 14,
      notes: "دوره آزمایشی نژاد هوبارد — فروش کامل انجام شد",
    },
  ];

  const insertCycle = db.prepare(`
    INSERT INTO cycles (name, house, breed, placement_date, initial_count, chick_price, target_weight_g, target_age_days, status, closed_date, notes)
    VALUES (@name, @house, @breed, @placement, @initial, @chick_price, @target_weight, @target_age, @status, @closed_date, @notes)
  `);
  const insertLog = db.prepare(`
    INSERT INTO daily_logs (cycle_id, date, mortality, culls, feed_kg, water_l, temp_c, avg_weight_g, feed_type, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertCost = db.prepare(`
    INSERT INTO costs (cycle_id, date, category, description, amount, quantity, unit, vendor)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertSale = db.prepare(`
    INSERT INTO sales (cycle_id, date, count, weight_kg, price_per_kg, deductions, buyer, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const notesPool = [
    "واکسیناسیون نیوکاسل انجام شد",
    "افزایش تهویه به دلیل گرمای هوا",
    "شست‌وشوی آبخوری‌ها و ضدعفونی",
    "توزیع دان آغازین با کیفیت مناسب",
    "مشاهده مدفوع خیس در برخی قفس‌ها — بررسی شد",
    "تنظیم دمای سالن و رطوبت",
    "بستر کاملاً خشک و مناسب",
  ];

  for (const spec of specs) {
    const endOffset = spec.endedDaysAgo ?? 0;
    const placement = addDaysIso(today, -(spec.ageDays - 1 + endOffset));
    const closedDate = spec.closedAge ? addDaysIso(placement, spec.closedAge - 1) : null;
    const result = insertCycle.run({
      name: spec.name,
      house: spec.house,
      breed: spec.breed,
      placement: placement,
      initial: spec.initial,
      chick_price: spec.chickPrice,
      target_weight: spec.targetWeight,
      target_age: 42,
      status: spec.status,
      closed_date: closedDate,
      notes: spec.notes ?? null,
    });
    const cycleId = Number(result.lastInsertRowid);

    let live = spec.initial;
    let totalFeedKg = 0;
    const logs: { date: string; feedKg: number }[] = [];

    for (let d = 1; d <= spec.ageDays; d++) {
      const date = addDaysIso(placement, d - 1);
      let rate = 0;
      if (d <= 3) rate = 0.00045;
      else if (d <= 10) rate = 0.00105;
      else if (d <= 21) rate = 0.00045;
      else rate = 0.00028;
      let mortality = Math.max(0, Math.round(spec.initial * rate * spec.mortalityFactor * (0.55 + rand() * 0.95)));
      if (spec.house === "سالن ۱" && spec.status === "active" && d === spec.ageDays) mortality = 17;
      const culls = rand() < 0.08 ? Math.round(rand() * 3) : 0;
      live = Math.max(0, live - mortality - culls);

      const std = standardAt(d);
      const feedKg = round((std.dailyFeedG * live) / 1000 * (1.0 + rand() * 0.022), 1);
      const waterL = round(feedKg * (1.7 + rand() * 0.25), 0);
      const tempC = round(33.5 - Math.min(9.5, d * 0.33) + (rand() - 0.5) * 0.9, 1);

      let avgWeight: number | null = null;
      if ((d >= 4 && d % 3 === 0) || d === spec.ageDays) {
        const factor = spec.weightFactor - Math.min(0.012, d * 0.0003) + (rand() - 0.5) * 0.01;
        avgWeight = Math.round(std.weightG * factor);
      }

      let note: string | null = null;
      if (d === 1) note = "جوجه‌ریزی و شروع دوره";
      else if (d === 7 || d === 21) note = "واکسیناسیون نیوکاسل انجام شد";
      else if (d === 14) note = "واکسیناسیون برونشیت";
      else if (d === 20) note = "افزایش تهویه به دلیل گرمای هوا";
      else if (spec.house === "سالن ۱" && d === spec.ageDays) note = "افزایش تلفات و بی‌حالی در بخشی از سالن؛ کاهش موقت مصرف آب";
      else if (rand() < 0.06) note = notesPool[Math.floor(rand() * notesPool.length)];

      insertLog.run(cycleId, date, mortality, culls, feedKg, waterL, tempC, avgWeight, feedPhaseForDay(d), note);
      totalFeedKg += feedKg;
      logs.push({ date, feedKg });
    }

    // خرید دان در نوبت‌های هفتگی (متناسب با مصرف واقعی گله)
    const purchaseDays = spec.house === "سالن ۱" && spec.status === "active" ? [2, 9, 16, 23] : [2, 9, 16, 23, 30, 37];
    for (const pd of purchaseDays) {
      const pDate = addDaysIso(placement, pd - 1);
      if (pDate > today) continue;
      let qty = 0;
      for (let k = pd; k < pd + 7; k++) {
        const actual = logs[k - 1]?.feedKg;
        qty += actual ?? (standardAt(Math.min(49, k)).dailyFeedG * spec.initial * 0.97) / 1000;
      }
      qty = Math.round(qty * 1.04);
      const label = pd <= 10 ? "دان آغازین" : pd <= 24 ? "دان رشد" : "دان پایانی";
      const priceFactor = pd <= 10 ? 0.955 : pd <= 24 ? 1.0 : 1.035;
      insertCost.run(
        cycleId,
        pDate,
        "feed" as CostCategory,
        `خرید ${label}`,
        Math.round(qty * 33500 * priceFactor),
        qty,
        "کیلوگرم",
        "کارخانه خوراک دام پارس",
      );
    }

    insertCost.run(
      cycleId,
      placement,
      "chick",
      "خرید جوجه یک‌روزه",
      spec.initial * spec.chickPrice,
      spec.initial,
      "قطعه",
      "هچری البرز",
    );
    insertCost.run(cycleId, addDaysIso(placement, 3), "vaccine", "واکسن نیوکاسل و برونشیت", 4200000 + spec.initial * 180, null, null, "داروخانه دامپزشکی");
    insertCost.run(cycleId, addDaysIso(placement, 6), "medication", "ویتامین و الکترولیت", 2800000 + spec.initial * 150, null, null, "پخش دارویی دام");
    insertCost.run(cycleId, addDaysIso(placement, 15), "medication", "آنتی‌بیوتیک و مکمل", 6500000 + spec.initial * 220, null, null, "پخش دارویی دام");
    insertCost.run(cycleId, addDaysIso(placement, 10), "litter", "خرید و حمل بستر", Math.round(spec.initial * 900), null, null, "چوب‌بری شمال");
    insertCost.run(cycleId, addDaysIso(placement, 4), "labor", "حقوق کارگر دوره", Math.round(spec.initial * 3400), null, null, "کارگر سالن");
    insertCost.run(cycleId, addDaysIso(placement, 12), "energy", "برق و سوخت", 14500000 + spec.initial * 320, null, null, "اداره برق");
    insertCost.run(cycleId, addDaysIso(placement, 20), "labor", "حقوق کارگر دوره", Math.round(spec.initial * 3400), null, null, "کارگر سالن");
    insertCost.run(cycleId, addDaysIso(placement, 24), "energy", "گازوئیل و برق", 16800000 + spec.initial * 300, null, null, "پخش فرآورده‌های نفتی");
    insertCost.run(cycleId, addDaysIso(placement, 18), "transport", "حمل جوجه و نهاده‌ها", 5200000 + spec.initial * 120, null, null, "باربری سپاهان");
    insertCost.run(cycleId, addDaysIso(placement, 28), "equipment", "تعمیر سیستم آبخوری", 7300000, null, null, "خدمات فنی دامداری");

    if (spec.status === "closed") {
      const shipDay1 = 40;
      const shipDay2 = spec.ageDays;
      const birdsShip1 = Math.round(live * 0.62);
      const birdsShip2 = live - birdsShip1;
      const w1 = standardAt(shipDay1).weightG * 0.99;
      const w2 = standardAt(shipDay2).weightG * 0.995;
      insertSale.run(
        cycleId,
        addDaysIso(placement, shipDay1 - 1),
        birdsShip1,
        round((birdsShip1 * w1) / 1000, 0),
        95500,
        0,
        "کشتارگاه نمونه",
        "بارگیری نوبت اول — وزن زنده",
      );
      insertSale.run(
        cycleId,
        addDaysIso(placement, shipDay2 - 1),
        birdsShip2,
        round((birdsShip2 * w2) / 1000, 0),
        97500,
        1850000,
        "کشتارگاه نمونه",
        "فروش نهایی دوره",
      );
    }
  }
}
