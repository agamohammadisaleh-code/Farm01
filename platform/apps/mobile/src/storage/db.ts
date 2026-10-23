/* پایگاه‌داده محلی گوشی (expo-sqlite).

   اصل Offline-First: هر ثبت **اول** در SQLite ذخیره می‌شود و بلافاصله در
   صفحه دیده می‌شود؛ ارسال به سرور یک کار پس‌زمینه است. اگر کاربر در سالن
   اینترنت نداشته باشد، هیچ چیزی گم نمی‌شود و هیچ دکمه‌ای هم غیرفعال نمی‌شود.

   دو نکته که آگاهانه انتخاب شده‌اند:
   - صف عملیات در همان پایگاه‌داده ذخیره می‌شود (نه حافظه)، چون اپ ممکن است
     توسط سیستم‌عامل بسته شود.
   - هیچ داده‌ای «فقط در سرور» فرض نمی‌شود: همه چیز نسخه محلی دارد و
     `updated_at` مبنای حل تعارض است.
*/

import * as SQLite from "expo-sqlite";
import type { QueueState, SyncOperation } from "@farm/domain";

const DB_NAME = "morghyar.db";
let db: SQLite.SQLiteDatabase | null = null;

export function openDb(): SQLite.SQLiteDatabase {
  if (db) return db;
  db = SQLite.openDatabaseSync(DB_NAME);
  db.execSync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS kv (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT
    );

    -- صف عملیات آفلاین
    CREATE TABLE IF NOT EXISTS queue (
      client_id TEXT PRIMARY KEY NOT NULL,
      type TEXT NOT NULL,
      flock_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      last_error TEXT,
      next_attempt_at TEXT
    );

    -- ثبت‌های روزانه محلی (آینه‌ای از سرور + ثبت‌های در صف)
    -- کلید طبیعی (گله، تاریخ) است، نه شناسه سرور: قاعده کسب‌وکار می‌گوید
    -- هر گله در هر روز یک ثبت دارد. اگر کلید شناسه سرور بود، ثبت محلیِ
    -- همان روز با رکورد همگام‌شده تصادم می‌کرد.
    CREATE TABLE IF NOT EXISTS logs (
      flock_id TEXT NOT NULL,
      date TEXT NOT NULL,
      id TEXT,
      mortality INTEGER NOT NULL DEFAULT 0,
      cull INTEGER NOT NULL DEFAULT 0,
      feed_kg REAL NOT NULL DEFAULT 0,
      water_liter REAL NOT NULL DEFAULT 0,
      avg_temp REAL,
      feed_type TEXT,
      notes TEXT,
      updated_at TEXT,
      pending INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (flock_id, date)
    );

    CREATE TABLE IF NOT EXISTS flocks (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      hall_name TEXT,
      breed TEXT,
      start_date TEXT,
      initial_count INTEGER,
      status TEXT,
      target_weight_g INTEGER,
      updated_at TEXT,
      deleted INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS reminders (
      id TEXT PRIMARY KEY NOT NULL,
      kind TEXT NOT NULL,
      severity TEXT,
      title TEXT NOT NULL,
      detail TEXT,
      due TEXT,
      days_left INTEGER,
      flock_id TEXT,
      flock_name TEXT,
      href TEXT,
      fetched_at TEXT NOT NULL
    );
  `);

  migrate(db);
  return db;
}

/**
 * مهاجرت محلی. شماره نسخه در `PRAGMA user_version` نگه داشته می‌شود.
 * نسخه ۱: کلید جدول ثبت‌ها از «شناسه» به «گله + تاریخ» تغییر کرد.
 */
function migrate(database: SQLite.SQLiteDatabase): void {
  const row = database.getFirstSync<{ user_version: number }>("PRAGMA user_version");
  const version = row?.user_version ?? 0;
  if (version >= 1) return;

  database.execSync(`
    DROP TABLE IF EXISTS logs;
    CREATE TABLE logs (
      flock_id TEXT NOT NULL,
      date TEXT NOT NULL,
      id TEXT,
      mortality INTEGER NOT NULL DEFAULT 0,
      cull INTEGER NOT NULL DEFAULT 0,
      feed_kg REAL NOT NULL DEFAULT 0,
      water_liter REAL NOT NULL DEFAULT 0,
      avg_temp REAL,
      feed_type TEXT,
      notes TEXT,
      updated_at TEXT,
      pending INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (flock_id, date)
    );
    PRAGMA user_version = 1;
  `);
}

/* ---------------------------------- kv ---------------------------------- */

export function getValue(key: string): string | null {
  const row = openDb().getFirstSync<{ value: string }>("SELECT value FROM kv WHERE key = ?", [key]);
  return row?.value ?? null;
}

export function setValue(key: string, value: string | null): void {
  openDb().runSync(
    "INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [key, value],
  );
}

export function getJson<T>(key: string, fallback: T): T {
  const raw = getValue(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function setJson(key: string, value: unknown): void {
  setValue(key, JSON.stringify(value));
}

/* -------------------------------- صف -------------------------------- */

export function loadQueue(): QueueState {
  const rows = openDb().getAllSync<any>("SELECT * FROM queue ORDER BY created_at ASC");
  const operations: SyncOperation[] = rows.map((row) => ({
    clientId: row.client_id,
    type: row.type,
    flockId: row.flock_id,
    payload: JSON.parse(row.payload),
    createdAt: row.created_at,
    attempts: row.attempts,
    status: row.status,
    lastError: row.last_error ?? undefined,
    nextAttemptAt: row.next_attempt_at ?? undefined,
  }));
  return { operations, lastSyncedAt: getValue("lastSyncedAt") };
}

export function saveQueue(state: QueueState): void {
  const database = openDb();
  database.withTransactionSync(() => {
    // ساده و قابل اتکا: صف کوچک است (چند ده عملیات)، پس بازنویسی کامل
    database.execSync("DELETE FROM queue");
    for (const op of state.operations) {
      database.runSync(
        `INSERT INTO queue (client_id, type, flock_id, payload, created_at, attempts, status, last_error, next_attempt_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          op.clientId,
          op.type,
          op.flockId,
          JSON.stringify(op.payload),
          op.createdAt,
          op.attempts,
          op.status,
          op.lastError ?? null,
          op.nextAttemptAt ?? null,
        ],
      );
    }
  });
  setValue("lastSyncedAt", state.lastSyncedAt);
}

