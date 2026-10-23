import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { connectRedis, type RedisConnection } from "./redis";

/**
 * محدودسازی نرخ درخواست (Rate limiting).
 *
 * چرا لازم است: بدون سقف، یک مهندس مهمان می‌تواند با اسکریپت ساده روی
 * `/auth/login` گذرواژه‌ها را حدس بزند، یا با ارسال انبوه درخواست، CPU
 * سرور را (که هر ورود یک bcrypt هزینه‌بر اجرا می‌کند) اشباع کند.
 *
 * پیاده‌سازی: «پنجره ثابت». دو انبار دارد و انتخاب خودکار است:
 *   - `MemoryRateLimitStore` — بدون وابستگی، برای اجرای تک‌نمونه‌ای و آزمون؛
 *   - `RedisRateLimitStore` — با `REDIS_URL`؛ شمارنده بین همه نمونه‌ها مشترک
 *     می‌شود، پس پنج نمونه API یک سهمیه دارند نه پنج سهمیه.
 * اگر Redis بالا نیاید، بی‌صدا به حالت حافظه برمی‌گردیم (Redis بهبود است، نه
 * پیش‌شرط اجرا).
 */

export interface RateLimitRule {
  /** نام سبد؛ قاعده‌های هم‌نام سهمیه مشترک دارند */
  name: string;
  /** تعداد مجاز در پنجره */
  limit: number;
  /** طول پنجره به میلی‌ثانیه */
  windowMs: number;
  /**
   * کلید شمارش:
   * - `ip`: هر نشانی شبکه یک سبد (پیش‌فرض)
   * - `ip+email`: ترکیب نشانی و ایمیل ورودی؛ حمله به یک حساب، کاربران
   *   دیگر پشت همان NAT را قفل نمی‌کند
   */
  by?: "ip" | "ip+email";
}

export const RATE_LIMIT_KEY = "rate-limit:rules";

/** افزودن سبد(های) اختصاصی به یک مسیر */
export const RateLimit = (...rules: RateLimitRule[]) => SetMetadata(RATE_LIMIT_KEY, rules);

/** سبدهای مسیرهای حساس احراز هویت */
export const AUTH_LIMITS = {
  /** حدس گذرواژه برای یک حساب: ۵ تلاش در ۵ دقیقه */
  loginAccount: { name: "auth-login-account", limit: 5, windowMs: 5 * 60_000, by: "ip+email" } as RateLimitRule,
  /** سقف کلی ورود از یک نشانی (جلوگیری از پخش حدس روی چند حساب) */
  loginIp: { name: "auth-login-ip", limit: 40, windowMs: 60_000 } as RateLimitRule,
  /** ساخت حساب: ۵ حساب در ساعت از هر نشانی */
  registerIp: { name: "auth-register-ip", limit: 5, windowMs: 60 * 60_000 } as RateLimitRule,
  /** تازه‌سازی توکن: ۶۰ بار در دقیقه (اپ موبایل چند بار در روز) */
  refreshIp: { name: "auth-refresh-ip", limit: 60, windowMs: 60_000 } as RateLimitRule,
  /** تلاش برای تغییر گذرواژه */
  passwordIp: { name: "auth-password-ip", limit: 10, windowMs: 15 * 60_000 } as RateLimitRule,
};

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * انبار شمارنده‌ها.
 *
 * `hit` آگاهانه async است: انبار Redis ناگزیر async است و اگر رابط همگام
 * می‌بود، مسیر Redis عملاً غیرممکن یا پر از هک می‌شد.
 */
export interface RateLimitStore {
  hit(key: string, windowMs: number, now: number): Promise<Bucket>;
  reset(): Promise<void>;
  /** نوع انبار، برای لاگ و سنجش */
  readonly kind: "memory" | "redis";
}

export class MemoryRateLimitStore implements RateLimitStore {
  readonly kind = "memory" as const;
  private readonly buckets = new Map<string, Bucket>();
  /** سقف تعداد سبدها تا حافظه با کلیدهای ساختگی رشد نکند */
  constructor(private readonly maxKeys = 10_000) {}

  async hit(key: string, windowMs: number, now: number): Promise<Bucket> {
    const existing = this.buckets.get(key);
    if (!existing || existing.resetAt <= now) {
      const fresh = { count: 1, resetAt: now + windowMs };
      this.buckets.set(key, fresh);
      this.sweep(now);
      return fresh;
    }
    existing.count += 1;
    return existing;
  }

  private sweep(now: number) {
    if (this.buckets.size < this.maxKeys) return;
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }

  async reset() {
    this.buckets.clear();
  }
}

