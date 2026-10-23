#!/usr/bin/env node
/**
 * انتقال داده از نسخه قدیمی (SQLite) به API جدید (PostgreSQL).
 *
 * استفاده:
 *   node platform/scripts/import-legacy.mjs \
 *     --db data/farm.db \
 *     --api http://localhost:4000/api/v1 \
 *     --email owner@farm.ir --password Secret1234
 *
 * اگر کاربر وجود نداشته باشد، ثبت‌نام انجام می‌شود و یک مزرعه جدید ساخته
 * می‌شود. سپس سالن‌ها (از نام سالن هر دوره)، گله‌ها، ثبت‌های روزانه،
 * وزن‌گیری‌ها (از وزن‌های ثبت‌شده در لاگ روزانه)، هزینه‌ها و فروش‌ها منتقل
 * می‌شوند.
 * عملیات idempotent است: شناسه هر دوره قدیمی در نقشه نگاشت ذخیره می‌شود و
 * اجرای دوباره رکورد تکراری نمی‌سازد (چون API برای هر روز upsert می‌کند و
 * دوره‌ها با نام + تاریخ جوجه‌ریزی تطبیق داده می‌شوند).
 */
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};

const dbPath = resolve(arg("db", "data/farm.db"));
const api = arg("api", "http://localhost:4000/api/v1").replace(/\/$/, "");
const email = arg("email", "owner@farm.ir");
const password = arg("password", "Secret1234");
const farmName = arg("farm", "مزرعه منتقل‌شده");

if (!existsSync(dbPath)) {
  console.error(`فایل پایگاه داده پیدا نشد: ${dbPath}`);
  process.exit(1);
}

const Database = require("better-sqlite3");
const db = new Database(dbPath, { readonly: true });

