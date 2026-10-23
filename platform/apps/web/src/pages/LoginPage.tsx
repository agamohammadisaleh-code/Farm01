import React, { useState } from "react";
import { useAuth } from "../auth";
import { Card } from "../components/ui";

/**
 * صفحه ورود — ساده و بدون شلوغی.
 * در حالت توسعه، حساب نمونه پیشنهاد می‌شود تا ارزیابی محصول سریع باشد؛
 * در باندل تولید این بخش وجود ندارد (`import.meta.env.DEV`).
 */
export function LoginPage() {
  const { login, error } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const isDev = import.meta.env.DEV;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await login(email, password);
    } catch {
      /* پیام در context نگه داشته می‌شود */
    } finally {
      setBusy(false);
    }
  };

  const fillDemo = () => {
    setEmail("owner@farm.ir");
    setPassword("Secret1234");
  };

  return (
    <div className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-brand-50 text-4xl" aria-hidden>
            🐔
          </div>
          <h1 className="mt-3 text-2xl font-extrabold text-brand-700">مرغ‌یار</h1>
          <p className="mt-1 text-sm text-muted">مدیریت گله گوشتی — داشبورد و ثبت روزانه</p>
        </div>

        <Card>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label htmlFor="email" className="mb-1 block text-sm font-bold text-muted">
                ایمیل
              </label>
              <input
                id="email"
                className="field"
                type="email"
                inputMode="email"
                autoComplete="username"
                dir="ltr"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="owner@farm.ir"
                required
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-1 block text-sm font-bold text-muted">
                گذرواژه
              </label>
              <input
                id="password"
                className="field"
                type="password"
                autoComplete="current-password"
                dir="ltr"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            {error ? (
              <p className="rounded-xl bg-danger-50 px-3 py-2 text-sm font-bold text-danger-700" role="alert">
                {error}
              </p>
            ) : null}

            <button type="submit" className="btn-primary w-full" disabled={busy || !email || !password}>
              {busy ? "در حال ورود…" : "ورود"}
            </button>
          </form>

          {isDev ? (
            <div className="mt-4 rounded-xl bg-paper p-3 text-xs leading-6 text-muted">
              <p className="font-bold text-ink">حساب نمونه (فقط در محیط توسعه پیشنهاد می‌شود)</p>
              <p dir="ltr" className="text-left">
                owner@farm.ir / Secret1234
              </p>
              <button type="button" className="btn-ghost mt-2 !min-h-[40px] !text-xs" onClick={fillDemo}>
                پر کردن فرم با حساب نمونه
              </button>
            </div>
          ) : null}
        </Card>

        <p className="mt-4 text-center text-xs text-muted">
          داده‌های شما روی سرور خودتان می‌ماند؛ این صفحه هیچ اطلاعاتی به سرویس بیرونی نمی‌فرستد.
        </p>
      </div>
    </div>
  );
}
