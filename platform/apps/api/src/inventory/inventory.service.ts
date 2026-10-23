import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { FeedInventory } from "@farm/domain";
import { DATABASE, type Database } from "../db/database";
import { feedInventory } from "../db/schema";
import { toFeedInventory } from "../common/mappers";
import { n } from "../common/parse";

/**
 * انبار دان.
 *
 * موجودی به تفکیک «نوع دان» نگهداری می‌شود و به‌صورت افزایشی به‌روز می‌شود:
 *   + خرید (هزینه دسته «دان» با مقدار کیلوگرم)
 *   − مصرف (ثبت روزانه، بر اساس نوع دان همان ثبت)
 *   ± اصلاح دستی (شمارش انبار، ضایعات، ...)
 *
 * دلیل انتخاب به‌روزرسانی افزایشی به‌جای محاسبه لحظه‌ای: مصرف روزانه به نوع
 * دان گره خورده و بازمحاسبه کامل پس از هر ویرایش، به تاریخچه حرکات نیاز دارد.
 * برای همین، ویرایش یک ثبت روزانه اختلاف(old − new) را برمی‌گرداند تا موجودی
 * هرگز دوبار کم یا زیاد نشود.
 *
 * انبار یک «دفتر» است، نه یک شمارنده: خرید +، مصرف −.
 * موجودی منفی مسدود نمی‌شود، چون معنی روشنی دارد: مصرفی ثبت شده که خریدِ
 * هم‌نوعش ثبت نشده. پنهان‌کردن آن با بریدن به صفر باعث می‌شود انبار بیشتر از
 * واقعیت نشان داده شود (تجربه انتقال داده قدیمی همین را نشان داد). این کمبود
 * در شاخص‌ها به‌صورت هشدار دیده می‌شود.
 * تنها «تعیین قطعی» و «اصلاح دستی» منفی نمی‌شوند؛ آن‌ها ورودی انسانی‌اند.
 */

/** ردیف استخر مشترک برای دان بدون نوع مشخص */
export const POOL_FEED_TYPE = "دان (کل)";

const normalizeType = (feedType: string) => feedType.trim().slice(0, 60) || "دان";
@Injectable()
export class InventoryService {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  private get db(): any {
    return this.database.db;
  }

  async list(farmId: string): Promise<FeedInventory[]> {
    const rows = await this.db
      .select()
      .from(feedInventory)
      .where(eq(feedInventory.farmId, farmId))
      .orderBy(asc(feedInventory.feedType));
    return rows.map(toFeedInventory);
  }

  async findByType(farmId: string, feedType: string) {
    const rows = await this.db
      .select()
      .from(feedInventory)
      .where(and(eq(feedInventory.farmId, farmId), eq(feedInventory.feedType, feedType)))
      .limit(1);
    return rows[0] ?? null;
  }

  /**
   * افزایش موجودی (خرید یا اصلاح مثبت). اگر ردیف نوع دان نباشد ساخته می‌شود.
   * در تراکنش فراخواننده اجرا می‌شود (tx پاس داده می‌شود).
   */
  async add(tx: any, farmId: string, feedType: string, deltaKg: number) {
    if (!deltaKg) return;
    const type = normalizeType(feedType);
    if (deltaKg > 0) return this.credit(tx, farmId, type, deltaKg);
    return this.deduct(tx, farmId, type, -deltaKg);
  }

  private async rowFor(tx: any, farmId: string, type: string) {
    const rows = await tx
      .select()
      .from(feedInventory)
      .where(and(eq(feedInventory.farmId, farmId), eq(feedInventory.feedType, type)))
      .limit(1);
    return rows[0] ?? null;
  }

  private async credit(tx: any, farmId: string, type: string, kg: number) {
    const existing = await this.rowFor(tx, farmId, type);
    if (existing) {
      await tx
        .update(feedInventory)
        .set({ quantityKg: String(n(existing.quantityKg) + kg), updatedAt: new Date() })
        .where(eq(feedInventory.id, existing.id));
    } else {
      await tx.insert(feedInventory).values({ id: randomUUID(), farmId, feedType: type, quantityKg: String(kg) });
    }
  }

  /** کسر مصرف؛ ممکن است موجودی منفی شود (کمبود خرید ثبت‌شده) */
  private async deduct(tx: any, farmId: string, type: string, kg: number) {
    const existing = await this.rowFor(tx, farmId, type);
    if (existing) {
      await tx
        .update(feedInventory)
        .set({ quantityKg: String(n(existing.quantityKg) - kg), updatedAt: new Date() })
        .where(eq(feedInventory.id, existing.id));
    } else {
      await tx.insert(feedInventory).values({ id: randomUUID(), farmId, feedType: type, quantityKg: String(-kg) });
    }
  }

  /** تعیین قطعی موجودی یک نوع دان (پس از شمارش انبار) */
  async setQuantity(farmId: string, feedType: string, quantityKg: number): Promise<FeedInventory> {
    const type = normalizeType(feedType);
    const existing = await this.findByType(farmId, type);
    if (existing) {
      await this.db
        .update(feedInventory)
        .set({ quantityKg: String(Math.max(0, quantityKg)), updatedAt: new Date() })
        .where(eq(feedInventory.id, existing.id));
    } else {
      await this.db.insert(feedInventory).values({
        id: randomUUID(),
        farmId,
        feedType: type,
        quantityKg: String(Math.max(0, quantityKg)),
      });
    }
    const row = await this.findByType(farmId, type);
    return toFeedInventory(row);
  }

  /** اصلاح افزایشی (+/-) با دلیل؛ برای ضایعات و اختلاف شمارش */
  async adjust(farmId: string, feedType: string, deltaKg: number): Promise<FeedInventory> {
    const type = normalizeType(feedType);
    const current = await this.findByType(farmId, type);
    const next = n(current?.quantityKg) + deltaKg;
    if (next < 0) {
      throw new BadRequestException("اصلاح دستی نمی‌تواند موجودی را منفی کند.");
    }
    await this.db.transaction(async (tx: any) => this.add(tx, farmId, type, deltaKg));
    const row = await this.findByType(farmId, type);
    if (!row) throw new NotFoundException("نوع دان یافت نشد.");
    return toFeedInventory(row);
  }
}
