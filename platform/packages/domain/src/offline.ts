/* صف آفلاین و منطق همگام‌سازی — بدون وابستگی به شبکه، React یا پایگاه‌داده.

   چرا این‌جا و نه داخل اپ؟ چون این منطق همان جایی است که اشتباه گران تمام
   می‌شود: ثبت دوباره یک روز، گم‌شدن ثبت هنگام قطعی، یا حلقه بی‌پایان
   تلاش. با جدا بودنش، همه حالت‌ها در آزمون Node سنجیده می‌شوند و کد اپ
   فقط «صدا زدن» را دارد.
*/

export type SyncOpType = "log.save" | "expense.create" | "sale.create" | "weight.create";

export type SyncOpStatus = "pending" | "syncing" | "failed";

export interface SyncOperation {
  /** شناسه یکتای سمت کلاینت — همین کلید، ثبت تکراری را در سرور بی‌اثر می‌کند */
  clientId: string;
  type: SyncOpType;
  flockId: string;
  payload: Record<string, unknown>;
  createdAt: string;
  attempts: number;
  status: SyncOpStatus;
  lastError?: string;
  /** زمان مجازِ تلاش بعدی (ISO) — عقب‌نشینی نمایی */
  nextAttemptAt?: string;
}

export interface QueueState {
  operations: SyncOperation[];
  lastSyncedAt: string | null;
}

export interface ServerResult {
  clientId: string;
  status: "applied" | "duplicate" | "failed";
  entityId?: string;
  error?: string;
}

export const MAX_ATTEMPTS = 5;

/** فاصله تلاش‌های بعدی: ۲ ثانیه، ۱۵ ثانیه، ۱ دقیقه، ۵ دقیقه، ۱۵ دقیقه */
export const RETRY_DELAYS_MS = [2_000, 15_000, 60_000, 300_000, 900_000];

export function createQueue(): QueueState {
  return { operations: [], lastSyncedAt: null };
}

export function retryDelayMs(attempts: number): number {
  const index = Math.min(Math.max(0, attempts - 1), RETRY_DELAYS_MS.length - 1);
  return RETRY_DELAYS_MS[index];
}

/**
 * کلید یکتای «همان کار». برای ثبت روزانه، تاریخ همان روز کلید است نه
 * clientId: کاربر ممکن است دو بار فرم را پر کند (اول اشتباه، بعد درست) و
 * سرور هم بر اساس (گله، تاریخ) upsert می‌کند. اگر هر دو در صف بمانند،
 * آخرین مقدار باید جای قبلی را بگیرد، نه اینکه دو عملیات بفرستیم.
 */
export function operationKey(op: Pick<SyncOperation, "type" | "clientId" | "flockId" | "payload">): string {
  if (op.type === "log.save") {
    return `log.save:${op.flockId}:${String(op.payload.date ?? "")}`;
  }
  return `${op.type}:${op.clientId}`;
}

/** افزودن یک تغییر به صف؛ ورودی تکراری جایگزین می‌شود، نه اضافه */
export function enqueue(
  state: QueueState,
  input: Omit<SyncOperation, "attempts" | "status">,
): QueueState {
  const key = operationKey(input);
  const existing = state.operations.find((op) => operationKey(op) === key);

  const fresh: SyncOperation = { ...input, attempts: 0, status: "pending" };

  if (existing) {
    return {
      ...state,
      operations: state.operations.map((op) =>
        operationKey(op) === key ? { ...fresh, clientId: existing.clientId } : op,
      ),
    };
  }
  return { ...state, operations: [...state.operations, fresh] };
}

export function pendingCount(state: QueueState): number {
  return state.operations.filter((op) => op.status !== "failed" || op.attempts < MAX_ATTEMPTS).length;
}

export function failedCount(state: QueueState): number {
  return state.operations.filter((op) => op.status === "failed" && op.attempts >= MAX_ATTEMPTS).length;
}

