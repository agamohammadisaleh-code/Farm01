import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyResults,
  can,
  clearQueue,
  createQueue,
  enqueue,
  failedCount,
  MAX_ATTEMPTS,
  markSent,
  mergeByUpdatedAt,
  nextBatch,
  pendingCount,
  permissionsOf,
  planNotifications,
  removeOperation,
  retryDelayMs,
  revive,
  stuckOperations,
  summarize,
  syncStatusLabel,
  type QueueState,
} from "../src/index";

const NOW = "2026-10-24T08:00:00.000Z";

function logOp(overrides: Record<string, unknown> = {}) {
  return {
    clientId: "client-log-0001",
    type: "log.save" as const,
    flockId: "f1",
    payload: { date: "2026-10-24", mortality: 3, feedKg: 90, waterLiter: 180 },
    createdAt: NOW,
    ...overrides,
  };
}

/* -------------------------------- صف آفلاین -------------------------------- */

test("ثبت تکراری همان روز، عملیات قبلی را جایگزین می‌کند نه اینکه دوتا شود", () => {
  let queue = createQueue();
  queue = enqueue(queue, logOp());
  queue = enqueue(queue, logOp({ clientId: "client-log-0002", payload: { date: "2026-10-24", mortality: 5, feedKg: 95 } }));

  assert.equal(queue.operations.length, 1);
  assert.equal(queue.operations[0].payload.mortality, 5);
  // شناسه اصلی حفظ می‌شود تا اگر نسخه اول در راه بود، همان شناخته شود
  assert.equal(queue.operations[0].clientId, "client-log-0001");
});

test("ثبت روزهای مختلف، دو عملیات جدا می‌سازد", () => {
  let queue = createQueue();
  queue = enqueue(queue, logOp());
  queue = enqueue(queue, logOp({ clientId: "client-log-0003", payload: { date: "2026-10-23", mortality: 1, feedKg: 80 } }));
  assert.equal(queue.operations.length, 2);
});

test("ترتیب ارسال از قدیمی به جدید است", () => {
  let queue = createQueue();
  queue = enqueue(queue, logOp({ clientId: "client-b", createdAt: "2026-10-24T08:05:00.000Z", payload: { date: "2026-10-22" } }));
  queue = enqueue(queue, logOp({ clientId: "client-a", createdAt: "2026-10-24T08:01:00.000Z", payload: { date: "2026-10-21" } }));
  const batch = nextBatch(queue, NOW);
  assert.deepEqual(batch.map((op) => op.clientId), ["client-a", "client-b"]);
});

test("نتیجه موفق، عملیات را از صف حذف می‌کند", () => {
  let queue = enqueue(createQueue(), logOp());
  queue = markSent(queue, ["client-log-0001"]);
  const outcome = applyResults(queue, [{ clientId: "client-log-0001", status: "applied", entityId: "srv-1" }], NOW);

  assert.equal(outcome.applied, 1);
  assert.equal(outcome.state.operations.length, 0);
  assert.equal(outcome.state.lastSyncedAt, NOW);
});

test("پاسخ duplicate یعنی قبلاً ثبت شده؛ عملیات حذف می‌شود، نه خطا", () => {
  let queue = enqueue(createQueue(), logOp());
  queue = markSent(queue, ["client-log-0001"]);
  const outcome = applyResults(queue, [{ clientId: "client-log-0001", status: "duplicate", entityId: "srv-9" }], NOW);

  assert.equal(outcome.applied, 1);
  assert.equal(outcome.failed, 0);
  assert.equal(outcome.state.operations.length, 0);
});

test("خطا تلاش را می‌شمارد و تا زمان عقب‌نشینی دوباره فرستاده نمی‌شود", () => {
  let queue = enqueue(createQueue(), logOp());
  queue = markSent(queue, ["client-log-0001"]);
  const failure = applyResults(queue, [{ clientId: "client-log-0001", status: "failed", error: "تلفات بیش از تعداد زنده" }], NOW);

  assert.equal(failure.failed, 1);
  assert.equal(failure.state.operations[0].attempts, 1);
  assert.equal(failure.state.operations[0].lastError, "تلفات بیش از تعداد زنده");
  // بلافاصله بعد از خطا نباید ارسال شود
  assert.equal(nextBatch(failure.state, NOW).length, 0);
  // بعد از سپری‌شدن عقب‌نشینی، دوباره وارد دسته می‌شود
  const later = new Date(Date.parse(NOW) + retryDelayMs(1) + 1).toISOString();
  assert.equal(nextBatch(failure.state, later).length, 1);
});

