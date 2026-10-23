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
 * طرح پایگاه داده PostgreSQL.
 *
 * قواعد طراحی:
 * - همه شناسه‌ها UUID متنی هستند تا کلاینت آفلاین بتواند پیش از اتصال رکورد بسازد
 *   و هنگام همگام‌سازی همان شناسه را ارسال کند (بدون تصادم).
 * - هر جدول قابل نوشتن `updated_at` و `deleted_at` دارد: همگام‌سازی افزایشی و
 *   حذف نرم بدون از دست رفتن تاریخچه.
 * - جداسازی چندمستأجری با `farm_id` در همه جدول‌های داده و کنترل دسترسی در
 *   لایه سرویس (هیچ کوئری بدون شرط farm_id اجرا نمی‌شود).
 * - اعداد پولی `numeric(14,0)` (تومان، بدون اعشار) و کمیت‌ها `numeric(12,2)`.
 */

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    name: text("name").notNull(),
    phone: text("phone"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_uq").on(t.email)],
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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

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
  timezone: text("timezone").notNull().default("Asia/Tehran"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const cycles = pgTable(
  "cycles",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farms.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    house: text("house").notNull().default(""),
    breed: text("breed").notNull(),
    placementDate: date("placement_date").notNull(),
    initialCount: integer("initial_count").notNull(),
    chickPrice: numeric("chick_price", { precision: 14, scale: 0 }).notNull().default("0"),
    targetWeightG: integer("target_weight_g").notNull(),
    targetAgeDays: integer("target_age_days").notNull(),
    status: text("status").notNull().default("active"),
    closedDate: date("closed_date"),
    notes: text("notes"),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("cycles_farm_idx").on(t.farmId), index("cycles_status_idx").on(t.farmId, t.status)],
);

export const dailyLogs = pgTable(
  "daily_logs",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farms.id, { onDelete: "cascade" }),
    cycleId: text("cycle_id")
      .notNull()
      .references(() => cycles.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    mortality: integer("mortality").notNull().default(0),
    culls: integer("culls").notNull().default(0),
    feedKg: numeric("feed_kg", { precision: 12, scale: 2 }).notNull().default("0"),
    waterL: numeric("water_l", { precision: 12, scale: 2 }).notNull().default("0"),
    tempC: numeric("temp_c", { precision: 5, scale: 1 }),
    avgWeightG: integer("avg_weight_g"),
    feedType: text("feed_type"),
    notes: text("notes"),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    // یک ثبت در هر روز برای هر دوره — قاعده‌ای که در نسخه SQLite با مهاجرت اعمال شد
    uniqueIndex("daily_logs_cycle_date_uq").on(t.cycleId, t.date),
    index("daily_logs_cycle_idx").on(t.cycleId, t.date),
  ],
);

export const costs = pgTable(
  "costs",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farms.id, { onDelete: "cascade" }),
    cycleId: text("cycle_id")
      .notNull()
      .references(() => cycles.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    category: text("category").notNull(),
    description: text("description").notNull(),
    amount: numeric("amount", { precision: 14, scale: 0 }).notNull(),
    quantity: numeric("quantity", { precision: 12, scale: 2 }),
    unit: text("unit"),
    vendor: text("vendor"),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("costs_cycle_idx").on(t.cycleId, t.date)],
);

export const sales = pgTable(
  "sales",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farms.id, { onDelete: "cascade" }),
    cycleId: text("cycle_id")
      .notNull()
      .references(() => cycles.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    count: integer("count").notNull(),
    weightKg: numeric("weight_kg", { precision: 12, scale: 2 }).notNull(),
    pricePerKg: numeric("price_per_kg", { precision: 14, scale: 0 }).notNull(),
    deductions: numeric("deductions", { precision: 14, scale: 0 }).notNull().default("0"),
    buyer: text("buyer"),
    notes: text("notes"),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("sales_cycle_idx").on(t.cycleId, t.date)],
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