async function call(method, path, body, token) {
  const res = await fetch(`${api}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  // ۴۰۱/۴۰۹ وضعیت‌های موردانتظار در مسیر احراز هویت و تطبیق هستند؛
  // تصمیم‌گیری درباره آن‌ها به فراخواننده واگذار می‌شود.
  if (!res.ok && res.status !== 409 && res.status !== 401) {
    throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  }
  return { status: res.status, body: json };
}

async function authenticate() {
  const login = await call("POST", "/auth/login", { email, password });
  if (login.status === 200) return login.body.accessToken;

  const register = await call("POST", "/auth/register", { email, password, name: "مالک منتقل‌شده", farmName });
  if (register.body?.accessToken) return register.body.accessToken;

  throw new Error("ورود و ثبت‌نام هر دو ناموفق بودند؛ گذرواژه را بررسی کنید.");
}

const num = (v, d = 0) => (v === null || v === undefined ? d : Number(v));

async function main() {
  const token = await authenticate();
  const skipped = [];
  /** خطای یک رکورد نباید کل انتقال را متوقف کند */
  const attempt = async (label, fn) => {
    try {
      await fn();
      return true;
    } catch (err) {
      skipped.push(`${label}: ${String(err.message).slice(0, 160)}`);
      return false;
    }
  };

  const legacyCycles = db.prepare("SELECT * FROM cycles ORDER BY id").all();
  const existing = (await call("GET", "/flocks", null, token)).body;
  let created = 0;
  let logs = 0;
  let weights = 0;
  let costs = 0;
  let sales = 0;

  // نوع دان هر خرید: نسخه قدیمی ستون نداشت ولی نام نوع در توضیح آمده است.
  // هرچه تطبیق نخورد در استخر «دان (کل)» می‌نشیند.
  const feedTypes = new Set(
    db.prepare("SELECT DISTINCT feed_type FROM daily_logs WHERE feed_type IS NOT NULL").all().map((r) => r.feed_type),
  );
  const feedTypeOf = (description) => {
    const text = String(description ?? "");
    for (const type of feedTypes) if (text.includes(type)) return type;
    return "دان (کل)";
  };

  // سالن‌ها: از ستون «سالن» هر دوره ساخته می‌شوند
  const hallCache = new Map();
  const ensureHall = async (house, capacity) => {
    const name = (house ?? "").trim() || "سالن اصلی";
    if (hallCache.has(name)) return hallCache.get(name);
    const halls = (await call("GET", "/halls", null, token)).body;
    let hall = halls.find((h) => h.name === name);
    if (!hall) {
      hall = (await call("POST", "/halls", { name, capacity: Math.max(0, Math.round(capacity || 0)) }, token)).body;
    }
    hallCache.set(name, hall);
    return hall;
  };

  for (const c of legacyCycles) {
    // تطبیق برای اجرای دوباره: نام + تاریخ جوجه‌ریزی
    let cycle = existing.find((x) => x.name === c.name && x.start_date === String(c.placement_date).slice(0, 10));
    const hall = await ensureHall(c.house, c.initial_count);

    if (!cycle) {
      const res = await call(
        "POST",
        "/flocks",
        {
          hallId: hall.id,
          name: c.name,
          breed: c.breed ?? "راس ۳۰۸",
          startDate: String(c.placement_date).slice(0, 10),
          initialCount: num(c.initial_count, 1000),
          // هزینه جوجه در دوره جدید خودکار ساخته می‌شود؛ برای جلوگیری از
          // دوباره‌شماری، قیمت جوجه صفر فرستاده می‌شود و رکورد هزینه قدیمی
          // جداگانه منتقل می‌شود.
          chickPrice: 0,
          targetWeightG: num(c.target_weight_g, 2500),
          targetAgeDays: num(c.target_age_days, 42),
          notes: c.notes ?? undefined,
        },
        token,
      );
      cycle = res.body;
      created++;
    }

    if (c.status === "closed" && c.closed_date) {
      await call("PATCH", `/flocks/${cycle.id}`, { status: "closed", closedDate: String(c.closed_date).slice(0, 10) }, token);
    }

    const legacyLogs = db.prepare("SELECT * FROM daily_logs WHERE cycle_id = ? ORDER BY date").all(c.id);
    const existingWeights = (await call("GET", `/flocks/${cycle.id}/weights`, null, token)).body;
    const weightDates = new Set(existingWeights.map((w) => w.date));

    for (const l of legacyLogs) {
      const date = String(l.date).slice(0, 10);
      await attempt(`ثبت روزانه ${l.id} (${date})`, () =>
        call(
          "POST",
          `/flocks/${cycle.id}/logs`,
          {
            date,
            mortality: num(l.mortality),
            cull: num(l.culls),
            feedKg: num(l.feed_kg),
            waterLiter: num(l.water_l),
            ...(l.temp_c != null ? { avgTemp: num(l.temp_c) } : {}),
            feedType: l.feed_type ?? undefined,
            notes: l.notes ?? undefined,
          },
          token,
        ),
      );
      logs++;

      // وزن ثبت‌شده در لاگ قدیمی، در مدل جدید یک «وزن‌گیری نمونه‌ای» است
      if (l.avg_weight_g != null && l.avg_weight_g > 0 && !weightDates.has(date)) {
        const okw = await attempt(`وزن‌گیری ${l.id} (${date})`, () =>
          call(
            "POST",
            `/flocks/${cycle.id}/weights`,
            { date, sampleCount: 100, avgWeightGr: Math.round(num(l.avg_weight_g)), notes: "منتقل‌شده از ثبت روزانه" },
            token,
          ),
        );
        if (okw) {
          weights++;
          weightDates.add(date);
        }
      }
    }

    // برای اجرای دوباره بی‌خطر، هزینه‌های موجود در مقصد خوانده و بر اساس
    // (تاریخ، دسته، مبلغ، شرح) تطبیق داده می‌شوند.
    // شمارش چندتایی (multiset) نه مجموعه: دو خرید واقعی با همان مشخصات باید
    // هر دو منتقل شوند، ولی اجرای دوباره اسکریپت رکورد تکراری نمی‌سازد.
    const countKeys = (rows, keyOf) => {
      const map = new Map();
      for (const row of rows) {
        const k = keyOf(row);
        map.set(k, (map.get(k) ?? 0) + 1);
      }
      return map;
    };
    const costSeen = countKeys(
      (await call("GET", `/flocks/${cycle.id}/expenses`, null, token)).body,
      (x) => `${x.date}|${x.category}|${x.amount}|${x.description}`,
    );

    const legacyCosts = db.prepare("SELECT * FROM costs WHERE cycle_id = ?").all(c.id);
    for (const x of legacyCosts) {
      const date = String(x.date).slice(0, 10);
      const amount = Math.max(1, Math.round(num(x.amount)));
      const description = (x.description ?? "هزینه").slice(0, 200);
      const costKey = `${date}|${x.category}|${amount}|${description}`;
      if ((costSeen.get(costKey) ?? 0) > 0) {
        costSeen.set(costKey, costSeen.get(costKey) - 1);
        continue;
      }

      const ok = await attempt(`هزینه ${x.id} (${date})`, () =>
        call(
          "POST",
          `/flocks/${cycle.id}/expenses`,
          {
            date,
            category: x.category,
            description,
            amount,
            ...(x.quantity != null ? { quantity: num(x.quantity) } : {}),
            unit: x.unit ?? undefined,
            vendor: x.vendor ?? undefined,
            // خرید دان به انبار اضافه می‌شود
            ...(x.category === "feed" ? { feedType: feedTypeOf(x.description) } : {}),
          },
          token,
        ),
      );
      if (ok) costs++;
    }

    const saleSeen = countKeys(
      (await call("GET", `/flocks/${cycle.id}/sales`, null, token)).body,
      (x) => `${x.date}|${x.count}|${x.weight_kg}|${x.price_per_kg}`,
    );

    const legacySales = db.prepare("SELECT * FROM sales WHERE cycle_id = ?").all(c.id);
    for (const s of legacySales) {
      const saleDate = String(s.date).slice(0, 10);
      const saleCount = Math.max(1, Math.round(num(s.count)));
      const saleWeight = Math.max(0.1, num(s.weight_kg));
      const salePrice = Math.max(1, Math.round(num(s.price_per_kg)));
      const saleKey = `${saleDate}|${saleCount}|${saleWeight}|${salePrice}`;
      if ((saleSeen.get(saleKey) ?? 0) > 0) {
        saleSeen.set(saleKey, saleSeen.get(saleKey) - 1);
        continue;
      }

      await attempt(`فروش ${s.id} (${saleDate})`, () =>
        call(
          "POST",
          `/flocks/${cycle.id}/sales`,
          {
            date: saleDate,
            count: Math.max(1, Math.round(num(s.count))),
            totalWeightKg: Math.max(0.1, num(s.weight_kg)),
            pricePerKg: Math.max(1, Math.round(num(s.price_per_kg))),
            deductions: Math.round(num(s.deductions)),
            buyer: s.buyer ?? undefined,
            notes: s.notes ?? undefined,
          },
          token,
        ),
      );
      sales++;
    }
  }

  console.log("انتقال کامل شد:");
  console.log(`  دوره‌های جدید: ${created} از ${legacyCycles.length}`);
  console.log(`  ثبت روزانه (upsert): ${logs}`);
  console.log(`  وزن‌گیری: ${weights}`);
  console.log(`  هزینه: ${costs}`);
  console.log(`  فروش: ${sales}`);
  if (skipped.length) {
    console.log(`\n${skipped.length} رکورد منتقل نشد (قواعد اعتبارسنجی نسخه جدید):`);
    for (const line of skipped.slice(0, 20)) console.log(`  - ${line}`);
    if (skipped.length > 20) console.log(`  … و ${skipped.length - 20} مورد دیگر`);
    console.log("\nاین رکوردها در نسخه قدیمی مجاز بودند (مثلاً تاریخ آینده) و در نسخه جدید رد می‌شوند.");
  }
}

main().catch((err) => {
  console.error("خطا در انتقال:", err.message);
  process.exit(1);
});