test("عقب‌نشینی نمایی است و از سقف بالاتر نمی‌رود", () => {
  assert.equal(retryDelayMs(1), 2_000);
  assert.equal(retryDelayMs(2), 15_000);
  assert.equal(retryDelayMs(3), 60_000);
  assert.equal(retryDelayMs(9), retryDelayMs(5));
});

test("بعد از حداکثر تلاش، عملیات مرده علامت می‌خورد و خودکار ارسال نمی‌شود", () => {
  let queue = enqueue(createQueue(), logOp());
  let time = NOW;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    queue = markSent(queue, ["client-log-0001"]);
    const outcome = applyResults(queue, [{ clientId: "client-log-0001", status: "failed", error: "خطای شبکه" }], time);
    queue = outcome.state;
    time = new Date(Date.parse(time) + 20 * 60_000).toISOString();
  }

  assert.equal(queue.operations[0].attempts, MAX_ATTEMPTS);
  assert.equal(stuckOperations(queue).length, 1);
  assert.equal(failedCount(queue), 1);
  assert.equal(nextBatch(queue, time).length, 0, "عملیات مرده نباید خودکار فرستاده شود");

  // کاربر می‌تواند دستی دوباره تلاش کند
  const revived = revive(queue, "client-log-0001");
  assert.equal(revived.operations[0].attempts, 0);
  assert.equal(nextBatch(revived, time).length, 1);
});

test("خلاصه صف، تعداد و وضعیت را برای نوار وضعیت می‌دهد", () => {
  let queue = enqueue(createQueue(), logOp());
  assert.equal(pendingCount(queue), 1);
  const summary = summarize(queue, NOW);
  assert.equal(summary.pending, 1);
  assert.equal(summary.failed, 0);
  assert.equal(summary.ready, true);
  assert.equal(syncStatusLabel(summary.pending, summary.failed, false), "آفلاین — ۱ ثبت در انتظار");
  assert.equal(syncStatusLabel(0, 0, true), "همه‌چیز همگام است");

  queue = markSent(queue, ["client-log-0001"]);
  queue = applyResults(queue, [{ clientId: "client-log-0001", status: "failed", error: "x" }], NOW).state;
  assert.ok(summarize(queue, NOW).nextRetryInMs! > 0);
});

test("حذف دستی عملیات و پاک‌سازی صف", () => {
  let queue = enqueue(createQueue(), logOp());
  assert.equal(removeOperation(queue, "client-log-0001").operations.length, 0);
  queue = enqueue(queue, logOp({ clientId: "other-0001", payload: { date: "2026-10-20" } }));
  const cleared = clearQueue(queue);
  assert.equal(cleared.operations.length, 0);
});

/* ------------------------------ ادغام داده سرور ------------------------------ */

test("ادغام: نسخه سرور با updated_at جدیدتر برنده است", () => {
  const local = [
    { id: "l1", date: "2026-10-20", mortality: 2, updated_at: "2026-10-20T10:00:00.000Z" },
    { id: "l2", date: "2026-10-21", mortality: 4, updated_at: "2026-10-21T10:00:00.000Z" },
  ];
  const remote = [
    { id: "l1", date: "2026-10-20", mortality: 3, updated_at: "2026-10-22T10:00:00.000Z" },
    { id: "l3", date: "2026-10-22", mortality: 1, updated_at: "2026-10-22T10:00:00.000Z" },
  ];
  const merged = mergeByUpdatedAt(local, remote);
  assert.equal(merged.rows.length, 3);
  assert.equal(merged.rows.find((r) => r.id === "l1")!.mortality, 3);
  assert.equal(merged.changed, 2, "یکی به‌روزرسانی، یکی افزودن");
});

test("ادغام: نسخه قدیمی‌تر سرور، تغییر محلی را خراب نمی‌کند", () => {
  const local = [{ id: "l1", mortality: 9, updated_at: "2026-10-25T10:00:00.000Z" }];
  const remote = [{ id: "l1", mortality: 2, updated_at: "2026-10-20T10:00:00.000Z" }];
  assert.equal(mergeByUpdatedAt(local, remote).rows[0].mortality, 9);
});

test("ادغام: ردیف حذف‌شده (tombstone) محلی را پاک می‌کند", () => {
  const local = [{ id: "l1", mortality: 2, updated_at: "2026-10-20T10:00:00.000Z" }];
  const remote = [{ id: "l1", mortality: 2, updated_at: "2026-10-24T10:00:00.000Z", deleted: true }];
  const merged = mergeByUpdatedAt(local, remote);
  assert.equal(merged.rows.length, 0);
  assert.equal(merged.changed, 1);
});

