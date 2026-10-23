/* کلاینت HTTP با توکن ذخیره‌شده در SecureStore.

   نکته مهم برای آفلاین: هر خطای شبکه به خطای قابل‌تشخیص تبدیل می‌شود
   (`OfflineError`) تا لایه همگام‌سازی بفهمد «الان اینترنت نیست» و عملیات
   را نگه دارد، نه اینکه آن را ناموفق دائمی حساب کند.
*/

import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";

export class OfflineError extends Error {
  constructor(message = "اتصال به سرور برقرار نشد.") {
    super(message);
    this.name = "OfflineError";
  }
}

export class ApiError extends Error {
  status: number;
  errors?: Record<string, string>;
  constructor(message: string, status: number, errors?: Record<string, string>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.errors = errors;
  }
}

const TOKEN_KEY = "farm_access_token";
const REFRESH_KEY = "farm_refresh_token";

const extra = (Constants.expoConfig?.extra ?? {}) as { apiUrl?: string };
export const API_URL = (extra.apiUrl ?? "http://localhost:3000").replace(/\/$/, "");

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function saveTokens(access: string, refresh?: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, access);
  if (refresh) await SecureStore.setItemAsync(REFRESH_KEY, refresh);
}

export async function clearTokens(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(REFRESH_KEY);
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  /** برای همگام‌سازی: بدون توکن هم امتحان نکن و سریع خطا بده */
  timeoutMs?: number;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = await getToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 12_000);

  try {
    const res = await fetch(`${API_URL}/api/v1${path}`, {
      method: options.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });

    const text = await res.text();
    const body = text ? JSON.parse(text) : null;

    if (!res.ok) {
      const message = body?.message ?? body?.error ?? "خطا در ارتباط با سرور";
      throw new ApiError(Array.isArray(message) ? message[0] : message, res.status, body?.errors);
    }
    return body as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    // abort، خطای شبکه و DNS همه «آفلاین» هستند، نه خطای اعتبار داده
    throw new OfflineError();
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => request<T>(path, { ...options, method: "GET" }),
  post: <T>(path: string, body: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "POST", body }),
  patch: <T>(path: string, body: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "PATCH", body }),
  delete: <T>(path: string, options?: RequestOptions) => request<T>(path, { ...options, method: "DELETE" }),
};

/* ------------------------------- ورود ------------------------------- */

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: "owner" | "manager" | "worker" | "vet";
  farmId: string;
}

export async function login(email: string, password: string): Promise<SessionUser> {
  const res = await api.post<{ accessToken: string; refreshToken: string; user: SessionUser }>("/auth/login", {
    email,
    password,
  });
  await saveTokens(res.accessToken, res.refreshToken);
  return res.user;
}

export async function me(): Promise<SessionUser> {
  return api.get<SessionUser>("/auth/me");
}
