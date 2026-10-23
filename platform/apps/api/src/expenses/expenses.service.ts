import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, eq, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Expense } from "@farm/domain";
import { DATABASE, type Database } from "../db/database";
import { expenses } from "../db/schema";
import { assertValid } from "../common/errors";
import { todayIso } from "../common/ids";
import { toExpense } from "../common/mappers";
import { FlockAccess } from "../common/flock-access";
import { InventoryService, POOL_FEED_TYPE } from "../inventory/inventory.service";
import type { CreateExpenseDto } from "./expenses.dto";

@Injectable()
export class ExpensesService {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    private readonly access: FlockAccess,
    private readonly inventory: InventoryService,
  ) {}

  private get db(): any {
    return this.database.db;
  }

  async list(farmId: string, flockId: string): Promise<Expense[]> {
    await this.access.require(farmId, flockId);
    const rows = await this.db
      .select()
      .from(expenses)
      .where(and(eq(expenses.flockId, flockId), isNull(expenses.deletedAt)))
      .orderBy(asc(expenses.date), asc(expenses.createdAt));
    return rows.map(toExpense);
  }

  private validateDate(startDate: string, date: string, tz: string) {
    const errors: Record<string, string> = {};
    if (date > todayIso(tz)) errors.date = "ثبت تاریخ آینده مجاز نیست.";
    if (date < startDate) errors.date = "تاریخ پیش از جوجه‌ریزی گله است.";
    assertValid(errors, "هزینه ثبت نشد.");
  }

  async create(farmId: string, userId: string, flockId: string, dto: CreateExpenseDto, tz = "Asia/Tehran") {
    const flock = await this.access.require(farmId, flockId);
    this.validateDate(flock.start_date, dto.date, tz);

    const id = randomUUID();
    // نوع دان ذخیره می‌شود تا برگرداندن خرید در ویرایش/حذف، سر جای درست انجام شود
    const feedType = dto.category === "feed" ? (dto.feedType?.trim() || POOL_FEED_TYPE).slice(0, 60) : null;

    await this.db.transaction(async (tx: any) => {
      await tx.insert(expenses).values({
        id,
        flockId,
        date: dto.date,
        category: dto.category,
        description: dto.description.trim().slice(0, 200),
        amount: String(Math.round(dto.amount)),
        quantity: dto.quantity != null ? String(dto.quantity) : null,
        unit: dto.unit?.slice(0, 20) ?? null,
        vendor: dto.vendor?.slice(0, 80) ?? null,
        feedType,
        createdBy: userId,
      });
      // خرید دان، موجودی انبار را افزایش می‌دهد (اگر مقدار کیلوگرمی ثبت شده باشد)
      if (dto.category === "feed" && dto.quantity && dto.quantity > 0) {
        await this.inventory.add(tx, farmId, feedType!, dto.quantity);
      }
    });

    const rows = await this.db.select().from(expenses).where(eq(expenses.id, id)).limit(1);
    return toExpense(rows[0]);
  }

  async update(farmId: string, flockId: string, id: string, dto: CreateExpenseDto, tz = "Asia/Tehran") {
    const flock = await this.access.require(farmId, flockId);
    this.validateDate(flock.start_date, dto.date, tz);

    const existing = await this.db
      .select()
      .from(expenses)
      .where(and(eq(expenses.id, id), eq(expenses.flockId, flockId)))
      .limit(1);
    if (!existing[0]) throw new NotFoundException("هزینه یافت نشد.");
    const prev = existing[0];
    // نوع دان ذخیره می‌شود تا برگرداندن خرید در ویرایش/حذف، سر جای درست انجام شود
    const feedType = dto.category === "feed" ? (dto.feedType?.trim() || POOL_FEED_TYPE).slice(0, 60) : null;

    await this.db.transaction(async (tx: any) => {
      await tx
        .update(expenses)
        .set({
          date: dto.date,
          category: dto.category,
          description: dto.description.trim().slice(0, 200),
          amount: String(Math.round(dto.amount)),
          quantity: dto.quantity != null ? String(dto.quantity) : null,
          unit: dto.unit?.slice(0, 20) ?? null,
          vendor: dto.vendor?.slice(0, 80) ?? null,
          feedType,
          updatedAt: new Date(),
        })
        .where(eq(expenses.id, id));

      // اصلاح انبار: خرید قبلی برگردانده و خرید جدید اضافه می‌شود
      if (prev.category === "feed" && Number(prev.quantity) > 0) {
        await this.inventory.add(tx, farmId, prev.feedType ?? POOL_FEED_TYPE, -Number(prev.quantity));
      }
      if (dto.category === "feed" && dto.quantity && dto.quantity > 0) {
        await this.inventory.add(tx, farmId, feedType!, dto.quantity);
      }
    });

    const rows = await this.db.select().from(expenses).where(eq(expenses.id, id)).limit(1);
    return toExpense(rows[0]);
  }

  async remove(farmId: string, flockId: string, id: string) {
    await this.access.require(farmId, flockId);
    const rows = await this.db
      .select()
      .from(expenses)
      .where(and(eq(expenses.id, id), eq(expenses.flockId, flockId)))
      .limit(1);
    if (!rows[0]) throw new NotFoundException("هزینه یافت نشد.");

    await this.db.transaction(async (tx: any) => {
      await tx.update(expenses).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(expenses.id, id));
      if (rows[0].category === "feed" && Number(rows[0].quantity) > 0) {
        await this.inventory.add(tx, farmId, rows[0].feedType ?? POOL_FEED_TYPE, -Number(rows[0].quantity));
      }
    });
    return { ok: true };
  }
}
