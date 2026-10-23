/**
 * داده نمونه برای توسعه و نمایش.
 *
 * ساختار داده دقیقاً همان مدل نسخه دوم است:
 *   مزرعه → سالن → گله → (ثبت روزانه، وزن‌گیری، واکسن، دارو، هزینه، فروش)
 *   و انبار دان در سطح مزرعه.
 *
 * استفاده:
 *   npm run seed --workspace @farm/api
 *   SEED_RESET=1 npm run seed --workspace @farm/api   # پاک‌سازی و ساخت دوباره
 *
 * داده‌ها با شناسه‌های ثابت ساخته می‌شوند تا اجرای دوباره رکورد تکراری نسازد.
 * اگر کاربر نمونه وجود داشته باشد، رمز عبور او به مقدار SEED_PASSWORD برگردانده
 * می‌شود تا ورود برای توسعه آسان باشد.
 */
import "reflect-metadata";
import { Logger } from "@nestjs/common";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { createDatabase, type Database } from "./database";
import { runMigrations, resolveMigrationsDir } from "./migrate";
import {
  dailyLogs,
  expenses,
  farmMembers,
  farmSettings,
  farms,
  feedInventory,
  flocks,
  halls,
  medications,
  sales,
  users,
  vaccinations,
  weightSamples,
} from "./schema";

const logger = new Logger("Seed");

export const SEED_EMAIL = process.env.SEED_EMAIL ?? "owner@farm.ir";
export const SEED_PASSWORD = process.env.SEED_PASSWORD ?? "Secret1234";
const SEED_FARM = "farm-demo-0001";
const SEED_USER = "user-demo-0001";

/** تاریخ ISO با اختلاف روز نسبت به امروز (منطقه زمانی تهران) */
function dayIso(offsetDays: number): string {
  const now = new Date();
  now.setUTCDate(now.getUTCDate() + offsetDays);
  return now.toISOString().slice(0, 10);
}

type LogRow = {
  day: number;
  mortality: number;
  cull: number;
  feed: number;
  water: number;
  temp: number;
};

type WeightRow = { day: number; count: number; weight: number };

/**
 * پروفایل واقع‌نما بر پایه جدول استاندارد راس ۳۰۸ (تا روز ۴۹).
 * مقادیر کمی زیر استاندارد هستند تا هشدارها و پیش‌بینی‌ها در داشبورد دیده شوند.
 */
const PROFILE: LogRow[] = [
  { day: 1, mortality: 4, cull: 0, feed: 158, water: 270, temp: 33.2 },
  { day: 2, mortality: 7, cull: 0, feed: 264, water: 481, temp: 33.0 },
  { day: 3, mortality: 9, cull: 1, feed: 252, water: 458, temp: 32.6 },
  { day: 4, mortality: 18, cull: 0, feed: 251, water: 470, temp: 32.3 },
  { day: 5, mortality: 12, cull: 0, feed: 269, water: 462, temp: 32.1 },
  { day: 6, mortality: 16, cull: 0, feed: 311, water: 548, temp: 31.8 },
  { day: 7, mortality: 10, cull: 0, feed: 375, water: 682, temp: 31.4 },
  { day: 8, mortality: 15, cull: 1, feed: 462, water: 790, temp: 31.2 },
  { day: 9, mortality: 9, cull: 0, feed: 580, water: 995, temp: 30.4 },
  { day: 10, mortality: 14, cull: 0, feed: 671, water: 1208, temp: 30.3 },
  { day: 11, mortality: 10, cull: 0, feed: 761, water: 1446, temp: 29.7 },
  { day: 12, mortality: 6, cull: 0, feed: 834, water: 1457, temp: 29.3 },
  { day: 13, mortality: 8, cull: 0, feed: 863, water: 1633, temp: 29.0 },
  { day: 14, mortality: 7, cull: 1, feed: 917, water: 1652, temp: 28.5 },
  { day: 15, mortality: 8, cull: 0, feed: 1012, water: 1889, temp: 28.6 },
  { day: 16, mortality: 6, cull: 0, feed: 1150, water: 2188, temp: 28.2 },
  { day: 17, mortality: 7, cull: 0, feed: 1263, water: 2236, temp: 27.8 },
  { day: 18, mortality: 9, cull: 0, feed: 1351, water: 2606, temp: 28.0 },
  { day: 19, mortality: 6, cull: 0, feed: 1399, water: 2443, temp: 27.0 },
  { day: 20, mortality: 5, cull: 0, feed: 1457, water: 2701, temp: 26.8 },
  { day: 21, mortality: 8, cull: 0, feed: 1520, water: 2760, temp: 26.3 },
  { day: 22, mortality: 6, cull: 0, feed: 1592, water: 2872, temp: 26.0 },
  { day: 23, mortality: 5, cull: 0, feed: 1650, water: 2950, temp: 25.6 },
  { day: 24, mortality: 4, cull: 0, feed: 1701, water: 3010, temp: 25.2 },
  { day: 25, mortality: 6, cull: 0, feed: 1770, water: 3120, temp: 25.0 },
  { day: 26, mortality: 5, cull: 0, feed: 1802, water: 3180, temp: 24.8 },
  { day: 27, mortality: 4, cull: 0, feed: 1815, water: 3222, temp: 24.5 },
];