/**
 * انبار مشترک روی Redis.
 *
 * `INCR` + `PEXPIRE` (فقط بار اول) دقیقاً همان پنجره ثابت است، ولی شمارنده
 * میان نمونه‌ها مشترک. اگر Redis وسط کار قطع شود، همان درخواست به انبار
 * حافظه‌ای می‌افتد تا سرویس قطع نشود.
 */
export class RedisRateLimitStore implements RateLimitStore {
  readonly kind = "redis" as const;

  constructor(
    private readonly client: RedisConnection,
    private readonly fallback = new MemoryRateLimitStore(),
  ) {}

  async hit(key: string, windowMs: number, now: number): Promise<Bucket> {
    try {
      const count = await this.client.incr(key);
      if (count === 1) await this.client.pexpire(key, windowMs);
      const ttl = await this.client.pttl(key);
      return { count, resetAt: now + (ttl > 0 ? ttl : windowMs) };
    } catch {
      return this.fallback.hit(key, windowMs, now);
    }
  }

  async reset() {
    await this.fallback.reset();
  }
}

/** انتخاب انبار: Redis اگر در دسترس باشد، وگرنه حافظه */
export async function createRateLimitStore(url = process.env.REDIS_URL): Promise<RateLimitStore> {
  const connection = await connectRedis(url);
  return connection ? new RedisRateLimitStore(connection) : new MemoryRateLimitStore();
}

/** سقف کلی هر نشانی برای همه مسیرها — ترمز خام Nginx-like داخل خود API */
const DEFAULT_RULE: RateLimitRule = {
  name: "global-ip",
  limit: Number(process.env.RATE_LIMIT_GLOBAL_MAX ?? 1200),
  windowMs: 60_000,
};

@Injectable()
export class RateLimitGuard implements CanActivate, OnModuleInit, OnModuleDestroy {
  private storePromise: Promise<RateLimitStore> | null = null;

  constructor(private readonly reflector: Reflector) {}

  /** انبار تنبل ساخته می‌شود تا بالا آمدن برنامه معطل Redis نماند */
  private store(): Promise<RateLimitStore> {
    this.storePromise ??= createRateLimitStore();
    return this.storePromise;
  }

  /**
   * اتصال را همان بالا آمدن برنامه آغاز می‌کنیم تا هزینه اتصال (یا مهلت
   * یک‌ثانیه‌ای Redis در دسترس‌نبودن) به اولین درخواست کاربر منتقل نشود.
   */
  onModuleInit() {
    void this.store();
  }

  async onModuleDestroy() {
    const store = await this.storePromise;
    if (store?.kind === "redis") {
      // اتصال در لایه redis مدیریت می‌شود؛ اینجا فقط اشاره‌گر رها می‌شود
      this.storePromise = null;
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (process.env.RATE_LIMIT_DISABLED === "1") return true;

    const handlerRules = this.reflector.getAllAndOverride<RateLimitRule[] | undefined>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const rules = handlerRules && handlerRules.length > 0 ? handlerRules : [DEFAULT_RULE];
    const store = await this.store();

    const http = context.switchToHttp();
    const req: any = http.getRequest();
    const ip = this.clientIp(req);
    const now = Date.now();

    for (const rule of rules) {
      const key = `${rule.name}:${rule.by === "ip+email" ? `${ip}|${this.emailOf(req)}` : ip}`;
      const bucket = await store.hit(key, rule.windowMs, now);
      if (bucket.count > rule.limit) {
        const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
        try {
          http.getResponse()?.setHeader?.("Retry-After", String(retryAfter));
        } catch {
          /* پاسخ در دسترس نیست (مثلاً در آزمون واحد) — نادیده */
        }
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            error: "Too Many Requests",
            message: `تعداد درخواست‌ها بیش از حد مجاز است؛ ${retryAfter} ثانیه دیگر دوباره تلاش کنید.`,
            retryAfter,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    return true;
  }

  private clientIp(req: any): string {
    // پشت پروکسی معتبر (TRUST_PROXY=1) از X-Forwarded-For استفاده می‌شود؛
    // بدون آن، همه کاربران با IP پروکسی در یک سبد می‌افتند.
    if (process.env.TRUST_PROXY === "1") {
      const forwarded = String(req.headers?.["x-forwarded-for"] ?? "").split(",")[0]?.trim();
      if (forwarded) return forwarded;
    }
    return String(req.ip ?? req.socket?.remoteAddress ?? "unknown");
  }

  private emailOf(req: any): string {
    const email = req.body?.email;
    return typeof email === "string" ? email.trim().toLowerCase().slice(0, 120) : "-";
  }
}
