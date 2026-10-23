import {
  boolean,
  date,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * طرح پایگاه داده PostgreSQL — مدل داده مصوب.
 *
 *   Farm ── Hall ── Flock ──┬── DailyLog
 *     │                     ├── WeightSample
 *     │                     ├── Vaccination
 *     │                     ├── Medication
 *     │                     ├── Expense
 *     │                     └── Sale
 *     └── FeedInventory
 *
 * قواعد طراحی:
 * - شناسه‌ها UUID متنی: کلاینت آفلاین پیش از اتصال رکورد می‌سازد و همان شناسه
 *   را هنگام همگام‌سازی می‌فرستد (بدون تصادم و بدون تبدیل شناسه).
 * - `updated_at` + `deleted_at` در همه جدول‌های داده: همگام‌سازی افزایشی و
 *   حذف نرم بدون از دست رفتن تاریخچه.
 * - چندمستأجری: `farm_id` روی مزرعه‌دارها؛ گله به سالن و سالن به مزرعه وصل
 *   است تا مالکیت از یک مسیر قابل اعتماد مشتق شود.
 * - مبالغ `numeric(14,0)` (تومان، بدون اعشار)؛ وزن و کمیت `numeric(12,2)`.
 */

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    phone: text("phone"),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    /** نقش در مزرعه اصلی */
    role: text("role").notNull().default("owner"),
    /** مزرعه اصلی کاربر */
    farmId: text("farm_id"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_uq").on(t.email), index("users_farm_idx").on(t.farmId)],
);

export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("refresh_user_idx").on(t.userId), uniqueIndex("refresh_hash_uq").on(t.tokenHash)],
);

export const farms = pgTable("farms", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  location: text("location"),
  ownerId: text("owner_id").references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

/**
 * عضویت چندمزرعه‌ای. `users.farm_id/role` مزرعه اصلی را نگه می‌دارد، اما
 * منبع حقیقت دسترسی همین جدول است: یک دامپزشک ممکن است چند مزرعه داشته باشد.
 */
export const farmMembers = pgTable(
  "farm_members",
  {
    farmId: text("farm_id")
      .notNull()
      .references(() => farms.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.farmId, t.userId] }), index("member_user_idx").on(t.userId)],
);

