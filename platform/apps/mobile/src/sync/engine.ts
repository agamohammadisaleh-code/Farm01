/* موتور همگام‌سازی.

   چرخه کار:
   ۱. کاربر ثبت می‌کند → عملیات در SQLite (صف) ذخیره می‌شود؛ تمام.
   ۲. هر وقت شبکه بود (شروع اپ، بازگشت به برنامه، تایمر، دکمه دستی) صف
      فرستاده می‌شود.
   ۳. پاسخ سرور روی صف اعمال می‌شود: موفق/تکراری → حذف، ناموفق → عقب‌نشینی.
   ۴. سپس دریافت افزایشی تغییرات سرور (`/sync/pull`) و ادغام با داده محلی.

   منطق صف و ادغام در `@farm/domain` است و در Node آزموده شده؛ این فایل
   فقط «چسب» شبکه و پایگاه‌داده است.
*/

import {
  applyResults,
  createQueue,
  enqueue,
  markSent,
  mergeByUpdatedAt,
  nextBatch,
  summarize,
  type QueueState,
  type QueueSummary,
  type ServerResult,
  type SyncOperation,
  type SyncOpType,
} from "@farm/domain";
import { OfflineError, api } from "../api/client";
import {
  clearPendingFlag,
  loadQueue,
  openDb,
  saveQueue,
  setValue,
  getValue,
  upsertFlocks,
  upsertLocalLog,
} from "../storage/db";

let queue: QueueState | null = null;
let syncing = false;

export function currentQueue(): QueueState {
  if (!queue) queue = loadQueue();
  return queue;
}

export function queueSummary(now = new Date().toISOString()): QueueSummary {
  return summarize(currentQueue(), now);
}

/** شناسه یکتا برای عملیات سمت کلاینت (بدون وابستگی به crypto در RN) */
export function newClientId(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  const time = Date.now().toString(36);
  const id = `m-${time}-${rand}`;
  return id.padEnd(10, "0").slice(0, 40);
}

export interface EnqueueInput {
  type: SyncOpType;
  flockId: string;
  payload: Record<string, unknown>;
}

/**
 * ذخیره محلی + افزودن به صف. این تابع پیش از هر تماس شبکه صدا زده
 * می‌شود، پس حتی اگر تلفن همان لحظه خاموش شود، داده در گوشی هست.
 */
export function recordOffline(input: EnqueueInput): { clientId: string } {
  const clientId = newClientId();
  const createdAt = new Date().toISOString();

  if (input.type === "log.save") {
    const payload = input.payload as {
      date: string;
      mortality?: number;
      cull?: number;
      feedKg?: number;
      waterLiter?: number;
      avgTemp?: number;
      feedType?: string;
      notes?: string;
    };
    upsertLocalLog({
      id: clientId,
      flock_id: input.flockId,
      date: payload.date,
      mortality: Number(payload.mortality ?? 0),
      cull: Number(payload.cull ?? 0),
      feed_kg: Number(payload.feedKg ?? 0),
      water_liter: Number(payload.waterLiter ?? 0),
      avg_temp: payload.avgTemp ?? null,
      pending: 1,
      updated_at: createdAt,
    });
  }

  queue = enqueue(currentQueue(), { clientId, type: input.type, flockId: input.flockId, payload: input.payload, createdAt });
  saveQueue(queue);
  return { clientId };
}