function isReady(op: SyncOperation, now: string): boolean {
  if (op.status === "failed" && op.attempts >= MAX_ATTEMPTS) return false;
  if (op.status === "failed" && op.nextAttemptAt && op.nextAttemptAt > now) return false;
  return true;
}

/**
 * دسته بعدی برای ارسال: قدیمی‌ترها اول تا ترتیب ثبت‌ها حفظ شود.
 * عملیاتی که از حد تلاش گذشته، دیگر خودکار فرستاده نمی‌شود و منتظر
 * تصمیم کاربر می‌ماند (به‌جای حلقه بی‌پایان روی شبکه ضعیف).
 */
export function nextBatch(state: QueueState, now: string, limit = 20): SyncOperation[] {
  return state.operations
    .filter((op) => isReady(op, now))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(0, limit);
}

export function markSent(state: QueueState, clientIds: string[]): QueueState {
  const ids = new Set(clientIds);
  return {
    ...state,
    operations: state.operations.map((op) =>
      ids.has(op.clientId) ? { ...op, status: "syncing" as SyncOpStatus } : op,
    ),
  };
}

export interface ApplyOutcome {
  state: QueueState;
  applied: number;
  failed: number;
  errors: { clientId: string; error: string }[];
}

/**
 * اعمال نتیجه سرور روی صف.
 * - applied/duplicate → عملیات حذف می‌شود (duplicate یعنی قبلاً همان
 *   clientId اعمال شده؛ دوباره فرستادنش خطا نیست).
 * - failed → تلاش +۱، زمان تلاش بعدی با عقب‌نشینی نمایی.
 */
export function applyResults(state: QueueState, results: ServerResult[], now: string): ApplyOutcome {
  const byId = new Map(results.map((r) => [r.clientId, r]));
  const kept: SyncOperation[] = [];
  let applied = 0;
  let failed = 0;
  const errors: { clientId: string; error: string }[] = [];

  for (const op of state.operations) {
    const result = byId.get(op.clientId);
    if (!result) {
      kept.push(op.status === "syncing" ? { ...op, status: "pending" } : op);
      continue;
    }
    if (result.status === "applied" || result.status === "duplicate") {
      applied += 1;
      continue;
    }
    failed += 1;
    const attempts = op.attempts + 1;
    const error = result.error ?? "ثبت در سرور ناموفق بود.";
    errors.push({ clientId: op.clientId, error });
    kept.push({
      ...op,
      attempts,
      status: "failed",
      lastError: error,
      nextAttemptAt: new Date(Date.parse(now) + retryDelayMs(attempts)).toISOString(),
    });
  }

  return {
    state: {
      operations: kept,
      lastSyncedAt: applied > 0 ? now : state.lastSyncedAt,
    },
    applied,
    failed,
    errors,
  };
}

/** عملیات مرده‌ای که کاربر باید ببیند و تصمیم بگیرد (اصلاح یا حذف) */
export function stuckOperations(state: QueueState): SyncOperation[] {
  return state.operations.filter((op) => op.status === "failed" && op.attempts >= MAX_ATTEMPTS);
}

/** تلاش دوباره دستی برای یک عملیات مرده */
export function revive(state: QueueState, clientId: string): QueueState {
  return {
    ...state,
    operations: state.operations.map((op) =>
      op.clientId === clientId
        ? { ...op, attempts: 0, status: "pending" as SyncOpStatus, lastError: undefined, nextAttemptAt: undefined }
        : op,
    ),
  };
}

export function removeOperation(state: QueueState, clientId: string): QueueState {
  return { ...state, operations: state.operations.filter((op) => op.clientId !== clientId) };
}

export interface QueueSummary {
  pending: number;
  failed: number;
  total: number;
  lastSyncedAt: string | null;
  /** آیا چیزی هست که همین حالا بتوان فرستاد؟ */
  ready: boolean;
  /** فاصله انسانی تا تلاش بعدی، برای نشان‌دادن در نوار وضعیت */
  nextRetryInMs: number | null;
}