export const farmSettings = pgTable("farm_settings", {
  farmId: text("farm_id")
    .primaryKey()
    .references(() => farms.id, { onDelete: "cascade" }),
  marketPrice: numeric("market_price", { precision: 14, scale: 0 }).notNull(),
  feedPrice: numeric("feed_price", { precision: 14, scale: 0 }).notNull(),
  targetWeightG: integer("target_weight_g").notNull(),
  targetAgeDays: integer("target_age_days").notNull(),
  defaultBreed: text("default_breed").notNull(),
  /** آستانه هشدار انبار: کمتر از این تعداد روزِ مصرف باقی‌مانده = هشدار */
  feedAlertDays: integer("feed_alert_days").notNull().default(3),
  /** آستانه هشدار نرخ تلفات روزانه (٪ از پرندگان زنده) */
  dailyMortalityAlertPct: numeric("daily_mortality_alert_pct", { precision: 4, scale: 2 }).notNull().default("0.50"),
  /** آستانه هشدار افت مصرف آب (٪ نسبت به میانگین سه روز قبل) */
  waterDropAlertPct: numeric("water_drop_alert_pct", { precision: 4, scale: 2 }).notNull().default("10.00"),
  timezone: text("timezone").notNull().default("Asia/Tehran"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ---------------------------------- سالن ---------------------------------- */

export const halls = pgTable(
  "halls",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farms.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** ظرفیت اسمی سالن (قطعه) */
    capacity: integer("capacity").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("halls_farm_name_uq").on(t.farmId, t.name)],
);

/* ---------------------------------- گله ---------------------------------- */

export const flocks = pgTable(
  "flocks",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farms.id, { onDelete: "cascade" }),
    hallId: text("hall_id")
      .notNull()
      .references(() => halls.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    breed: text("breed").notNull(),
    startDate: date("start_date").notNull(),
    initialCount: integer("initial_count").notNull(),
    chickPrice: numeric("chick_price", { precision: 14, scale: 0 }).notNull().default("0"),
    targetWeightG: integer("target_weight_g").notNull().default(2500),
    targetAgeDays: integer("target_age_days").notNull().default(42),
    status: text("status").notNull().default("active"),
    closedDate: date("closed_date"),
    notes: text("notes"),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("flocks_farm_idx").on(t.farmId),
    index("flocks_hall_idx").on(t.hallId),
    index("flocks_status_idx").on(t.farmId, t.status),
  ],
);

/* ---------------------------------- ثبت روزانه ---------------------------------- */

export const dailyLogs = pgTable(
  "daily_logs",
  {
    id: text("id").primaryKey(),
    flockId: text("flock_id")
      .notNull()
      .references(() => flocks.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    mortality: integer("mortality").notNull().default(0),
    cull: integer("cull").notNull().default(0),
    feedKg: numeric("feed_kg", { precision: 12, scale: 2 }).notNull().default("0"),
    waterLiter: numeric("water_liter", { precision: 12, scale: 2 }).notNull().default("0"),
    /** میانگین دمای سالن */
    avgTemp: numeric("avg_temp", { precision: 5, scale: 1 }),
    /**
     * نوع دان مصرفی. افزوده نسبت به فهرست اولیه مدل: بدون آن، کسر خودکار از
     * انبار به تفکیک نوع دان (آغازین/رشد/پایانی) امکان‌پذیر نیست.
     */
    feedType: text("feed_type"),
    notes: text("notes"),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    // یک ثبت در هر روز برای هر گله؛ با upsert اتمیک نگهداری می‌شود
    uniqueIndex("daily_logs_flock_date_uq").on(t.flockId, t.date),
    index("daily_logs_flock_idx").on(t.flockId, t.date),
  ],
);

/* ---------------------------------- وزن‌گیری ---------------------------------- */

export const weightSamples = pgTable(
  "weight_samples",
  {
    id: text("id").primaryKey(),
    flockId: text("flock_id")
      .notNull()
      .references(() => flocks.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    /** تعداد قطعه وزن‌شده در نمونه */
    sampleCount: integer("sample_count").notNull().default(100),
    /** میانگین وزن نمونه (گرم) */
    avgWeightGr: integer("avg_weight_gr").notNull(),
    /** سبک‌ترین و سنگین‌ترین قطعه نمونه — پایه برآورد ضریب تغییرات */
    minWeightGr: integer("min_weight_gr"),
    maxWeightGr: integer("max_weight_gr"),
    /** ضریب تغییرات (٪) و یکنواختی (٪)؛ اگر کاربر نداده باشد محاسبه می‌شود */
    cvPct: numeric("cv_pct", { precision: 5, scale: 2 }),
    uniformityPct: numeric("uniformity_pct", { precision: 5, scale: 2 }),
    notes: text("notes"),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("weight_samples_flock_idx").on(t.flockId, t.date)],
);

/* ---------------------------------- سلامت ---------------------------------- */

export const vaccinations = pgTable(
  "vaccinations",
  {
    id: text("id").primaryKey(),
    flockId: text("flock_id")
      .notNull()
      .references(() => flocks.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    scheduledDate: date("scheduled_date").notNull(),
    doneDate: date("done_date"),
    /** scheduled | done | skipped — «عقب‌افتاده» از تاریخ محاسبه می‌شود */
    status: text("status").notNull().default("scheduled"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("vaccinations_flock_idx").on(t.flockId, t.scheduledDate)],
);

export const medications = pgTable(
  "medications",
  {
    id: text("id").primaryKey(),
    flockId: text("flock_id")
      .notNull()
      .references(() => flocks.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    dose: text("dose").notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date"),
    /** دوره پرهیز دارویی (روز) — پیش از فروش باید صفر شود */
    withdrawalDays: integer("withdrawal_days"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("medications_flock_idx").on(t.flockId, t.startDate)],
);

/* ---------------------------------- مالی ---------------------------------- */

export const expenses = pgTable(
  "expenses",
  {
    id: text("id").primaryKey(),
    flockId: text("flock_id")
      .notNull()
      .references(() => flocks.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    category: text("category").notNull(),
    amount: numeric("amount", { precision: 14, scale: 0 }).notNull(),
    description: text("description").notNull(),
    /** برای خرید دان: مقدار و واحد، تا انبار به‌روز شود */
    quantity: numeric("quantity", { precision: 12, scale: 2 }),
    unit: text("unit"),
    vendor: text("vendor"),
    /** برای خرید دان: نوع دان، تا افزایش/برگشت انبار دقیقاً به همان ردیف بخورد */
    feedType: text("feed_type"),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("expenses_flock_idx").on(t.flockId, t.date)],
);

export const sales = pgTable(
  "sales",
  {
    id: text("id").primaryKey(),
    flockId: text("flock_id")
      .notNull()
      .references(() => flocks.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    totalWeightKg: numeric("total_weight_kg", { precision: 12, scale: 2 }).notNull(),
    pricePerKg: numeric("price_per_kg", { precision: 14, scale: 0 }).notNull(),
    buyer: text("buyer"),
    /** اختیاری: اگر ثبت شود، شمارش زنده دقیق‌تر می‌شود */
    count: integer("count"),
    deductions: numeric("deductions", { precision: 14, scale: 0 }).notNull().default("0"),
    notes: text("notes"),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("sales_flock_idx").on(t.flockId, t.date)],
);

/* ---------------------------------- انبار دان ---------------------------------- */

export const feedInventory = pgTable(
  "feed_inventory",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farms.id, { onDelete: "cascade" }),
    feedType: text("feed_type").notNull(),
    quantityKg: numeric("quantity_kg", { precision: 12, scale: 2 }).notNull().default("0"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("feed_inventory_farm_type_uq").on(t.farmId, t.feedType)],
);

/** گزارش بی‌اثر بودن عملیات همگام‌سازی (idempotency) برای کلاینت آفلاین */
export const syncReceipts = pgTable(
  "sync_receipts",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farms.id, { onDelete: "cascade" }),
    clientId: text("client_id").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id").notNull(),
    appliedAt: timestamp("applied_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("sync_receipt_uq").on(t.clientId, t.entity, t.entityId)],
);
