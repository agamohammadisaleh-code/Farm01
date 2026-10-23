import { Logger, OnModuleDestroy } from "@nestjs/common";
import Redis from "ioredis";

/**
 * اتصال Redis — با شکستِ آرام.
 *
 * قاعده کلی این پروژه: Redis یک «بهبود» است، نه پیش‌شرط اجرا. اگر سرور Redis
 * بالا نباشد، API باید با افت کیفیت کار کند، نه با خطا. پس هر مصرف‌کننده
 * (محدودسازی نرخ و کش) در نبود Redis به معادل درون‌حافظه برمی‌گردد و فقط یک
 * بار در لاگ هشدار می‌دهد.
 */
const logger = new Logger("Redis");

/** همان بخش کوچکی از Redis که ما لازم داریم (آزمون‌پذیر و قابل جایگزینی) */
export interface RedisConnection {
  incr(key: string): Promise<number>;
  pexpire(key: string, milliseconds: number): Promise<number>;
  pttl(key: string): Promise<number>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: "PX", ttlMs: number): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
  quit(): Promise<unknown>;
}

let warned = false;

/**
 * ساخت اتصال تنبل با مهلت کوتاه.
 *
 * `lazyConnect` + مهلت ۱ ثانیه: اگر Redis در دسترس نباشد، درخواست کاربر
 * منتظر نمی‌ماند؛ همان لحظه به حالت حافظه‌ای می‌رویم.
 */
export async function connectRedis(url: string | undefined): Promise<RedisConnection | null> {
  if (!url) return null;

  // ioredis پیش‌فرض رویداد error را چاپ می‌کند؛ پیام تکراری و ترسناک است،
  // در حالی که خودمان پایین‌تر یک هشدار روشن و فارسی می‌دهیم.
  const client = new Redis(url, {
    lazyConnect: true,
    connectTimeout: 1000,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: (times: number) => (times > 3 ? null : 200),
  });

  client.on("error", () => {
    /* مدیریت‌شده در catch پایین */
  });

  try {
    await client.connect();
    await client.ping();
    logger.log("اتصال Redis برقرار است — محدودسازی نرخ و کش مشترک فعال شد");
    return client as unknown as RedisConnection;
  } catch (error) {
    if (!warned) {
      warned = true;
      logger.warn(
        `Redis در دسترس نیست (${(error as Error).message})؛ حالت درون‌حافظه استفاده می‌شود. ` +
          "برای چندنمونه‌ای شدن، REDIS_URL را تنظیم و سرور Redis را بالا بیاورید.",
      );
    }
    client.disconnect();
    return null;
  }
}