/* ------------------------------- ثبت روزانه ------------------------------- */

export interface LocalLog {
  /** شناسه سمت سرور؛ برای ثبتِ در صف هنوز وجود ندارد */
  id: string | null;
  flock_id: string;
  date: string;
  mortality: number;
  cull: number;
  feed_kg: number;
  water_liter: number;
  avg_temp: number | null;
  pending: number;
  updated_at?: string | null;
}

export function upsertLocalLog(log: Omit<LocalLog, "pending"> & { pending?: number }): void {
  openDb().runSync(
    `INSERT INTO logs (flock_id, date, id, mortality, cull, feed_kg, water_liter, avg_temp, updated_at, pending)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(flock_id, date) DO UPDATE SET
       id = COALESCE(excluded.id, logs.id),
       mortality = excluded.mortality, cull = excluded.cull, feed_kg = excluded.feed_kg,
       water_liter = excluded.water_liter, avg_temp = excluded.avg_temp,
       updated_at = excluded.updated_at, pending = excluded.pending`,
    [
      log.flock_id,
      log.date,
      log.id ?? null,
      log.mortality,
      log.cull,
      log.feed_kg,
      log.water_liter,
      log.avg_temp,
      log.updated_at ?? new Date().toISOString(),
      log.pending ?? 0,
    ],
  );
}

export function logsForDate(flockId: string, date: string): LocalLog | null {
  return (
    openDb().getFirstSync<LocalLog>("SELECT * FROM logs WHERE flock_id = ? AND date = ?", [flockId, date]) ?? null
  );
}

