import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzleNodePg } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

/**
 * لایه اتصال پایگاه داده.
 *
 * - در تولید: PostgreSQL واقعی از طریق `DATABASE_URL` (درایور node-postgres).
 * - در توسعه و تست: PGlite — همان موتور PostgreSQL کامپایل‌شده به WASM که
 *   بدون نصب سرور اجرا می‌شود. مزیت مهم: همان SQL و همان رفتار (numeric،
 *   timestamptz، ایندکس یکتا، ON CONFLICT) آزمایش می‌شود، نه یک جایگزین ساده‌شده.
 *
 * انتخاب خودکار است: اگر DATABASE_URL تنظیم شده و PG_DRIVER=postgres باشد از
 * PostgreSQL واقعی، در غیر این صورت از PGlite استفاده می‌شود.
 */

export type Db = ReturnType<typeof drizzlePglite<typeof schema>> | ReturnType<typeof drizzleNodePg<typeof schema>>;

export class Database {
  constructor(
    /** نمونه drizzle برای کوئری‌های نوع‌دار */
    public readonly db: any,
    /** اجرای SQL خام (مهاجرت‌ها، دستورهای DDL) */
    public readonly exec: (sql: string) => Promise<void>,
    /** اجرای کوئری خام و دریافت ردیف‌ها */
    public readonly query: (sql: string) => Promise<Record<string, unknown>[]>,
    public readonly close: () => Promise<void>,
    public readonly driver: "pglite" | "postgres",
  ) {}
}

export function createDatabase(env: NodeJS.ProcessEnv = process.env): Database {
  const logger = new Logger("Database");
  const usePostgres = env.PG_DRIVER === "postgres" || (!env.PGLITE && !!env.DATABASE_URL && env.NODE_ENV === "production");

  if (usePostgres) {
    const pool = new Pool({ connectionString: env.DATABASE_URL, max: Number(env.PG_POOL_MAX ?? 10) });
    logger.log("اتصال به PostgreSQL واقعی");
    return new Database(
      drizzleNodePg(pool, { schema }),
      async (sql) => {
        await pool.query(sql);
      },
      async (sql) => (await pool.query(sql)).rows,
      async () => {
        await pool.end();
      },
      "postgres",
    );
  }

  const dataDir = env.PGLITE_DATA_DIR ?? "memory://";
  const client = new PGlite(dataDir);
  logger.log(`PGlite (${dataDir}) — مناسب توسعه و تست`);
  return new Database(
    drizzlePglite(client, { schema }),
    async (sql) => {
      await client.exec(sql);
    },
    async (sql) => (await client.query(sql)).rows as Record<string, unknown>[],
    async () => {
      await client.close();
    },
    "pglite",
  );
}

export const DATABASE = Symbol("DATABASE");

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  readonly handle: Database;

  constructor() {
    this.handle = createDatabase();
  }

  get db(): any {
    return this.handle.db;
  }

  async onModuleDestroy() {
    await this.handle.close();
  }
}
