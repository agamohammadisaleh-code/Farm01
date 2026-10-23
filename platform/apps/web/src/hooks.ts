/* قلاب‌های داده.

   هر صفحه فقط چیزی را می‌خواند که لازم دارد. `reload` عمداً در دسترس است تا
   بعد از ثبت، عددها بلافاصله تازه شوند — کاربر بدون رفرش صفحه نتیجه را ببیند. */

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./lib/api";
import { todayIso } from "@farm/domain";
import type { DailyLog, Overview, Reminder } from "./lib/types";

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

function useAsync<T>(loader: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    loader()
      .then((result) => {
        if (alive.current) setData(result);
      })
      .catch((err: unknown) => {
        if (alive.current) setError(err instanceof Error ? err.message : "خطا در دریافت داده");
      })
      .finally(() => {
        if (alive.current) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);

  const reload = useCallback(() => setTick((n) => n + 1), []);
  return { data, loading, error, reload };
}

export const useOverview = () => useAsync<Overview>(() => api.overview());

export const useReminders = () => useAsync<{ reminders: Reminder[] }>(() => api.reminders(14));

export const useLogs = (flockId: string | null) =>
  useAsync<DailyLog[]>(() => (flockId ? api.logs(flockId) : Promise.resolve([])), [flockId]);

export const today = () => todayIso();
