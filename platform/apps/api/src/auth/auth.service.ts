import {
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { and, eq, isNull } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { createHash, randomUUID } from "node:crypto";
import type { Role } from "@farm/domain";
import { DEFAULT_SETTINGS } from "@farm/domain";
import { DATABASE, type Database } from "../db/database";
import { farmMembers, farmSettings, farms, refreshTokens, users } from "../db/schema";
import type { JwtPayload } from "./auth.types";

const ACCESS_TTL = "15m";
const REFRESH_DAYS = 30;

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: { id: string; email: string; name: string };
  farm: { id: string; name: string };
  role: Role;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    private readonly jwt: JwtService,
  ) {}

  private get db(): any {
    return this.database.db;
  }

  private hash(token: string) {
    return createHash("sha256").update(token).digest("hex");
  }

  private async issue(user: { id: string; email: string; name: string }, farm: { id: string; name: string }, role: Role) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      farmId: farm.id,
      role,
    };
    const accessToken = await this.jwt.signAsync(payload, { expiresIn: ACCESS_TTL });

    // توکن تازه‌سازی فقط به شکل هش ذخیره می‌شود؛ نشت پایگاه داده یعنی امکان
    // جعل نشست نیست.
    const refreshToken = `${randomUUID()}.${randomUUID()}`;
    const expiresAt = new Date(Date.now() + REFRESH_DAYS * 24 * 60 * 60 * 1000);
    await this.db.insert(refreshTokens).values({
      id: randomUUID(),
      userId: user.id,
      tokenHash: this.hash(refreshToken),
      expiresAt,
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: 15 * 60,
      user: { id: user.id, email: user.email, name: user.name },
      farm,
      role,
    } satisfies AuthResult;
  }

  /** ثبت‌نام مالک جدید: کاربر + مزرعه + عضویت مالک + تنظیمات پیش‌فرض */
  async register(input: { email: string; password: string; name: string; farmName: string; phone?: string }) {
    const email = input.email.trim().toLowerCase();
    const existing = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existing.length) throw new ConflictException("این ایمیل قبلاً ثبت شده است.");

    const userId = randomUUID();
    const farmId = randomUUID();
    const passwordHash = await bcrypt.hash(input.password, 11);

    await this.db.transaction(async (tx: any) => {
      await tx.insert(farms).values({
        id: farmId,
        name: input.farmName.trim().slice(0, 80),
        ownerId: userId,
      });
      await tx.insert(users).values({
        id: userId,
        email,
        passwordHash,
        name: input.name.trim().slice(0, 80),
        phone: input.phone?.slice(0, 20) ?? null,
        role: "owner",
        farmId,
      });
      await tx.insert(farmMembers).values({ farmId, userId, role: "owner" });
      await tx.insert(farmSettings).values({
        farmId,
        marketPrice: String(DEFAULT_SETTINGS.market_price),
        feedPrice: String(DEFAULT_SETTINGS.feed_price),
        targetWeightG: DEFAULT_SETTINGS.target_weight_g,
        targetAgeDays: DEFAULT_SETTINGS.target_age_days,
        defaultBreed: DEFAULT_SETTINGS.default_breed,
        timezone: DEFAULT_SETTINGS.timezone,
      });
    });

    return this.issue(
      { id: userId, email, name: input.name },
      { id: farmId, name: input.farmName },
      "owner",
    );
  }

  async login(email: string, password: string) {
    const rows = await this.db.select().from(users).where(eq(users.email, email.trim().toLowerCase())).limit(1);
    const user = rows[0];
    if (!user || !user.isActive) throw new UnauthorizedException("ایمیل یا گذرواژه نادرست است.");

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException("ایمیل یا گذرواژه نادرست است.");

    const membership = await this.firstMembership(user.id);
    if (!membership) throw new UnauthorizedException("این کاربر به هیچ مزرعه‌ای دسترسی ندارد.");

    return this.issue(
      { id: user.id, email: user.email, name: user.name },
      { id: membership.farmId, name: membership.farmName },
      membership.role,
    );
  }

  private async firstMembership(userId: string) {
    const rows = await this.db
      .select({ farmId: farmMembers.farmId, role: farmMembers.role, farmName: farms.name })
      .from(farmMembers)
      .innerJoin(farms, eq(farms.id, farmMembers.farmId))
      .where(and(eq(farmMembers.userId, userId), isNull(farms.deletedAt)))
      .limit(1);
    const row = rows[0];
    return row ? { farmId: row.farmId, farmName: row.farmName, role: row.role as Role } : null;
  }

  async refresh(refreshToken: string) {
    const hash = this.hash(refreshToken);
    const rows = await this.db.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, hash)).limit(1);
    const stored = rows[0];
    if (!stored || stored.revokedAt || stored.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException("نشست منقضی شده است؛ دوباره وارد شوید.");
    }

    const userRows = await this.db.select().from(users).where(eq(users.id, stored.userId)).limit(1);
    const user = userRows[0];
    if (!user || !user.isActive) throw new UnauthorizedException("حساب کاربری فعال نیست.");

    // چرخش توکن: توکن قبلی باطل و توکن تازه صادر می‌شود
    await this.db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.id, stored.id));

    const membership = await this.firstMembership(user.id);
    if (!membership) throw new UnauthorizedException("این کاربر به هیچ مزرعه‌ای دسترسی ندارد.");
    return this.issue(
      { id: user.id, email: user.email, name: user.name },
      { id: membership.farmId, name: membership.farmName },
      membership.role,
    );
  }

  async logout(refreshToken: string) {
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.tokenHash, this.hash(refreshToken)));
    return { ok: true };
  }

  /** تغییر مزرعه فعال؛ نقش از عضویت همان مزرعه خوانده می‌شود */
  async switchFarm(userId: string, farmId: string) {
    const rows = await this.db
      .select({ role: farmMembers.role, name: farms.name })
      .from(farmMembers)
      .innerJoin(farms, eq(farms.id, farmMembers.farmId))
      .where(and(eq(farmMembers.userId, userId), eq(farmMembers.farmId, farmId), isNull(farms.deletedAt)))
      .limit(1);
    const row = rows[0];
    if (!row) throw new UnauthorizedException("عضویت شما در این مزرعه یافت نشد.");

    const userRows = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    const user = userRows[0]!;
    return this.issue(
      { id: user.id, email: user.email, name: user.name },
      { id: farmId, name: row.name },
      row.role as Role,
    );
  }

  /** ویرایش پروفایل شخصی — نام و شماره تماس */
  async updateProfile(userId: string, dto: { name?: string; phone?: string }) {
    const patch: Record<string, unknown> = {};
    if (dto.name !== undefined) patch.name = dto.name.trim().slice(0, 80);
    if (dto.phone !== undefined) patch.phone = dto.phone.trim().slice(0, 20) || null;
    if (Object.keys(patch).length === 0) return this.me(userId);
    patch.updatedAt = new Date();
    await this.db.update(users).set(patch).where(eq(users.id, userId));
    return this.me(userId);
  }

  /**
   * تغییر گذرواژه. پس از تغییر، همه توکن‌های تازه‌سازی کاربر باطل می‌شوند
   * تا اگر گذرواژه به دست کسی افتاده بود، نشست‌های قبلی قطع شوند.
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const rows = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    const user = rows[0];
    if (!user) throw new UnauthorizedException("کاربر یافت نشد.");
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) throw new UnauthorizedException("گذرواژه فعلی نادرست است.");

    await this.db.transaction(async (tx: any) => {
      await tx
        .update(users)
        .set({ passwordHash: await bcrypt.hash(newPassword, 11), updatedAt: new Date() })
        .where(eq(users.id, userId));
      await tx.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.userId, userId));
    });
    return { ok: true };
  }

  async me(userId: string) {
    const rows = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    const user = rows[0];
    if (!user) throw new UnauthorizedException("کاربر یافت نشد.");
    const memberships = await this.db
      .select({ farmId: farmMembers.farmId, role: farmMembers.role, name: farms.name })
      .from(farmMembers)
      .innerJoin(farms, eq(farms.id, farmMembers.farmId))
      .where(eq(farmMembers.userId, userId));
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      farms: memberships,
    };
  }
}