const WEIGHTS: WeightRow[] = [
  { day: 7, count: 100, weight: 172 },
  { day: 14, count: 100, weight: 441 },
  { day: 21, count: 100, weight: 802 },
  { day: 24, count: 120, weight: 1120 },
  { day: 27, count: 120, weight: 1335 },
];

async function reset(db: Database) {
  // ترتیب حذف بر اساس وابستگی‌های کلید خارجی
  await db.exec(`
    DELETE FROM feed_inventory;
    DELETE FROM sales;
    DELETE FROM expenses;
    DELETE FROM medications;
    DELETE FROM vaccinations;
    DELETE FROM weight_samples;
    DELETE FROM daily_logs;
    DELETE FROM flocks;
    DELETE FROM halls;
    DELETE FROM farm_settings;
    DELETE FROM farm_members;
    DELETE FROM refresh_tokens;
    DELETE FROM users;
    DELETE FROM farms;
  `);
}

export async function seed(db: Database) {
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 11);

  const existing = await db.db.select({ id: users.id }).from(users).where(eq(users.email, SEED_EMAIL)).limit(1);
  if (existing.length > 0) {
    // کاربر هست: فقط رمز را هم‌تراز می‌کنیم و از ساخت دوباره صرف‌نظر می‌کنیم
    await db.db.update(users).set({ passwordHash }).where(eq(users.email, SEED_EMAIL));
    logger.log(`داده نمونه از قبل موجود است (${SEED_EMAIL}).`);
    return { created: false };
  }

  const today = dayIso(0);
  const startDate = dayIso(-27);

  await db.db.insert(farms).values({
    id: SEED_FARM,
    name: "مزرعه نمونه مرغ‌یار",
    location: "ورامین — جاده چرمشهر",
    ownerId: SEED_USER,
  });

  await db.db.insert(users).values({
    id: SEED_USER,
    email: SEED_EMAIL,
    passwordHash,
    name: "مالک نمونه",
    phone: "09120000000",
    role: "owner",
    farmId: SEED_FARM,
  });

  await db.db.insert(farmMembers).values({ farmId: SEED_FARM, userId: SEED_USER, role: "owner" });

  await db.db.insert(farmSettings).values({
    farmId: SEED_FARM,
    marketPrice: "98000",
    feedPrice: "33500",
    targetWeightG: 2500,
    targetAgeDays: 42,
    defaultBreed: "راس ۳۰۸",
    feedAlertDays: 3,
    timezone: "Asia/Tehran",
  });

  await db.db.insert(halls).values([
    { id: "hall-demo-0001", farmId: SEED_FARM, name: "سالن ۱", capacity: 12000 },
    { id: "hall-demo-0002", farmId: SEED_FARM, name: "سالن ۲", capacity: 8000 },
    { id: "hall-demo-0003", farmId: SEED_FARM, name: "سالن ۳", capacity: 9000 },
  ]);

  await db.db.insert(flocks).values([
    {
      id: "flock-demo-0001",
      farmId: SEED_FARM,
      hallId: "hall-demo-0001",
      name: "گله پاییزه",
      breed: "راس ۳۰۸",
      startDate,
      initialCount: 12000,
      chickPrice: "27000",
      targetWeightG: 2450,
      targetAgeDays: 42,
      status: "active",
      createdBy: SEED_USER,
    },
    {
      id: "flock-demo-0002",
      farmId: SEED_FARM,
      hallId: "hall-demo-0002",
      name: "گله دوم — مرداد",
      breed: "کاب ۵۰۰",
      startDate: dayIso(-60),
      initialCount: 8000,
      chickPrice: "26000",
      targetWeightG: 2500,
      targetAgeDays: 42,
      status: "active",
      createdBy: SEED_USER,
    },
  ]);

  // ثبت روزانه + وزن‌گیری نمونه‌ای
  const logs = PROFILE.map((row) => ({
    id: `log-demo-${String(row.day).padStart(4, "0")}`,
    flockId: "flock-demo-0001",
    date: dayIso(-27 + row.day - 1),
    mortality: row.mortality,
    cull: row.cull,
    feedKg: String(row.feed),
    waterLiter: String(row.water),
    avgTemp: String(row.temp),
    feedType: row.day <= 10 ? "دان آغازین" : row.day <= 21 ? "دان رشد" : "دان پایانی",
    createdBy: SEED_USER,
  }));
  await db.db.insert(dailyLogs).values(logs);

  const weights = WEIGHTS.map((row) => ({
    id: `weight-demo-${String(row.day).padStart(4, "0")}`,
    flockId: "flock-demo-0001",
    date: dayIso(-27 + row.day - 1),
    sampleCount: row.count,
    avgWeightGr: row.weight,
    createdBy: SEED_USER,
  }));
  await db.db.insert(weightSamples).values(weights);

  // گله دوم: پس از ۴۲ روز بسته شده و فروش ثبت شده است
  await db.db.update(flocks).set({ status: "closed", closedDate: dayIso(-18) }).where(eq(flocks.id, "flock-demo-0002"));

  // سلامت: یک واکسن انجام‌شده، یک واکسن عقب‌افتاده، یک دارو با دوره پرهیز
  await db.db.insert(vaccinations).values([
    {
      id: "vac-demo-0001",
      flockId: "flock-demo-0001",
      name: "نیوکاسل (B1)",
      scheduledDate: dayIso(-25),
      doneDate: dayIso(-25),
      status: "done",
      notes: "قطره چشمی",
    },
    {
      id: "vac-demo-0002",
      flockId: "flock-demo-0001",
      name: "برونشیت (IB)",
      scheduledDate: dayIso(-14),
      doneDate: dayIso(-14),
      status: "done",
      notes: "آب آشامیدنی",
    },
    {
      id: "vac-demo-0003",
      flockId: "flock-demo-0001",
      name: "نیوکاسل (لاسوتا)",
      scheduledDate: dayIso(-2),
      status: "scheduled",
      notes: "برنامه عقب افتاده است",
    },
  ]);

  await db.db.insert(medications).values([
    {
      id: "med-demo-0001",
      flockId: "flock-demo-0001",
      name: "اکسی‌تتراسایکلین",
      dose: "۱ گرم در لیتر آب",
      startDate: dayIso(-4),
      endDate: dayIso(-1),
      withdrawalDays: 7,
      notes: "درمان تنفسی",
    },
  ]);

  // هزینه‌ها
  await db.db.insert(expenses).values([
    {
      id: "exp-demo-0001",
      flockId: "flock-demo-0001",
      date: startDate,
      category: "chick",
      description: "خرید جوجه یک‌روزه",
      amount: String(12000 * 27000),
      quantity: "12000",
      unit: "قطعه",
      createdBy: SEED_USER,
    },
    {
      id: "exp-demo-0002",
      flockId: "flock-demo-0001",
      date: startDate,
      category: "feed",
      description: "خرید دان آغازین",
      amount: "334000000",
      quantity: "10000",
      unit: "کیلوگرم",
      feedType: "دان آغازین",
      createdBy: SEED_USER,
    },
    {
      id: "exp-demo-0003",
      flockId: "flock-demo-0001",
      date: dayIso(-18),
      category: "feed",
      description: "خرید دان رشد",
      amount: "468750000",
      quantity: "15000",
      unit: "کیلوگرم",
      feedType: "دان رشد",
      createdBy: SEED_USER,
    },
    {
      id: "exp-demo-0004",
      flockId: "flock-demo-0001",
      date: dayIso(-14),
      category: "medication",
      description: "دارو و مکمل",
      amount: "13740000",
      createdBy: SEED_USER,
    },
    {
      id: "exp-demo-0005",
      flockId: "flock-demo-0001",
      date: dayIso(-10),
      category: "labor",
      description: "دستمزد کارگر",
      amount: "81600000",
      createdBy: SEED_USER,
    },
    {
      id: "exp-demo-0006",
      flockId: "flock-demo-0001",
      date: dayIso(-8),
      category: "energy",
      description: "گازوئیل و برق",
      amount: "38740000",
      createdBy: SEED_USER,
    },
    {
      id: "exp-demo-0007",
      flockId: "flock-demo-0001",
      date: dayIso(-20),
      category: "litter",
      description: "خرید بستر",
      amount: "10800000",
      createdBy: SEED_USER,
    },
    {
      id: "exp-demo-0009",
      flockId: "flock-demo-0001",
      date: dayIso(-6),
      category: "feed",
      description: "خرید دان پایانی",
      amount: "402000000",
      quantity: "12000",
      unit: "کیلوگرم",
      feedType: "دان پایانی",
      createdBy: SEED_USER,
    },
    {
      id: "exp-demo-0008",
      flockId: "flock-demo-0002",
      date: dayIso(-58),
      category: "feed",
      description: "خرید دان پایانی",
      amount: "770000000",
      quantity: "22000",
      unit: "کیلوگرم",
      feedType: "دان پایانی",
      createdBy: SEED_USER,
    },
  ]);

  // فروش گله بسته‌شده
  await db.db.insert(sales).values({
    id: "sale-demo-0001",
    flockId: "flock-demo-0002",
    date: dayIso(-19),
    count: 7600,
    totalWeightKg: "19760.5",
    pricePerKg: "108000",
    deductions: "12000000",
    buyer: "کشتارگاه نمونه",
    createdBy: SEED_USER,
  });

  // انبار دان: خرید منهای مصرف (همان قاعده‌ای که سرویس به‌صورت افزایشی اعمال می‌کند)
  const used = (type: string) =>
    logs.filter((l) => l.feedType === type).reduce((sum, l) => sum + Number(l.feedKg), 0);

  await db.db.insert(feedInventory).values([
    { id: "inv-demo-0001", farmId: SEED_FARM, feedType: "دان آغازین", quantityKg: String(10000 - used("دان آغازین")) },
    { id: "inv-demo-0002", farmId: SEED_FARM, feedType: "دان رشد", quantityKg: String(15000 - used("دان رشد")) },
    { id: "inv-demo-0003", farmId: SEED_FARM, feedType: "دان پایانی", quantityKg: String(0 - used("دان پایانی")) },
  ]);

  logger.log(`داده نمونه ساخته شد: ${SEED_EMAIL} / ${SEED_PASSWORD} (امروز ${today})`);
  return { created: true };
}

async function main() {
  const db = createDatabase();
  await runMigrations(db, resolveMigrationsDir());
  if (process.env.SEED_RESET === "1") await reset(db);
  await seed(db);
  await db.close();
}

// اجرای مستقیم (tsx) — در حالت import برای تست، main اجرا نمی‌شود
if (process.env.NODE_ENV !== "test") {
  main().catch((error) => {
    logger.error("ساخت داده نمونه ناموفق بود", error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
