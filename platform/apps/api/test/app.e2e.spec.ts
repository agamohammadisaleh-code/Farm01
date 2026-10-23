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
  let hallId = "";
  let flockId = "";

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const today = new Date().toISOString().slice(0, 10);
  const startDate = new Date(Date.now() - 20 * 86400_000).toISOString().slice(0, 10);
  const twoDaysAgo = new Date(Date.now() - 2 * 86400_000).toISOString().slice(0, 10);
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
      await request(server).get("/api/v1/flocks").expect(401);
    });

    it("توکن نامعتبر ۴۰۱ می‌دهد", async () => {
      await request(server).get("/api/v1/flocks").set(auth("not-a-token")).expect(401);
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

  describe("سالن‌ها", () => {
    it("مالک سالن با ظرفیت می‌سازد", async () => {
      const res = await request(server)
        .post("/api/v1/halls")
        .set(auth(ownerToken))
        .send({ name: "سالن ۱", capacity: 12000 })
        .expect(201);
      expect(res.body.name).toBe("سالن ۱");
      expect(res.body.capacity).toBe(12000);
      hallId = res.body.id;
    });

    it("نام تکراری سالن رد می‌شود", async () => {
      await request(server)
        .post("/api/v1/halls")
        .set(auth(ownerToken))
        .send({ name: "سالن ۱", capacity: 5000 })
        .expect(409);
    });

    it("کارگر نمی‌تواند سالن بسازد", async () => {
      await request(server).post("/api/v1/halls").set(auth(workerToken)).send({ name: "سالن ۳", capacity: 100 }).expect(403);
    });

    it("فهرست سالن‌ها ظرفیت و اشغال را نشان می‌دهد", async () => {
      const res = await request(server).get("/api/v1/halls").set(auth(ownerToken)).expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].capacity).toBe(12000);
    });
  });

  describe("گله‌ها", () => {
    it("مالک گله جدید می‌سازد و هزینه جوجه خودکار ثبت می‌شود", async () => {
      const res = await request(server)
        .post("/api/v1/flocks")
        .set(auth(ownerToken))
        .send({
          hallId: hallId,
          name: "گله پاییزه",
          breed: "راس ۳۰۸",
          startDate: startDate,
          initialCount: 10000,
          chickPrice: 27000,
          targetWeightG: 2500,
          targetAgeDays: 42,
        })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.initial_count).toBe(10000);
      flockId = res.body.id;

      const costs = await request(server).get(`/api/v1/flocks/${flockId}/expenses`).set(auth(ownerToken)).expect(200);
      expect(costs.body).toHaveLength(1);
      expect(costs.body[0].category).toBe("chick");
      expect(costs.body[0].amount).toBe(10000 * 27000);
    });

    it("تاریخ جوجه‌ریزی در آینده رد می‌شود", async () => {
      const future = new Date(Date.now() + 5 * 86400_000).toISOString().slice(0, 10);
      const res = await request(server)
        .post("/api/v1/flocks")
        .set(auth(ownerToken))
        .send({ hallId, name: "آینده", startDate: future, initialCount: 1000 })
        .expect(400);
      expect(res.body.errors?.startDate).toBeDefined();
    });

    it("تعداد جوجه خارج از بازه رد می‌شود", async () => {
      await request(server)
        .post("/api/v1/flocks")
        .set(auth(ownerToken))
        .send({ hallId, name: "نامعتبر", startDate: startDate, initialCount: 5 })
        .expect(400);
    });

    it("کارگر نمی‌تواند دوره بسازد (۴۰۳)", async () => {
      await request(server)
        .post("/api/v1/flocks")
        .set(auth(workerToken))
        .send({ hallId, name: "کارگر", startDate: startDate, initialCount: 1000 })
        .expect(403);
    });

    it("ظرفیت سالن کنترل می‌شود", async () => {
      const res = await request(server)
        .post("/api/v1/flocks")
        .set(auth(ownerToken))
        .send({ hallId, name: "بیش از ظرفیت", startDate: startDate, initialCount: 99999 })
        .expect(400);
      expect(res.body.errors?.initialCount).toBeDefined();
    });

    it("سالن مزرعه دیگر قابل استفاده نیست", async () => {
      const other = await request(server)
        .post("/api/v1/auth/register")
        .send({ email: "h2@farm.ir", password: "Secret1234", name: "دیگری", farmName: "مزرعه دو" })
        .expect(201);
      await request(server)
        .post("/api/v1/flocks")
        .set(auth(other.body.accessToken))
        .send({ hallId, name: "نفوذ", startDate: startDate, initialCount: 1000 })
        .expect(404);
    });

    it("همه نقش‌ها می‌توانند گله‌ها را بخوانند", async () => {
      for (const token of [ownerToken, workerToken, vetToken]) {
        const res = await request(server).get("/api/v1/flocks").set(auth(token)).expect(200);
        expect(res.body.length).toBeGreaterThan(0);
      }
    });

    it("دوره ناموجود ۴۰۴ می‌دهد", async () => {
      await request(server).get("/api/v1/flocks/00000000-0000-0000-0000-000000000000").set(auth(ownerToken)).expect(404);
    });
  });

  describe("ثبت روزانه", () => {
    it("ثبت روزانه با اعداد اعشاری و ذخیره صحیح", async () => {
      const res = await request(server)
        .post(`/api/v1/flocks/${flockId}/logs`)
        .set(auth(workerToken))
        .send({ date: startDate, mortality: 5, cull: 1, feedKg: 120.5, waterLiter: 240, avgTemp: 28.5, feedType: "دان آغازین" })
        .expect(201);

      expect(res.body.mortality).toBe(5);
      expect(res.body.feed_kg).toBeCloseTo(120.5, 2);
      expect(res.body.updated).toBe(false);
    });

    it("ثبت دوباره همان روز رکورد را به‌روزرسانی می‌کند، نه تکرار", async () => {
      const res = await request(server)
        .post(`/api/v1/flocks/${flockId}/logs`)
        .set(auth(workerToken))
        .send({ date: startDate, mortality: 9, cull: 0, feedKg: 130, waterLiter: 250, feedType: "دان آغازین" })
        .expect(201);

      expect(res.body.updated).toBe(true);

      const list = await request(server).get(`/api/v1/flocks/${flockId}/logs`).set(auth(ownerToken)).expect(200);
      const sameDay = list.body.filter((l: any) => l.date === startDate);
      expect(sameDay).toHaveLength(1);
      expect(sameDay[0].mortality).toBe(9);
    });

    it("ثبت تاریخ آینده رد می‌شود", async () => {
      const future = new Date(Date.now() + 86400_000).toISOString().slice(0, 10);
      const res = await request(server)
        .post(`/api/v1/flocks/${flockId}/logs`)
        .set(auth(workerToken))
        .send({ date: future, mortality: 1, feedKg: 10 })
        .expect(400);
      expect(res.body.errors?.date).toBeDefined();
    });

    it("تلفات بیشتر از موجودی زنده رد می‌شود", async () => {
      const res = await request(server)
        .post(`/api/v1/flocks/${flockId}/logs`)
        .set(auth(workerToken))
        .send({ date: yesterday, mortality: 99_999, feedKg: 10 })
        .expect(400);
      expect(res.body.errors?.mortality).toBeDefined();
    });

    it("دامپزشک می‌تواند ثبت کند ولی کارگر به هزینه دسترسی ندارد", async () => {
      await request(server)
        .post(`/api/v1/flocks/${flockId}/logs`)
        .set(auth(vetToken))
        .send({ date: yesterday, mortality: 2, feedKg: 200, waterLiter: 380, feedType: "دان آغازین" })
        .expect(201);

      await request(server).get(`/api/v1/flocks/${flockId}/expenses`).set(auth(workerToken)).expect(403);
      await request(server).get(`/api/v1/flocks/${flockId}/expenses`).set(auth(vetToken)).expect(403);
    });
  });

  describe("هزینه و فروش", () => {
    it("هزینه ثبت می‌شود و کارگر نمی‌تواند ثبت کند", async () => {
      const payload = { date: yesterday, category: "feed", description: "خرید دان", amount: 33_500_000, quantity: 1000, unit: "کیلوگرم", feedType: "دان آغازین" };
      await request(server).post(`/api/v1/flocks/${flockId}/expenses`).set(auth(workerToken)).send(payload).expect(403);

      const res = await request(server).post(`/api/v1/flocks/${flockId}/expenses`).set(auth(ownerToken)).send(payload).expect(201);
      expect(res.body.amount).toBe(33_500_000);
    });

    it("مبلغ صفر و شرح کوتاه رد می‌شود", async () => {
      const res = await request(server)
        .post(`/api/v1/flocks/${flockId}/expenses`)
        .set(auth(ownerToken))
        .send({ date: yesterday, category: "other", description: "x", amount: 0 })
        .expect(400);
      expect(res.body.message).toBeDefined();
    });

    it("فروش بیش از موجودی رد و فروش مجاز ثبت می‌شود", async () => {
      const bad = await request(server)
        .post(`/api/v1/flocks/${flockId}/sales`)
        .set(auth(ownerToken))
        .send({ date: today, count: 999_999, totalWeightKg: 100, pricePerKg: 98000 })
        .expect(400);
      expect(bad.body.errors?.count).toBeDefined();

      const good = await request(server)
        .post(`/api/v1/flocks/${flockId}/sales`)
        .set(auth(ownerToken))
        .send({ date: today, count: 500, totalWeightKg: 1100, pricePerKg: 98000, buyer: "کشتارگاه" })
        .expect(201);
      expect(good.body.count).toBe(500);
      expect(good.body.price_per_kg).toBe(98000);
    });
  });


  describe("وزن‌گیری نمونه‌ای", () => {
    it("نمونه وزن ثبت می‌شود و منبع وزن گله قرار می‌گیرد", async () => {
      const res = await request(server)
        .post(`/api/v1/flocks/${flockId}/weights`)
        .set(auth(workerToken))
        .send({ date: yesterday, sampleCount: 120, avgWeightGr: 1050 })
        .expect(201);
      expect(res.body.avg_weight_gr).toBe(1050);
      expect(res.body.sample_count).toBe(120);

      const metrics = await request(server).get(`/api/v1/analytics/flocks/${flockId}`).set(auth(ownerToken)).expect(200);
      expect(metrics.body.measuredWeightG).toBe(1050);
      expect(metrics.body.lastSampleCount).toBe(120);
      expect(metrics.body.weighCount).toBe(1);
    });

    it("تعداد یا وزن نامعتبر رد می‌شود", async () => {
      await request(server)
        .post(`/api/v1/flocks/${flockId}/weights`)
        .set(auth(workerToken))
        .send({ date: yesterday, sampleCount: 0, avgWeightGr: 5000 })
        .expect(400);
    });

    it("وزن‌گیری با تاریخ آینده رد می‌شود", async () => {
      const future = new Date(Date.now() + 86400_000).toISOString().slice(0, 10);
      const res = await request(server)
        .post(`/api/v1/flocks/${flockId}/weights`)
        .set(auth(workerToken))
        .send({ date: future, sampleCount: 100, avgWeightGr: 1200 })
        .expect(400);
      expect(res.body.errors?.date).toBeDefined();
    });

    it("فهرست وزن‌گیری‌ها مرتب برمی‌گردد", async () => {
      const res = await request(server).get(`/api/v1/flocks/${flockId}/weights`).set(auth(vetToken)).expect(200);
      expect(res.body).toHaveLength(1);
    });
  });

  describe("سلامت: واکسن و دارو", () => {
    it("واکسن آینده به‌صورت برنامه‌ریزی‌شده ثبت می‌شود", async () => {
      const soon = new Date(Date.now() + 2 * 86400_000).toISOString().slice(0, 10);
      const res = await request(server)
        .post(`/api/v1/flocks/${flockId}/vaccinations`)
        .set(auth(vetToken))
        .send({ name: "نیوکاسل", scheduledDate: soon })
        .expect(201);
      expect(res.body.status).toBe("scheduled");
      expect(res.body.effective_status).toBe("scheduled");
      expect(res.body.days_until).toBe(2);
    });

    it("واکسن عقب‌افتاده با وضعیت مؤثر overdue شناسایی می‌شود", async () => {
      const past = new Date(Date.now() - 3 * 86400_000).toISOString().slice(0, 10);
      const res = await request(server)
        .post(`/api/v1/flocks/${flockId}/vaccinations`)
        .set(auth(vetToken))
        .send({ name: "برونشیت", scheduledDate: past })
        .expect(201);
      expect(res.body.effective_status).toBe("overdue");
    });

    it("انجام واکسن، تاریخ انجام و وضعیت را ثبت می‌کند", async () => {
      const list = await request(server).get(`/api/v1/flocks/${flockId}/vaccinations`).set(auth(vetToken)).expect(200);
      const overdue = list.body.find((v: any) => v.effective_status === "overdue");
      const res = await request(server)
        .patch(`/api/v1/flocks/${flockId}/vaccinations/${overdue.id}`)
        .set(auth(vetToken))
        .send({ status: "done" })
        .expect(200);
      expect(res.body.status).toBe("done");
      expect(res.body.done_date).toBe(today);
    });

    it("دارو با دوره پرهیز ثبت می‌شود و در خلاصه سلامت دیده می‌شود", async () => {
      const res = await request(server)
        .post(`/api/v1/flocks/${flockId}/medications`)
        .set(auth(vetToken))
        .send({ name: "اکسی‌تتراسایکلین", dose: "۱ گرم در لیتر", startDate: today, endDate: today, withdrawalDays: 7 })
        .expect(201);
      expect(res.body.withdrawal_days).toBe(7);

      const summary = await request(server).get(`/api/v1/flocks/${flockId}/health`).set(auth(ownerToken)).expect(200);
      expect(summary.body.medications).toHaveLength(1);
      expect(summary.body.activeWithdrawal).toHaveLength(1);
      expect(summary.body.overdue).toHaveLength(0);
    });

    it("کارگر نمی‌تواند واکسن یا دارو ثبت کند", async () => {
      await request(server)
        .post(`/api/v1/flocks/${flockId}/vaccinations`)
        .set(auth(workerToken))
        .send({ name: "تست", scheduledDate: today })
        .expect(403);
      await request(server)
        .post(`/api/v1/flocks/${flockId}/medications`)
        .set(auth(workerToken))
        .send({ name: "تست", dose: "۱", startDate: today })
        .expect(403);
    });

    it("تاریخ شروع دارو در آینده رد می‌شود", async () => {
      const future = new Date(Date.now() + 5 * 86400_000).toISOString().slice(0, 10);
      const res = await request(server)
        .post(`/api/v1/flocks/${flockId}/medications`)
        .set(auth(vetToken))
        .send({ name: "دارو", dose: "۱", startDate: future })
        .expect(400);
      expect(res.body.errors?.startDate).toBeDefined();
    });
  });

  describe("انبار دان", () => {
    it("خرید دان موجودی را افزایش می‌دهد", async () => {
      // نوع دان تازه تا موجودی از صفر شروع شود و اثر خرید خالص سنجیده شود
      const before = await request(server).get("/api/v1/farm/inventory").set(auth(ownerToken)).expect(200);
      expect(before.body.find((r: any) => r.feed_type === "دان رشد")).toBeUndefined();

      await request(server)
        .post(`/api/v1/flocks/${flockId}/expenses`)
        .set(auth(ownerToken))
        .send({
          date: today,
          category: "feed",
          description: "خرید دان رشد",
          amount: 33_500_000,
          quantity: 1500,
          unit: "کیلوگرم",
          feedType: "دان رشد",
        })
        .expect(201);

      const after = await request(server).get("/api/v1/farm/inventory").set(auth(ownerToken)).expect(200);
      const row = after.body.find((r: any) => r.feed_type === "دان رشد");
      expect(row).toBeDefined();
      expect(row.quantity_kg).toBeCloseTo(1500, 1);
    });

    it("ثبت روزانه از انبار کسر می‌کند و ویرایش دوباره کسر نمی‌کند", async () => {
      const before = await request(server).get("/api/v1/farm/inventory").set(auth(ownerToken)).expect(200);
      const b = before.body.find((r: any) => r.feed_type === "دان آغازین").quantity_kg;

      // همان روز با مقدار بیشتر → فقط اختلاف کسر می‌شود
      await request(server)
        .post(`/api/v1/flocks/${flockId}/logs`)
        .set(auth(workerToken))
        .send({ date: yesterday, mortality: 2, feedKg: 260, waterLiter: 380, feedType: "دان آغازین" })
        .expect(201);

      const after = await request(server).get("/api/v1/farm/inventory").set(auth(ownerToken)).expect(200);
      const a = after.body.find((r: any) => r.feed_type === "دان آغازین").quantity_kg;
      expect(b - a).toBeCloseTo(60, 1); // ۲۶۰ − ۲۰۰
    });

    it("اصلاح دستی موجودی را منفی نمی‌کند", async () => {
      const res = await request(server)
        .post("/api/v1/farm/inventory/adjust")
        .set(auth(ownerToken))
        .send({ feedType: "دان آغازین", deltaKg: -999999, reason: "ضایعات" })
        .expect(400);
      expect(String(res.body.message).includes("منفی")).toBe(true);
    });

    it("کمبود انبار به‌صورت منفی گزارش می‌شود، نه صفر", async () => {
      // مصرف بدون خرید هم‌نوع: موجودی باید منفی شود تا کمبود دیده شود
      const res = await request(server)
        .post(`/api/v1/flocks/${flockId}/logs`)
        .set(auth(workerToken))
        .send({ date: twoDaysAgo, mortality: 0, feedKg: 50, feedType: "دان بدون خرید" })
        .expect(201);
      expect(res.body.updated).toBe(false);

      const inv = await request(server).get("/api/v1/farm/inventory").set(auth(ownerToken)).expect(200);
      const row = inv.body.find((r: any) => r.feed_type === "دان بدون خرید");
      expect(row.quantity_kg).toBeCloseTo(-50, 1);
    });

    it("کارگر می‌تواند اصلاح گزارش کند ولی تعیین قطعی نه", async () => {
      await request(server)
        .post("/api/v1/farm/inventory/adjust")
        .set(auth(workerToken))
        .send({ feedType: "دان آغازین", deltaKg: 10 })
        .expect(201);
      await request(server)
        .post("/api/v1/farm/inventory/set")
        .set(auth(workerToken))
        .send({ feedType: "دان آغازین", quantityKg: 5000 })
        .expect(403);
    });
  });

  describe("تحلیل و شاخص‌ها", () => {
    it("متریک دوره شامل FCR، تلفات و پیش‌بینی است", async () => {
      const res = await request(server).get(`/api/v1/analytics/flocks/${flockId}`).set(auth(ownerToken)).expect(200);
      expect(res.body.liveBirds).toBe(10000 - 9 - 2 - 500);
      expect(res.body.flock.id).toBe(flockId);
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

      const res = await request(server).get(`/api/v1/flocks/${flockId}`).set(auth(other.body.accessToken)).expect(404);
      expect(res.body.message).toBe("گله یافت نشد.");
    });
  });

  describe("حذف و چرخه نشست", () => {
    it("کارگر نمی‌تواند دوره را حذف کند", async () => {
      await request(server).delete(`/api/v1/flocks/${flockId}`).set(auth(workerToken)).expect(403);
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

      await request(server).get("/api/v1/flocks").set(auth(rotated.body.accessToken)).expect(200);
    });

    it("مالک دوره را حذف نرم می‌کند و شمارش‌ها به‌روز می‌شود", async () => {
      const temp = await request(server)
        .post("/api/v1/flocks")
        .set(auth(ownerToken))
        .send({ hallId, name: "قابل حذف", startDate: startDate, initialCount: 1000 })
        .expect(201);

      await request(server).delete(`/api/v1/flocks/${temp.body.id}`).set(auth(ownerToken)).expect(200);

      const list = await request(server).get("/api/v1/flocks").set(auth(ownerToken)).expect(200);
      expect(list.body.find((c: any) => c.id === temp.body.id)).toBeUndefined();

      const res = await request(server).get(`/api/v1/flocks/${temp.body.id}`).set(auth(ownerToken)).expect(404);
      expect(res.body.message).toBe("گله یافت نشد.");
    });

    it("سلامت سرویس", async () => {
      const res = await request(server).get("/api/v1/health").expect(200);
      expect(res.body.status).toBe("ok");
    });
  });
});
