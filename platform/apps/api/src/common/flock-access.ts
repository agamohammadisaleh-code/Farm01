import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import type { Flock } from "@farm/domain";
import { DATABASE, type Database } from "../db/database";
import { flocks } from "../db/schema";
import { toFlock } from "./mappers";

/**
 * دسترسی امن به گله.
 *
 * هر کوئری از مسیر گله → سالن → مزرعه مشتق می‌شود تا کاربر مزرعه A هرگز
 * نتواند با حدس UUID به داده مزرعه B برسد. بدون این لایه، فراموش‌کردن یک
 * شرط farm_id در یکی از سرویس‌ها یعنی نشت داده بین مستأجرها.
 */
@Injectable()
export class FlockAccess {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  private get db(): any {
    return this.database.db;
  }

  async require(farmId: string, flockId: string): Promise<Flock> {
    const rows = await this.db
      .select()
      .from(flocks)
      .where(and(eq(flocks.farmId, farmId), eq(flocks.id, flockId), isNull(flocks.deletedAt)))
      .limit(1);
    if (!rows[0]) throw new NotFoundException("گله یافت نشد.");
    return toFlock(rows[0]);
  }
}
