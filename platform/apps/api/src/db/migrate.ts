import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createDatabase, type Database } from "./database";

/**
 * اجراکننده مهاجرت‌ها.
 *
 * فایل‌های `.sql` در پوشه `migrations` به ترتیب نام اجرا می‌شوند و نام هر فایل
 * در جدول `_migrations` ثبت می‌شود؛ اجرای دوباره بی‌خطر است (idempotent).
 * هر مهاجرت در یک تراکنش اجرا می‌شود تا شکست نیمه‌کاره باقی نگذارد.
 */
/** پوشه مهاجرت‌ها: در بیلد کپی می‌شود؛ در اجرای مستقیم TS، از src خوانده می‌شود */
export function resolveMigrationsDir(): string {
  const candidates = [
    join(__dirname, "migrations"),
    join(__dirname, "../../src/db/migrations"),
    join(process.cwd(), "src/db/migrations"),
  ];
  return candidates.find((p) => existsSync(p)) ?? candidates[0]!;
}

export async function runMigrations(database: Database, dir = resolveMigrationsDir()) {
  await database.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  const applied = new Set<string>();
  for (const row of await database.query("SELECT name FROM _migrations")) {
    applied.add(String(row.name));
  }

  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const executed: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(dir, file), "utf8");
    await database.exec(`BEGIN;\n${sql}\nINSERT INTO _migrations (name) VALUES ('${file.replace(/'/g, "''")}');\nCOMMIT;`);
    executed.push(file);
  }
  return executed;
}

/** اجرای مهاجرت‌ها از خط فرمان: npm run db:migrate */
if (require.main === module) {
  (async () => {
    const database = createDatabase();
    const done = await runMigrations(database);
    // eslint-disable-next-line no-console
    console.log(done.length ? `مهاجرت‌های اجراشده: ${done.join(", ")}` : "همه مهاجرت‌ها از قبل اجرا شده‌اند.");
    await database.close();
  })().catch((err) => {
    // eslint-disable-next-line no-console
    console.error("خطا در مهاجرت:", err);
    process.exit(1);
  });
}
