/* وضعیت ورود و نقش کاربر.

   نقش از `farms[].role` در پاسخ `/auth/me` خوانده می‌شود. اگر کاربر در چند
   مزرعه عضو باشد، بالاترین نقش انتخاب می‌شود (مالک > مدیر > کارگر > دامپزشک)
   تا منو دستِ‌کم کم نشان ندهد؛ بررسی نهایی مجوز همیشه در سرور است. */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Role } from "@farm/domain";
import { api, ApiError, tokenStore } from "./lib/api";
import type { SessionUser } from "./lib/types";

const ROLE_RANK: Record<Role, number> = { owner: 4, manager: 3, vet: 2, worker: 1 };

export interface ActiveFarm {
  farmId: string;
  name: string;
  role: Role;
}

interface AuthValue {
  status: "loading" | "anonymous" | "ready";
  user: SessionUser | null;
  farm: ActiveFarm | null;
  role: Role | null;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  reload: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

function pickFarm(user: SessionUser): ActiveFarm | null {
  if (!user.farms?.length) return null;
  const best = [...user.farms].sort((a, b) => ROLE_RANK[b.role] - ROLE_RANK[a.role])[0];
  return { farmId: best.farmId, name: best.name, role: best.role };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthValue["status"]>("loading");
  const [user, setUser] = useState<SessionUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tokenStore.get()) {
      setStatus("anonymous");
      return;
    }
    try {
      const me = await api.me();
      setUser(me);
      setStatus("ready");
    } catch (err) {
      // توکن منقضی یا نامعتبر: پاک می‌شود تا کاربر دوباره وارد شود
      if (err instanceof ApiError && (err.status === 401 || err.status === 0)) tokenStore.clear();
      setUser(null);
      setStatus("anonymous");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const login = useCallback(
    async (email: string, password: string) => {
      setError(null);
      try {
        const res = await api.login(email.trim(), password);
        tokenStore.set(res.accessToken);
        const me = await api.me();
        setUser(me);
        setStatus("ready");
      } catch (err) {
        setError(err instanceof Error ? err.message : "ورود ناموفق بود.");
        throw err;
      }
    },
    [],
  );

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
    setStatus("anonymous");
  }, []);

  const farm = useMemo(() => (user ? pickFarm(user) : null), [user]);

  const value = useMemo<AuthValue>(
    () => ({ status, user, farm, role: farm?.role ?? null, error, login, logout, reload: load }),
    [status, user, farm, error, login, logout, load],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth باید داخل AuthProvider استفاده شود.");
  return ctx;
}
