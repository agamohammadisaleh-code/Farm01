import "reflect-metadata";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { HttpException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import {
  AUTH_LIMITS,
  MemoryRateLimitStore,
  RATE_LIMIT_KEY,
  RateLimitGuard,
  RedisRateLimitStore,
} from "../src/common/rate-limit";

/**
 * آزمون محدودسازی نرخ.
 *
 * ساعت و درخواست شبیه‌سازی می‌شوند تا آزمون به گذر زمان واقعی وابسته نباشد؛
 * در نتیجه در CI هم پایدار است.
 */

function context(options: { ip?: string; email?: string; rules?: unknown }) {
  const headers: Record<string, string> = {};
  const handler = function handler() {};
  const controller = class Controller {};
  if (options.rules) {
    Reflect.defineMetadata(RATE_LIMIT_KEY, options.rules, handler);
    Reflect.defineMetadata(RATE_LIMIT_KEY, options.rules, controller);
  }
  const req = {
    ip: options.ip ?? "10.0.0.1",
    body: options.email ? { email: options.email } : {},
    headers: {},
  };
  const res = { setHeader: (k: string, v: string) => (headers[k] = v) };
  const ctx: any = {
    getHandler: () => handler,
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  };
  return { ctx, headers };
}

const attempt = async (guard: RateLimitGuard, ctx: any) => {
  try {
    await guard.canActivate(ctx);
    return "ok";
  } catch (error) {
    return error instanceof HttpException ? error.getStatus() : "unexpected";
  }
};

describe("محدودسازی نرخ درخواست", () => {
  it("پس از رسیدن به سقف، ۴۲۹ برمی‌گرداند و Retry-After می‌دهد", async () => {
    const guard = new RateLimitGuard(new Reflector());
    const { ctx, headers } = context({ rules: [{ name: "t", limit: 2, windowMs: 60_000 }] });
    assert.equal(await attempt(guard, ctx), "ok");
    assert.equal(await attempt(guard, ctx), "ok");
    assert.equal(await attempt(guard, ctx), 429);
    assert.match(headers["Retry-After"] ?? "", /^\d+$/);
  });

  it("سبد «ip+email» دو حساب پشت یک نشانی را از هم جدا می‌کند", async () => {
    const guard = new RateLimitGuard(new Reflector());
    const rule = { name: "login", limit: 1, windowMs: 60_000, by: "ip+email" as const };
    const first = context({ ip: "10.0.0.1", email: "a@farm.ir", rules: [rule] });
    const second = context({ ip: "10.0.0.1", email: "b@farm.ir", rules: [rule] });
    assert.equal(await attempt(guard, first.ctx), "ok");
    assert.equal(await attempt(guard, first.ctx), 429, "همان حساب باید قفل شود");
    assert.equal(await attempt(guard, second.ctx), "ok", "حساب دیگر نباید قربانی شود");
  });

  it("پس از پایان پنجره، سهمیه بازنشانی می‌شود", async () => {
    const store = new MemoryRateLimitStore();
    const start = 1_000_000;
    assert.equal((await store.hit("k", 1_000, start)).count, 1);
    assert.equal((await store.hit("k", 1_000, start + 500)).count, 2);
    assert.equal((await store.hit("k", 1_000, start + 1_001)).count, 1);
  });

  it("قاعده‌های مسیرهای حساس شمارنده جدا دارند", async () => {
    const guard = new RateLimitGuard(new Reflector());
    const login = context({ rules: [AUTH_LIMITS.loginAccount, AUTH_LIMITS.loginIp] });
    for (let i = 0; i < AUTH_LIMITS.loginAccount.limit; i += 1) {
      assert.equal(await attempt(guard, login.ctx), "ok");
    }
    assert.equal(await attempt(guard, login.ctx), 429);
    // سبد عمومی با کلیدِ نشانیِ دیگر هنوز باز است
    const other = context({ ip: "10.0.0.9", rules: [AUTH_LIMITS.loginIp] });
    assert.equal(await attempt(guard, other.ctx), "ok");
  });

  it("با RATE_LIMIT_DISABLED=1 محدودیتی اعمال نمی‌شود", async () => {
    const guard = new RateLimitGuard(new Reflector());
    const { ctx } = context({ rules: [{ name: "off", limit: 1, windowMs: 60_000 }] });
    process.env.RATE_LIMIT_DISABLED = "1";
    try {
      for (let i = 0; i < 5; i += 1) assert.equal(await attempt(guard, ctx), "ok");
    } finally {
      delete process.env.RATE_LIMIT_DISABLED;
    }
  });

  describe("انبار Redis", () => {
    /** کلاینت ساختگی با همان سه فرمان لازم؛ جای سرور واقعی در CI */
    function fakeRedis() {
      const counts = new Map<string, number>();
      const ttls = new Map<string, number>();
      return {
        incr: async (key: string) => {
          const next = (counts.get(key) ?? 0) + 1;
          counts.set(key, next);
          return next;
        },
        pexpire: async (key: string, ms: number) => {
          ttls.set(key, ms);
          return 1;
        },
        pttl: async (key: string) => ttls.get(key) ?? -1,
      };
    }

    it("شمارنده مشترک است و مثل حافظه ۴۲۹ می‌دهد", async () => {
      const client = fakeRedis();
      const store = new RedisRateLimitStore(client as any);
      const first = await store.hit("rate:1", 60_000, 1_000);
      const second = await store.hit("rate:1", 60_000, 1_000);
      assert.equal(first.count, 1);
      assert.equal(second.count, 2);
      assert.equal(second.resetAt, 61_000, "resetAt از TTL باقی‌مانده می‌آید");
      assert.equal(store.kind, "redis");
    });

    it("با قطع شدن Redis به انبار حافظه برمی‌گردد", async () => {
      const broken = {
        incr: async () => {
          throw new Error("connection lost");
        },
        pexpire: async () => 0,
        pttl: async () => -1,
      };
      const store = new RedisRateLimitStore(broken as any);
      const bucket = await store.hit("rate:2", 60_000, 5_000);
      assert.equal(bucket.count, 1, "پاسخ به‌جای خطا، از حافظه می‌آید");
    });
  });
});