export function recentLogs(flockId: string, limit = 14): LocalLog[] {
  return openDb().getAllSync<LocalLog>(
    "SELECT * FROM logs WHERE flock_id = ? ORDER BY date DESC LIMIT ?",
    [flockId, limit],
  );
}

/** پس از تأیید سرور: ثبت دیگر «در صف» نیست و شناسه سرور را می‌گیرد */
export function clearPendingFlag(flockId: string, date: string, serverId?: string | null): void {
  openDb().runSync(
    "UPDATE logs SET pending = 0, id = COALESCE(?, id), updated_at = ? WHERE flock_id = ? AND date = ?",
    [serverId ?? null, new Date().toISOString(), flockId, date],
  );
}

export function deleteLocalLogByServerId(id: string): void {
  openDb().runSync("DELETE FROM logs WHERE id = ?", [id]);
}

export function logByKey(flockId: string, date: string): LocalLog | null {
  return openDb().getFirstSync<LocalLog>("SELECT * FROM logs WHERE flock_id = ? AND date = ?", [flockId, date]) ?? null;
}

export function localLogKeys(flockId: string): { flock_id: string; date: string }[] {
  return openDb().getAllSync<{ flock_id: string; date: string }>(
    "SELECT flock_id, date FROM logs WHERE flock_id = ?",
    [flockId],
  );
}

/* -------------------------------- گله‌ها -------------------------------- */

export interface LocalFlock {
  id: string;
  name: string;
  hall_name?: string;
  breed?: string;
  start_date?: string;
  initial_count?: number;
  status?: string;
  target_weight_g?: number;
  updated_at?: string | null;
}

export function upsertFlocks(rows: LocalFlock[], deletedIds: string[] = []): void {
  const database = openDb();
  database.withTransactionSync(() => {
    for (const flock of rows) {
      database.runSync(
        `INSERT INTO flocks (id, name, hall_name, breed, start_date, initial_count, status, target_weight_g, updated_at, deleted)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name, hall_name = excluded.hall_name, breed = excluded.breed,
           start_date = excluded.start_date, initial_count = excluded.initial_count,
           status = excluded.status, target_weight_g = excluded.target_weight_g,
           updated_at = excluded.updated_at, deleted = 0`,
        [
          flock.id,
          flock.name,
          flock.hall_name ?? null,
          flock.breed ?? null,
          flock.start_date ?? null,
          flock.initial_count ?? null,
          flock.status ?? null,
          flock.target_weight_g ?? null,
          flock.updated_at ?? null,
        ],
      );
    }
    for (const id of deletedIds) {
      database.runSync("UPDATE flocks SET deleted = 1 WHERE id = ?", [id]);
    }
  });
}

export function listFlocks(): LocalFlock[] {
  return openDb().getAllSync<LocalFlock>("SELECT * FROM flocks WHERE deleted = 0 ORDER BY name");
}

/* -------------------------------- یادآورها -------------------------------- */

export function replaceReminders(rows: any[]): void {
  const database = openDb();
  const fetchedAt = new Date().toISOString();
  database.withTransactionSync(() => {
    database.execSync("DELETE FROM reminders");
    for (const r of rows) {
      database.runSync(
        `INSERT INTO reminders (id, kind, severity, title, detail, due, days_left, flock_id, flock_name, href, fetched_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          r.id,
          r.kind,
          r.severity ?? null,
          r.title,
          r.detail ?? null,
          r.due ?? null,
          r.daysLeft ?? null,
          r.flockId ?? null,
          r.flockName ?? null,
          r.href ?? null,
          fetchedAt,
        ],
      );
    }
  });
}

export function listReminders(): any[] {
  return openDb().getAllSync<any>("SELECT * FROM reminders");
}

export function resetLocalData(): void {
  const database = openDb();
  database.withTransactionSync(() => {
    database.execSync("DELETE FROM queue; DELETE FROM logs; DELETE FROM flocks; DELETE FROM reminders; DELETE FROM kv;");
  });
}