export function summarize(state: QueueState, now: string): QueueSummary {
  const ready = nextBatch(state, now).length;
  const dead = stuckOperations(state);
  const waiting = state.operations
    .filter((op) => op.status === "failed" && op.attempts < MAX_ATTEMPTS && op.nextAttemptAt)
    .map((op) => Date.parse(op.nextAttemptAt!) - Date.parse(now))
    .filter((ms) => ms > 0);

  return {
    pending: state.operations.length,
    failed: dead.length,
    total: state.operations.length,
    lastSyncedAt: state.lastSyncedAt,
    ready: ready > 0,
    nextRetryInMs: waiting.length ? Math.min(...waiting) : null,
  };
}

/* ------------------------------ ادغام داده سرور ------------------------------ */

export interface WithUpdatedAt {
  id: string;
  updated_at?: string | null;
}

/**
 * ادغام ردیف‌های سرور با داده محلی: هر ردیف با `updated_at` جدیدتر برنده است.
 * ردیف‌های تازه اضافه می‌شوند و ردیف‌های حذف‌شده (tombstone) از محلی حذف.
 */
export function mergeByUpdatedAt<T extends WithUpdatedAt>(
  local: T[],
  remote: (T & { deleted?: boolean })[],
): { rows: T[]; changed: number } {
  const byId = new Map(local.map((row) => [row.id, row]));
  let changed = 0;

  for (const incoming of remote) {
    const current = byId.get(incoming.id);
    if (incoming.deleted) {
      if (current) {
        byId.delete(incoming.id);
        changed += 1;
      }
      continue;
    }
    if (!current) {
      const { deleted: _drop, ...row } = incoming;
      byId.set(row.id, row as T);
      changed += 1;
      continue;
    }
    const localTime = current.updated_at ?? "";
    const remoteTime = incoming.updated_at ?? "";
    if (remoteTime > localTime) {
      const { deleted: _drop, ...row } = incoming;
      byId.set(row.id, row as T);
      changed += 1;
    }
  }

  return { rows: [...byId.values()], changed };
}

/** پاک‌سازی صف بعد از همگام‌سازی کامل (مثلاً خروج از حساب) */
export function clearQueue(state: QueueState): QueueState {
  return { operations: [], lastSyncedAt: state.lastSyncedAt };
}

/* ------------------------- حل تعارض ثبت روزانه ------------------------- */

export interface LocalLogSnapshot {
  /** ستون pending=1 یعنی این ثبت هنوز در صف است و به سرور نرسیده */
  pending?: number;
  updated_at?: string | null;
}

export type LogMergeDecision = "write" | "keep-local" | "skip" | "delete";

/**
 * تصمیم ادغام یک ثبت روزانه سرور با نسخه محلی.
 *
 * سه قاعده، به همین ترتیب:
 * ۱. حذف در سرور، حذف محلی است (tombstone).
 * ۲. ثبتِ در صف همیشه برنده است؛ وگرنه کاربر مقداری را که تازه وارد کرده و
 *    هنوز ارسال نشده، با نسخه قدیمی سرور از دست می‌دهد.
 * ۳. در غیر این صورت، نسخه با `updated_at` جدیدتر می‌نویسد.
 *
 * «دوباره‌نویسی بی‌دلیل» (skip) هم عمدی است: از رفرش بی‌پایان و از
 * بازنویسی اثری که کاربر روی صفحه می‌بیند جلوگیری می‌کند.
 */
export function decideLogMerge(
  local: LocalLogSnapshot | null,
  remote: { updated_at?: string | null; deleted?: boolean } | null,
): LogMergeDecision {
  if (remote?.deleted) return "delete";
  if (!remote) return "skip";
  if (!local) return "write";
  if (local.pending === 1) return "keep-local";
  if ((remote.updated_at ?? "") > (local.updated_at ?? "")) return "write";
  return "skip";
}
