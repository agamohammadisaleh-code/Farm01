import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { DEFAULT_SETTINGS, type FarmSettings } from "@farm/domain";
import { DATABASE, type Database } from "../db/database";
import { farmMembers, farmSettings, farms, users } from "../db/schema";
import { toSettings } from "../common/mappers";
import type { AddMemberDto, UpdateSettingsDto } from "./farms.dto";

@Injectable()
export class FarmsService {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  private get db(): any {
    return this.database.db;
  }

  async get(farmId: string) {
    const rows = await this.db.select().from(farms).where(and(eq(farms.id, farmId), isNull(farms.deletedAt))).limit(1);
    if (!rows[0]) throw new NotFoundException("مزرعه یافت نشد.");
    return { id: rows[0].id, name: rows[0].name, location: rows[0].location };
  }

  async settings(farmId: string): Promise<FarmSettings> {
    const rows = await this.db.select().from(farmSettings).where(eq(farmSettings.farmId, farmId)).limit(1);
    if (!rows[0]) {
      await this.db.insert(farmSettings).values({
        farmId,
        marketPrice: String(DEFAULT_SETTINGS.market_price),
        feedPrice: String(DEFAULT_SETTINGS.feed_price),
        targetWeightG: DEFAULT_SETTINGS.target_weight_g,
        targetAgeDays: DEFAULT_SETTINGS.target_age_days,
        defaultBreed: DEFAULT_SETTINGS.default_breed,
        timezone: DEFAULT_SETTINGS.timezone,
      });
      return this.settings(farmId);
    }
    return toSettings(rows[0]);
  }

  async updateSettings(farmId: string, dto: UpdateSettingsDto) {
    const current = await this.settings(farmId);
    if (dto.farmName) {
      await this.db.update(farms).set({ name: dto.farmName.trim().slice(0, 80), updatedAt: new Date() }).where(eq(farms.id, farmId));
    }
    await this.db
      .update(farmSettings)
      .set({
        marketPrice: String(dto.marketPrice ?? current.market_price),
        feedPrice: String(dto.feedPrice ?? current.feed_price),
        targetWeightG: dto.targetWeightG ?? current.target_weight_g,
        targetAgeDays: dto.targetAgeDays ?? current.target_age_days,
        defaultBreed: dto.defaultBreed?.slice(0, 60) ?? current.default_breed,
        updatedAt: new Date(),
      })
      .where(eq(farmSettings.farmId, farmId));
    return this.settings(farmId);
  }

  async members(farmId: string) {
    const rows = await this.db
      .select({
        userId: users.id,
        email: users.email,
        name: users.name,
        role: farmMembers.role,
        createdAt: farmMembers.createdAt,
      })
      .from(farmMembers)
      .innerJoin(users, eq(users.id, farmMembers.userId))
      .where(eq(farmMembers.farmId, farmId));
    return rows;
  }

  /**
   * افزودن عضو. اگر کاربر وجود داشته باشد فقط عضویت ساخته می‌شود؛
   * در غیر این صورت حساب با گذرواژه اولیه ساخته می‌شود تا مالک بتواند
   * کارگر را بدون ثبت‌نام مستقل اضافه کند.
   */
  async addMember(farmId: string, dto: AddMemberDto) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
    let userId = existing[0]?.id as string | undefined;

    if (!userId) {
      if (!dto.password) throw new BadRequestException("برای کاربر جدید گذرواژه اولیه الزامی است.");
      userId = randomUUID();
      await this.db.insert(users).values({
        id: userId,
        email,
        passwordHash: await bcrypt.hash(dto.password, 11),
        name: (dto.name ?? email.split("@")[0]).slice(0, 80),
      });
    }

    const dup = await this.db
      .select()
      .from(farmMembers)
      .where(and(eq(farmMembers.farmId, farmId), eq(farmMembers.userId, userId)))
      .limit(1);
    if (dup[0]) throw new ConflictException("این کاربر از قبل عضو این مزرعه است.");

    await this.db.insert(farmMembers).values({ farmId, userId, role: dto.role });
    return { ok: true, userId };
  }

  async removeMember(farmId: string, userId: string) {
    const rows = await this.db
      .select()
      .from(farmMembers)
      .where(and(eq(farmMembers.farmId, farmId), eq(farmMembers.userId, userId)))
      .limit(1);
    if (!rows[0]) throw new NotFoundException("عضویت یافت نشد.");
    if (rows[0].role === "owner") throw new BadRequestException("مالک مزرعه را نمی‌توان حذف کرد.");
    await this.db.delete(farmMembers).where(and(eq(farmMembers.farmId, farmId), eq(farmMembers.userId, userId)));
    return { ok: true };
  }
}
