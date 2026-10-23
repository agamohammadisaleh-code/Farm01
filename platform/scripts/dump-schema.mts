/* تولید DDL واقعی از پایگاه‌داده‌ای که همه مهاجرت‌ها روی آن اجرا شده است.
   اجرا: npm run docs:schema  (از ریشه platform)
   خروجی: docs/architecture/schema.sql
   این فایل عمداً از خودِ پایگاه‌داده خوانده می‌شود، نه از حدس و دست‌نویس،
   تا سند با واقعیت یکی باشد. */
import { writeFileSync } from "node:fs";
import { createDatabase } from "../apps/api/src/db/database.ts";
import { runMigrations } from "../apps/api/src/db/migrate.ts";

process.env.PGLITE_DATA_DIR = process.env.PGLITE_DATA_DIR ?? "memory://";

const db = createDatabase();
const query = (sql: string) => db.query(sql);
await runMigrations(db);

const tables = (await db.query(`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  ORDER BY table_name
`)) as { table_name: string }[];

const q = async (sql: string) => (await query(sql)) as Record<string, any>[];

const lines: string[] = [];
const add = (line = "") => lines.push(line);

const domainTables = tables.filter((t) => !t.table_name.startsWith("_"));

add("-- ═══════════════════════════════════════════════════════════════════════");
add("-- مرغ‌یار — طرح پایگاه‌داده (PostgreSQL)");
add("-- این فایل از پایگاه‌داده‌ی واقعی پس از اجرای همه مهاجرت‌ها تولید شده است.");
add(`-- تعداد جدول‌ها: ${domainTables.length} (به‌علاوه جدول فنی _migrations)`);
add("-- ═══════════════════════════════════════════════════════════════════════");
add();

for (const { table_name } of tables) {
  if (table_name.startsWith("_")) continue;

  const cols = await q(
    `SELECT column_name, data_type, udt_name, character_maximum_length AS len,
            numeric_precision AS np, numeric_scale AS ns, is_nullable, column_default
     FROM information_schema.columns
     WHERE table_schema='public' AND table_name='${table_name}'
     ORDER BY ordinal_position`,
  );

  const pk = await q(
    `SELECT a.attname AS col
     FROM pg_index i
     JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
     WHERE i.indrelid = '${table_name}'::regclass AND i.indisprimary`,
  );

  add(`CREATE TABLE ${table_name} (`);
  const rendered = cols.map((c: Record<string, any>) => {
    let type = c.data_type;
    if (type === "numeric") type = `numeric(${c.np},${c.ns})`;
    else if (type === "character varying") type = `varchar(${c.len})`;
    else if (type === "timestamp with time zone") type = "timestamptz";
    else if (type === "USER-DEFINED") type = c.udt_name;
    const parts = [`  ${c.column_name} ${type}`];
    if (c.column_default) parts.push(`DEFAULT ${c.column_default}`);
    parts.push(c.is_nullable === "NO" ? "NOT NULL" : "NULL");
    return parts.join(" ");
  });
  const pkCols = pk.map((r: Record<string, any>) => r.col).join(", ");
  if (pkCols) rendered.push(`  PRIMARY KEY (${pkCols})`);
  add(rendered.join(",\n"));
  add(");");
  add();

  const indexes = await q(
    `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname='public' AND tablename='${table_name}' AND indexname NOT LIKE '%_pkey' ORDER BY indexname`,
  );
  for (const idx of indexes as Record<string, any>[]) add(`${idx.indexdef};`);
  if (indexes.length) add();

  const fks = await q(
    `SELECT conname, pg_get_constraintdef(c.oid) AS def
     FROM pg_constraint c
     WHERE c.conrelid = '${table_name}'::regclass AND c.contype IN ('f','c')
     ORDER BY conname`,
  );
  for (const fk of fks as Record<string, any>[]) add(`ALTER TABLE ${table_name} ADD CONSTRAINT ${fk.conname} ${fk.def};`);
  if (fks.length) add();
}

const out = lines.join("\n");
writeFileSync("docs/architecture/schema.sql", out + "\n");
console.log(`جدول‌ها: ${tables.length} · خطوط: ${lines.length}`);
await db.close();