/* ------------------------------ دسترسی نقش‌ها ------------------------------ */

test("ماتریس نقش‌ها: کارگر ثبت روزانه دارد، هزینه ندارد", () => {
  assert.equal(can("worker", "log:write"), true);
  assert.equal(can("worker", "cost:read"), false);
  assert.equal(can("worker", "cost:write"), false);
  assert.equal(can("vet", "log:write"), true);
  assert.equal(can("vet", "sale:read"), false);
  assert.equal(can("manager", "cost:write"), true);
  assert.equal(can("owner", "member:manage"), true);
  assert.equal(can("manager", "member:manage"), false);
  assert.equal(can(null, "log:write"), false);
});

test("فهرست مجوزهای هر نقش برای ساخت منوی آفلاین", () => {
  const workerPerms = permissionsOf("worker");
  assert.ok(workerPerms.includes("log:write"));
  assert.ok(!workerPerms.includes("cost:read"));
  assert.equal(permissionsOf(null).length, 0);
});

/* ------------------------------ نوتیفیکیشن‌ها ------------------------------ */

const reminders = [
  { id: "v1", kind: "vaccination", title: "واکسن نیوکاسل", due: "2026-10-26", flockName: "گله پاییزه", severity: "warning" },
  { id: "a1", kind: "alert", title: "افت مصرف آب", detail: "۱۵٪ کاهش", severity: "critical", href: "/flocks/f1?tab=daily" },
  { id: "w1", kind: "withdrawal", title: "پایان پرهیز دارو", daysLeft: 2, severity: "warning" },
  { id: "l1", kind: "log", title: "ثبت روزانه جا افتاده", severity: "info" },
];

test("واکسن یک روز قبل، ساعت ۹ صبح یادآوری می‌شود", () => {
  const plan = planNotifications(reminders, { now: NOW });
  const vaccine = plan.find((n) => n.kind === "vaccination")!;
  assert.equal(vaccine.at, "2026-10-25T09:00:00.000Z");
  assert.match(vaccine.title, /نیوکاسل/);
  assert.equal(vaccine.severity, "warning");
});

test("هشدار بحرانی فوری است و پیوند مستقیم دارد", () => {
  const plan = planNotifications(reminders, { now: NOW });
  const alert = plan.find((n) => n.kind === "alert")!;
  assert.equal(alert.severity, "critical");
  assert.equal(alert.at, "2026-10-24T08:01:00.000Z");
  assert.equal(alert.deepLink, "/flocks/f1?tab=daily");
});

test("سکوت شبانه: هشدار نیمه‌شب به صبح منتقل می‌شود", () => {
  const night = "2026-10-24T23:30:00.000Z";
  const plan = planNotifications([{ id: "a2", kind: "alert", title: "تلفات بالا", severity: "critical" }], { now: night });
  assert.equal(plan[0].at, "2026-10-25T07:00:00.000Z");
});

test("دوره پرهیز دارویی روز خودش (۸ صبح) هشدار دارد", () => {
  const plan = planNotifications(reminders, { now: NOW });
  const withdrawal = plan.find((n) => n.kind === "withdrawal")!;
  assert.equal(withdrawal.at, "2026-10-26T08:00:00.000Z");
});

test("یادآور تکراری دو بار زمان‌بندی نمی‌شود و ترتیب زمانی رعایت می‌شود", () => {
  const duplicated = [...reminders, { id: "v1", kind: "vaccination", title: "واکسن نیوکاسل", due: "2026-10-26" }];
  const plan = planNotifications(duplicated, { now: NOW });
  assert.equal(plan.filter((n) => n.kind === "vaccination").length, 1);
  const times = plan.map((n) => n.at);
  assert.deepEqual(times, [...times].sort());
});

test("افق برنامه‌ریزی و سقف تعداد رعایت می‌شود", () => {
  const far = [{ id: "v9", kind: "vaccination", title: "واکسن دور", due: "2026-12-30" }];
  assert.equal(planNotifications(far, { now: NOW, horizonDays: 14 }).length, 0);

  const many = Array.from({ length: 60 }, (_, i) => ({
    id: `v${i}`,
    kind: "vaccination",
    title: `واکسن ${i}`,
    due: "2026-10-26",
  }));
  assert.equal(planNotifications(many, { now: NOW, limit: 40 }).length, 40);
});

test("یادآور منقضی در گذشته زمان‌بندی نمی‌شود", () => {
  const past = [{ id: "v0", kind: "vaccination", title: "واکسن دیروز", due: "2026-10-20" }];
  assert.equal(planNotifications(past, { now: NOW }).length, 0);
});
