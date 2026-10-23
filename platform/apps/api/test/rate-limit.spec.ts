import "reflect-metadata";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { HttpException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AUTH_LIMITS, MemoryRateLimitStore, RATE_LIMIT_KEY, RateLimitGuard } from "../src/common/rate-limit";

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

const attempt = (guard: RateLimitGuard, ctx: any) => {
  try {
    guard.canActivate(ctx);
    return "ok";
  } catch (error) {
    return error instanceof HttpException ? error.getStatus() : "unexpected";
  }
};

describe("محدودسازی نرخ درخواست", () => {
  it("پس از رسیدن به سقف، ۴۲۹ برمی‌گرداند و Retry-After می‌دهد", () => {
    const guard = new RateLimitGuard(new Reflector());
    const { ctx, headers } = context({ rules: [{ name: "t", limit: 2, windowMs: 60_000 }] });
    assert.equal(attempt(guard, ctx), "ok");
    assert.equal(attempt(guard, ctx), "ok");
    assert.equal(attempt(guard, ctx), 429);
    assert.match(headers["Retry-After"] ?? "", /^\d+$/);
  });

  it("سبد «ip+email» دو حساب پشت یک نشانی را از هم جدا می‌کند", () => {
    const guard = new RateLimitGuard(new Reflector());
    const rule = { name: "login", limit: 1, windowMs: 60_000, by: "ip+email" as const };
    const first = context({ ip: "10.0.0.1", email: "a@farm.ir", rules: [rule] });
    const second = context({ ip: "10.0.0.1", email: "b@farm.ir", rules: [rule] });
    assert.equal(attempt(guard, first.ctx), "ok");
    assert.equal(attempt(guard, first.ctx), 429, "همان حساب باید قفل شود");
    assert.equal(attempt(guard, second.ctx), "ok", "حساب دیگر نباید قربانی شود");
  });

  it("پس از پایان پنجره، سهمیه بازنشانی می‌شود", () => {
    const store = new MemoryRateLimitStore();
    const start = 1_000_000;
    assert.equal(store.hit("k", 1_000, start).count, 1);
    assert.equal(store.hit("k", 1_000, start + 500).count, 2);
    assert.equal(store.hit("k", 1_000, start + 1_001).count, 1);
  });

  it("قاعده‌های مسیرهای حساس شمارنده جدا دارند", () => {
    const guard = new RateLimitGuard(new Reflector());
    const login = context({ rules: [AUTH_LIMITS.loginAccount, AUTH_LIMITS.loginIp] });
    for (let i = 0; i < AUTH_LIMITS.loginAccount.limit; i += 1) {
      assert.equal(attempt(guard, login.ctx), "ok");
    }
    assert.equal(attempt(guard, login.ctx), 429);
    // سبد عمومی با کلیدِ نشانیِ دیگر هنوز باز است
    const other = context({ ip: "10.0.0.9", rules: [AUTH_LIMITS.loginIp] });
    assert.equal(attempt(guard, other.ctx), "ok");
  });

  it("با RATE_LIMIT_DISABLED=1 محدودیتی اعمال نمی‌شود", () => {
    const guard = new RateLimitGuard(new Reflector());
    const { ctx } = context({ rules: [{ name: "off", limit: 1, windowMs: 60_000 }] });
    process.env.RATE_LIMIT_DISABLED = "1";
    try {
      for (let i = 0; i < 5; i += 1) assert.equal(attempt(guard, ctx), "ok");
    } finally {
      delete process.env.RATE_LIMIT_DISABLED;
    }
  });
});