/** ارسال صف. اگر آفلاین باشیم، بی‌صدا برمی‌گردد و صف دست‌نخورده می‌ماند. */
export async function pushQueue(): Promise<{ applied: number; failed: number; offline: boolean }> {
  if (syncing) return { applied: 0, failed: 0, offline: false };
  syncing = true;
  try {
    const now = new Date().toISOString();
    const batch = nextBatch(currentQueue(), now);
    if (batch.length === 0) return { applied: 0, failed: 0, offline: false };

    const ids = batch.map((op) => op.clientId);
    queue = markSent(currentQueue(), ids);
    saveQueue(queue);

    let response: { results: ServerResult[] };
    try {
      response = await api.post<{ results: ServerResult[] }>("/sync/push", {
        operations: batch.map((op) => ({
          clientId: op.clientId,
          type: op.type,
          flockId: op.flockId,
          payload: op.payload,
        })),
      });
    } catch (error) {
      if (error instanceof OfflineError) {
        // شبکه نیست: هیچ تلاشی مصرف نمی‌شود، فقط وضعیت به «در انتظار» برمی‌گردد
        queue = {
          ...currentQueue(),
          operations: currentQueue().operations.map((op) =>
            ids.includes(op.clientId) ? { ...op, status: "pending" as const } : op,
          ),
        };
        saveQueue(queue);
        return { applied: 0, failed: 0, offline: true };
      }
      throw error;
    }

    const outcome = applyResults(currentQueue(), response.results ?? [], new Date().toISOString());
    queue = outcome.state;
    saveQueue(queue);

    // ثبت‌های موفق، دیگر «در صف» نیستند
    for (const result of response.results ?? []) {
      if (result.status === "applied" || result.status === "duplicate") {
        clearPendingFlag(result.entityId ?? result.clientId);
      }
    }

    return { applied: outcome.applied, failed: outcome.failed, offline: false };
  } finally {
    syncing = false;
  }
}

/** دریافت افزایشی و ادغام. `since` از آخرین همگام‌سازی موفق خوانده می‌شود. */
export async function pullChanges(): Promise<{ changed: number; offline: boolean }> {
  const since = getValue("syncCursor") ?? undefined;
  try {
    const data = await api.get<any>(`/sync/pull${since ? `?since=${encodeURIComponent(since)}` : ""}`);

    const flockRows = (data.flocks ?? []) as any[];
    const deletedFlocks = flockRows.filter((f) => f.deleted).map((f) => f.id as string);
    upsertFlocks(
      flockRows.filter((f) => !f.deleted),
      deletedFlocks,
    );

    const db = openDb();
    let changed = 0;
    const logRows = (data.logs ?? []) as any[];
    for (const log of logRows) {
      if (log.deleted) {
        db.runSync("DELETE FROM logs WHERE id = ?", [log.id]);
        changed += 1;
        continue;
      }
      const existing = db.getFirstSync<any>("SELECT updated_at FROM logs WHERE id = ?", [log.id]);
      const merged = mergeByUpdatedAt(
        existing ? [{ id: log.id, updated_at: existing.updated_at }] : [],
        [{ id: log.id, updated_at: log.updated_at }],
      );
      if (!existing || merged.changed > 0) {
        upsertLocalLog({
          id: log.id,
          flock_id: log.flock_id,
          date: log.date,
          mortality: log.mortality,
          cull: log.cull,
          feed_kg: log.feed_kg,
          water_liter: log.water_liter,
          avg_temp: log.avg_temp,
          pending: 0,
          updated_at: log.updated_at,
        });
        changed += 1;
      }
    }

    setValue("syncCursor", data.serverTime);
    setValue("lastPullAt", new Date().toISOString());
    return { changed, offline: false };
  } catch (error) {
    if (error instanceof OfflineError) return { changed: 0, offline: true };
    throw error;
  }
}

/** همگام‌سازی کامل: اول ارسال، بعد دریافت (ترتیب مهم است) */
export async function syncNow(): Promise<{
  applied: number;
  failed: number;
  changed: number;
  offline: boolean;
  summary: QueueSummary;
}> {
  const push = await pushQueue();
  if (push.offline) {
    return { ...push, changed: 0, summary: queueSummary() };
  }
  const pull = await pullChanges();
  return { ...push, changed: pull.changed, offline: pull.offline, summary: queueSummary() };
}

export function resetQueueMemory(): void {
  queue = null;
}

export function emptyQueueState(): QueueState {
  return createQueue();
}

export type { SyncOperation, QueueSummary };
