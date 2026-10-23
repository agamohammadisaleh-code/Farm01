/* کلاینت API.

   مسیر پایه همیشه نسبی است (`/api/v1`)؛ Vite در توسعه و nginx در تولید آن را
   به سرور واقعی پروکسی می‌کنند. بنابراین مرورگر هرگز localhost صدا نمی‌زند و
   CORS هم لازم نیست — همین موضوع پیش‌نمایش داخل سندباکس را هم سالم نگه می‌دارد. */

import type { DailyLog, Overview, Reminder, SessionUser } from "./types";

const BASE = "/api/v1";
const TOKEN_KEY = "farm.web.token";

export class ApiError extends Error {
  status: number;
  fieldErrors: Record<string, string>;

  constructor(message: string, status: number, fieldErrors: Record<string, string> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

interface Options {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
}

async function request<T>(path: string, options: Options = {}): Promise<T> {
  const token = tokenStore.get();
  let res: Response;

  try {
    res = await fetch(`${BASE}${path}`, {
      method: options.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    // خطای شبکه: پیام انسانی فارسی، نه «Failed to fetch»
    throw new ApiError("ارتباط با سرور برقرار نشد. اتصال شبکه را بررسی کنید.", 0);
  }

  const text = await res.text();
  const data = text ? safeJson(text) : null;

  if (!res.ok) {
    const raw = data?.message ?? data?.error ?? "خطا در انجام درخواست";
    const message = Array.isArray(raw) ? String(raw[0]) : String(raw);
    throw new ApiError(message, res.status, (data?.errors as Record<string, string>) ?? {});
  }

  return data as T;
}

function safeJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export const api = {
  login: (email: string, password: string) =>
    request<{ accessToken: string; refreshToken: string }>("/auth/login", {
      method: "POST",
      body: { email, password },
    }),
  me: () => request<SessionUser>("/auth/me"),
  overview: () => request<Overview>("/analytics/overview"),
  reminders: (horizonDays = 14) => request<{ reminders: Reminder[] }>(`/reminders?horizonDays=${horizonDays}`),
  logs: (flockId: string) => request<DailyLog[]>(`/flocks/${flockId}/logs`),
  saveLog: (
    flockId: string,
    body: {
      date: string;
      mortality: number;
      cull?: number;
      feedKg: number;
      waterLiter?: number;
      avgTemp?: number;
    },
  ) => request<DailyLog>(`/flocks/${flockId}/logs`, { method: "POST", body }),
};
