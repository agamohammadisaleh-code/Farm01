import "reflect-metadata";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { DATABASE, type Database } from "../src/db/database";
import { runMigrations } from "../src/db/migrate";

/**
 * آزمون یکپارچه API روی PGlite.
 *
 * PGlite همان PostgreSQL است (کامپایل‌شده به WASM)؛ بنابراین numeric، date،
 * ایندکس یکتای (cycle_id, date) و ON CONFLICT واقعاً آزمایش می‌شوند، نه یک
 * شبیه‌ساز ساده.
 */
/** معادل کوچک expect برای خوانایی آزمون‌ها روی node:test */
function expect(actual: any) {
  return {
    toBe: (v: unknown) => assert.strictEqual(actual, v),
    toEqual: (v: unknown) => assert.deepStrictEqual(actual, v),
    toBeDefined: () => assert.notStrictEqual(actual, undefined, "expected value to be defined"),
    toBeUndefined: () => assert.strictEqual(actual, undefined, "expected value to be undefined"),
    toBeNull: () => assert.strictEqual(actual, null, "expected null"),
    not: {
      toBeNull: () => assert.notStrictEqual(actual, null, "expected not null"),
    },
    toHaveLength: (len: number) => assert.strictEqual(actual.length, len, `expected length ${len}`),
    toBeGreaterThan: (v: number) => assert.ok(actual > v, `expected ${actual} > ${v}`),
    toBeLessThan: (v: number) => assert.ok(actual < v, `expected ${actual} < ${v}`),
    toBeCloseTo: (v: number, digits = 2) =>
      assert.ok(Math.abs(actual - v) < Math.pow(10, -digits), `expected ${actual} ≈ ${v}`),
  };
}

describe("Farm API (e2e)", () => {
  let app: INestApplication;
  let server: any;
  let db: Database;

  let ownerToken = "";
  let workerToken = "";
  let vetToken = "";
  let farmId = "";
  let cycleId = "";

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const today = new Date().toISOString().slice(0, 10);
  const placement = new Date(Date.now() - 20 * 86400_000).toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);

  before(async () => {
    process.env.PGLITE_DATA_DIR = "memory://";
    process.env.JWT_SECRET = "test-secret";

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    db = app.get<Database>(DATABASE);
    await runMigrations(db, join(process.cwd(), "src/db/migrations"));
    await app.init();
    server = app.getHttpServer();
  });

  after(async () => {
    await app?.close();
  });

  describe("ثبت‌نام و ورود", () => {
    it("مزرعه و مالک را می‌سازد و توکن می‌دهد", async () => {
      const res = await request(server)
        .post("/api/v1/auth/register")
        .send({ email: "owner@farm.ir", password: "Secret1234", name: "علی رضایی", farmName: "مرغداری سبز" })
        .expect(201);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
      expect(res.body.role).toBe("owner");
      expect(res.body.farm.name).toBe("مرغداری سبز");
      ownerToken = res.body.accessToken;
      farmId = res.body.farm.id;
    });

    it("ایمیل تکراری را رد می‌کند", async () => {
      await request(server)
        .post("/api/v1/auth/register")
        .send({ email: "owner@farm.ir", password: "Secret1234", name: "دوباره", farmName: "مزرعه دوم" })
        .expect(409);
    });

    it("گذرواژه کوتاه را رد می‌کند", async () => {
      const res = await request(server)
        .post("/api/v1/auth/register")
        .send({ email: "x@farm.ir", password: "123", name: "کاربر", farmName: "مزرعه" })
        .expect(400);
      expect(res.body.message).toBeDefined();
    });

    it("گذرواژه نادرست را رد می‌کند", async () => {
      await request(server).post("/api/v1/auth/login").send({ email: "owner@farm.ir", password: "WrongPass1" }).expect(401);
    });

    it("با گذرواژه درست وارد می‌شود و مزرعه فعال را برمی‌گرداند", async () => {
      const res = await request(server)
        .post("/api/v1/auth/login")
        .send({ email: "owner@farm.ir", password: "Secret1234" })
        .expect(200);
      expect(res.body.farm.id).toBe(farmId);
    });

    it("ورود بدون توکن به مسیرهای محافظت‌شده ۴۰۱ می‌دهد", async () => {
      await request(server).get("/api/v1/cycles").expect(401);
    });

    it("توکن نامعتبر ۴۰۱ می‌دهد", async () => {
      await request(server).get("/api/v1/cycles").set(auth("not-a-token")).expect(401);
    });
  });

  describe("مدیریت اعضا و نقش‌ها", () => {
    it("مالک می‌تواند کارگر و دامپزشک اضافه کند", async () => {
      await request(server)
        .post("/api/v1/farm/members")
        .set(auth(ownerToken))
        .send({ email: "worker@farm.ir", password: "Worker1234", name: "کارگر سالن", role: "worker" })
        .expect(201);

      await request(server)
        .post("/api/v1/farm/members")
        .set(auth(ownerToken))
        .send({ email: "vet@farm.ir", password: "VetPass1234", name: "دامپزشک", role: "vet" })
        .expect(201);

      workerToken = (
        await request(server).post("/api/v1/auth/login").send({ email: "worker@farm.ir", password: "Worker1234" })
      ).body.accessToken;
      vetToken = (
        await request(server).post("/api/v1/auth/login").send({ email: "vet@farm.ir", password: "VetPass1234" })
      ).body.accessToken;

      expect(workerToken).toBeDefined();
      expect(vetToken).toBeDefined();
    });

    it("فهرست اعضا نقش‌ها را نشان می‌دهد", async () => {
      const res = await request(server).get("/api/v1/farm/members").set(auth(ownerToken)).expect(200);
      expect(res.body.map((m: any) => m.role).sort()).toEqual(["owner", "vet", "worker"]);
    });

    it("کارگر نمی‌تواند عضو اضافه کند (۴۰۳)", async () => {
      await request(server)
        .post("/api/v1/farm/members")
        .set(auth(workerToken))
        .send({ email: "another@farm.ir", password: "Another1234", role: "manager" })
        .expect(403);
    });
  });

  describe("دوره‌ها", () => {
    it("مالک دوره جدید می‌سازد و هزینه جوجه خودکار ثبت می‌شود", async () => {
      const res = await request(server)
        .post("/api/v1/cycles")
        .set(auth(ownerToken))
        .send({
          name: "دوره پاییزه",
          house: "سالن ۱",
          breed: "راس ۳۰۸",
          placementDate: placement,
          initialCount: 10000,
          chickPrice: 27000,
          targetWeightG: 2500,
          targetAgeDays: 42,
        })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.initial_count).toBe(10000);
      cycleId = res.body.id;

      const costs = await request(server).get(`/api/v1/cycles/${cycleId}/costs`).set(auth(ownerToken)).expect(200);
      expect(costs.body).toHaveLength(1);
      expect(costs.body[0].category).toBe("chick");
      expect(costs.body[0].amount).toBe(10000 * 27000);
    });

    it("تاریخ جوجه‌ریزی در آینده رد می‌شود", async () => {
      const future = new Date(Date.now() + 5 * 86400_000).toISOString().slice(0, 10);
      const res = await request(server)
        .post("/api/v1/cycles")
        .set(auth(ownerToken))
        .send({ name: "آینده", placementDate: future, initialCount: 1000 })
        .expect(400);
      expect(res.body.errors?.placementDate).toBeDefined();
    });

    it("تعداد جوجه خارج از بازه رد می‌شود", async () => {
      await request(server)
        .post("/api/v1/cycles")
        .set(auth(ownerToken))
        .send({ name: "نامعتبر", placementDate: placement, initialCount: 5 })
        .expect(400);
    });

    it("کارگر نمی‌تواند دوره بسازد (۴۰۳)", async () => {
      await request(server)
        .post("/api/v1/cycles")
        .set(auth(workerToken))
        .send({ name: "کارگر", placementDate: placement, initialCount: 1000 })
        .expect(403);
    });

    it("همه نقش‌ها می‌توانند دوره‌ها را بخوانند", async () => {
      for (const token of [ownerToken, workerToken, vetToken]) {
        const res = await request(server).get("/api/v1/cycles").set(auth(token)).expect(200);
        expect(res.body.length).toBeGreaterThan(0);
      }
    });

    it("دوره ناموجود ۴۰۴ می‌دهد", async () => {
      await request(server).get("/api/v1/cycles/00000000-0000-0000-0000-000000000000").set(auth(ownerToken)).expect(404);
    });
  });

  describe("ثبت روزانه", () => {
    it("ثبت روزانه با اعداد اعشاری و ذخیره صحیح", async () => {
      const res = await request(server)
        .post(`/api/v1/cycles/${cycleId}/logs`)
        .set(auth(workerToken))
        .send({ date: placement, mortality: 5, culls: 1, feedKg: 120.5, waterL: 240, tempC: 28.5, avgWeightG: 195 })
        .expect(201);

      expect(res.body.mortality).toBe(5);
      expect(res.body.feed_kg).toBeCloseTo(120.5, 2);
      expect(res.body.updated).toBe(false);
    });

    it("ثبت دوباره همان روز رکورد را به‌روزرسانی می‌کند، نه تکرار", async () => {
      const res = await request(server)
        .post(`/api/v1/cycles/${cycleId}/logs`)
        .set(auth(workerToken))
        .send({ date: placement, mortality: 9, culls: 0, feedKg: 130, waterL: 250 })
        .expect(201);

      expect(res.body.updated).toBe(true);

      const list = await request(server).get(`/api/v1/cycles/${cycleId}/logs`).set(auth(ownerToken)).expect(200);
      const sameDay = list.body.filter((l: any) => l.date === placement);
      expect(sameDay).toHaveLength(1);
      expect(sameDay[0].mortality).toBe(9);
    });

    it("ثبت تاریخ آینده رد می‌شود", async () => {
      const future = new Date(Date.now() + 86400_000).toISOString().slice(0, 10);
      const res = await request(server)
        .post(`/api/v1/cycles/${cycleId}/logs`)
        .set(auth(workerToken))
        .send({ date: future, mortality: 1, feedKg: 10 })
        .expect(400);
      expect(res.body.errors?.date).toBeDefined();
    });

    it("تلفات بیشتر از موجودی زنده رد می‌شود", async () => {
      const res = await request(server)
        .post(`/api/v1/cycles/${cycleId}/logs`)
        .set(auth(workerToken))
        .send({ date: yesterday, mortality: 99_999, feedKg: 10 })
        .expect(400);
      expect(res.body.errors?.mortality).toBeDefined();
    });

    it("دامپزشک می‌تواند ثبت کند ولی کارگر به هزینه دسترسی ندارد", async () => {
      await request(server)
        .post(`/api/v1/cycles/${cycleId}/logs`)
        .set(auth(vetToken))
        .send({ date: yesterday, mortality: 2, feedKg: 200, waterL: 380 })
        .expect(201);

      await request(server).get(`/api/v1/cycles/${cycleId}/costs`).set(auth(workerToken)).expect(403);
      await request(server).get(`/api/v1/cycles/${cycleId}/costs`).set(auth(vetToken)).expect(403);
    });
  });

  describe("هزینه و فروش", () => {
    it("هزینه ثبت می‌شود و کارگر نمی‌تواند ثبت کند", async () => {
      const payload = { date: yesterday, category: "feed", description: "خرید دان", amount: 33_500_000, quantity: 1000, unit: "کیلوگرم" };
      await request(server).post(`/api/v1/cycles/${cycleId}/costs`).set(auth(workerToken)).send(payload).expect(403);

      const res = await request(server).post(`/api/v1/cycles/${cycleId}/costs`).set(auth(ownerToken)).send(payload).expect(201);
      expect(res.body.amount).toBe(33_500_000);
    });

    it("مبلغ صفر و شرح کوتاه رد می‌شود", async () => {
      const res = await request(server)
        .post(`/api/v1/cycles/${cycleId}/costs`)
        .set(auth(ownerToken))
        .send({ date: yesterday, category: "other", description: "x", amount: 0 })
        .expect(400);
      expect(res.body.message).toBeDefined();
    });

    it("فروش بیش از موجودی رد و فروش مجاز ثبت می‌شود", async () => {
      const bad = await request(server)
        .post(`/api/v1/cycles/${cycleId}/sales`)
        .set(auth(ownerToken))
        .send({ date: today, count: 999_999, weightKg: 100, pricePerKg: 98000 })
        .expect(400);
      expect(bad.body.errors?.count).toBeDefined();

      const good = await request(server)
        .post(`/api/v1/cycles/${cycleId}/sales`)
        .set(auth(ownerToken))
        .send({ date: today, count: 500, weightKg: 1100, pricePerKg: 98000, buyer: "کشتارگاه" })
        .expect(201);
      expect(good.body.count).toBe(500);
      expect(good.body.price_per_kg).toBe(98000);
    });
  });

  describe("تحلیل و شاخص‌ها", () => {
    it("متریک دوره شامل FCR، تلفات و پیش‌بینی است", async () => {
      const res = await request(server).get(`/api/v1/analytics/cycles/${cycleId}`).set(auth(ownerToken)).expect(200);
      expect(res.body.liveBirds).toBe(10000 - 9 - 2 - 500);
      expect(res.body.mortalityPct).toBeCloseTo(0.11, 1);
      expect(res.body.fcr).not.toBeNull();
      expect(res.body.projection.targetAge).toBe(42);
      expect(res.body.totalCost).toBeGreaterThan(0);
      expect(Array.isArray(res.body.alerts)).toBe(true);
    });

    it("کارگر در خلاصه، فیلدهای مالی نمی‌بیند", async () => {
      const res = await request(server).get("/api/v1/analytics/overview").set(auth(workerToken)).expect(200);
      expect(res.body.liveBirds).toBeGreaterThan(0);
      expect(res.body.activeCost).toBeUndefined();
      expect(res.body.costBreakdown).toEqual([]);
      expect(res.body.activeMetrics[0].totalCost).toBeUndefined();
    });

    it("مالک همه شاخص‌های مالی را می‌بیند", async () => {
      const res = await request(server).get("/api/v1/analytics/overview").set(auth(ownerToken)).expect(200);
      expect(res.body.totalCostAll).toBeGreaterThan(0);
      expect(res.body.costBreakdown.length).toBeGreaterThan(0);
    });
  });

  describe("تنظیمات و جداسازی مزرعه‌ها", () => {
    it("تنظیمات پیش‌فرض ساخته شده و قابل ویرایش است", async () => {
      const res = await request(server).get("/api/v1/farm/settings").set(auth(ownerToken)).expect(200);
      expect(res.body.market_price).toBe(98000);
      expect(res.body.timezone).toBe("Asia/Tehran");

      const updated = await request(server)
        .patch("/api/v1/farm/settings")
        .set(auth(ownerToken))
        .send({ marketPrice: 105000, targetAgeDays: 40 })
        .expect(200);
      expect(updated.body.market_price).toBe(105000);
      expect(updated.body.target_age_days).toBe(40);
    });

    it("کارگر نمی‌تواند تنظیمات را تغییر دهد", async () => {
      await request(server).patch("/api/v1/farm/settings").set(auth(workerToken)).send({ marketPrice: 1 }).expect(403);
    });

    it("کاربر یک مزرعه به داده مزرعه دیگر دسترسی ندارد", async () => {
      const other = await request(server)
        .post("/api/v1/auth/register")
        .send({ email: "other@farm.ir", password: "Secret1234", name: "مالک دوم", farmName: "مزرعه دیگر" })
        .expect(201);

      const res = await request(server).get(`/api/v1/cycles/${cycleId}`).set(auth(other.body.accessToken)).expect(404);
      expect(res.body.message).toBe("دوره یافت نشد.");
    });
  });

  describe("حذف و چرخه نشست", () => {
    it("کارگر نمی‌تواند دوره را حذف کند", async () => {
      await request(server).delete(`/api/v1/cycles/${cycleId}`).set(auth(workerToken)).expect(403);
    });

    it("توکن تازه‌سازی توکن دسترسی جدید می‌دهد و قابل استفاده مجدد نیست", async () => {
      const login = await request(server)
        .post("/api/v1/auth/login")
        .send({ email: "owner@farm.ir", password: "Secret1234" })
        .expect(200);

      const rotated = await request(server)
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: login.body.refreshToken })
        .expect(200);
      expect(rotated.body.accessToken).toBeDefined();

      // توکن قبلی پس از چرخش باطل است
      await request(server).post("/api/v1/auth/refresh").send({ refreshToken: login.body.refreshToken }).expect(401);

      await request(server).get("/api/v1/cycles").set(auth(rotated.body.accessToken)).expect(200);
    });

    it("مالک دوره را حذف نرم می‌کند و شمارش‌ها به‌روز می‌شود", async () => {
      const temp = await request(server)
        .post("/api/v1/cycles")
        .set(auth(ownerToken))
        .send({ name: "قابل حذف", placementDate: placement, initialCount: 1000 })
        .expect(201);

      await request(server).delete(`/api/v1/cycles/${temp.body.id}`).set(auth(ownerToken)).expect(200);

      const list = await request(server).get("/api/v1/cycles").set(auth(ownerToken)).expect(200);
      expect(list.body.find((c: any) => c.id === temp.body.id)).toBeUndefined();

      const res = await request(server).get(`/api/v1/cycles/${temp.body.id}`).set(auth(ownerToken)).expect(404);
      expect(res.body.message).toBe("دوره یافت نشد.");
    });

    it("سلامت سرویس", async () => {
      const res = await request(server).get("/api/v1/health").expect(200);
      expect(res.body.status).toBe("ok");
    });
  });
});
