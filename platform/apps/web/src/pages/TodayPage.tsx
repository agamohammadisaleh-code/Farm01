/* صفحه «امروز» — صفحه اصلی کارگر سالن.

   هدف: کارگر بدون آموزش، در کمتر از یک دقیقه دان و تلفات امروز را ثبت کند.
   برای همین فقط چهار عدد بزرگ، دو دکمه ± روی هر عدد، و یک دکمه ثبت وجود دارد.
   هیچ جدول، فیلتر یا اصطلاح تخصصی در این صفحه نیست. */

import React, { useEffect, useMemo, useState } from "react";
import { can } from "@farm/domain";
import { useAuth } from "../auth";
import { api } from "../lib/api";
import { fa, jalali, todayIso, toNumber } from "../lib/format";
import { useLogs, useOverview, useReminders } from "../hooks";
import { BigNumberField } from "../components/BigNumberField";
import { ReminderList } from "../components/ReminderList";
import { AlertList } from "../components/AlertList";
import { Badge, Card, EmptyState, ErrorState, Loading, SectionTitle } from "../components/ui";

interface FormState {
  mortality: string;
  feedKg: string;
  waterLiter: string;
  avgTemp: string;
}

const EMPTY: FormState = { mortality: "", feedKg: "", waterLiter: "", avgTemp: "" };

export function TodayPage() {
  const { role } = useAuth();
  const overview = useOverview();
  const reminders = useReminders();

  const activeFlocks = overview.data?.activeMetrics ?? [];
  const [flockId, setFlockId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const logs = useLogs(flockId);
  const today = todayIso();

  const metrics = useMemo(
    () => activeFlocks.find((item) => item.flock.id === flockId) ?? activeFlocks[0] ?? null,
    [activeFlocks, flockId],
  );

  // نخستین گله فعال، پیش‌فرض انتخاب می‌شود
  useEffect(() => {
    if (!flockId && activeFlocks[0]) setFlockId(activeFlocks[0].flock.id);
  }, [activeFlocks, flockId]);

  const existing = useMemo(() => logs.data?.find((log) => log.date === today) ?? null, [logs.data, today]);

  // اگر امروز قبلاً ثبت شده، مقدارهای قبلی نشان داده می‌شوند تا کاربر
  // همان عدد را دوباره از صفر تایپ نکند و بداند قبلاً ثبت شده است
  useEffect(() => {
    if (!existing) {
      setForm(EMPTY);
      return;
    }
    setForm({
      mortality: String(existing.mortality ?? 0),
      feedKg: String(existing.feed_kg ?? 0),
      waterLiter: String(existing.water_liter ?? 0),
      avgTemp: existing.avg_temp === null || existing.avg_temp === undefined ? "" : String(existing.avg_temp),
    });
  }, [existing?.id]);

  const canWrite = can(role, "log:write");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!metrics) return;

    setError(null);
    setSaved(null);

    const mortality = toNumber(form.mortality);
    const feedKg = toNumber(form.feedKg);

    if (mortality === null || feedKg === null) {
      setError("دو عدد «تلفات» و «دان» را وارد کنید (صفر هم قابل قبول است).");
      return;
    }

    setBusy(true);
    try {
      const water = toNumber(form.waterLiter);
      const temp = toNumber(form.avgTemp);

      await api.saveLog(metrics.flock.id, {
        date: today,
        mortality: Math.round(mortality),
        feedKg,
        waterLiter: water === null ? undefined : water,
        avgTemp: temp === null ? undefined : temp,
      });

      setSaved(existing ? "ثبت امروز به‌روزرسانی شد." : "ثبت امروز ذخیره شد.");
      overview.reload();
      logs.reload();
      reminders.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ثبت انجام نشد.");
    } finally {
      setBusy(false);
    }
  };

  if (overview.loading && !overview.data) return <Loading label="در حال دریافت گله‌ها…" />;
  if (overview.error) return <ErrorState message={overview.error} onRetry={overview.reload} />;

  if (activeFlocks.length === 0) {
    return (
      <EmptyState
        icon="🐣"
        title="هنوز گله فعالی ثبت نشده است"
        hint="برای شروع، مالک یا مدیر باید از داشبورد یک گله بسازد."
      />
    );
  }

  const criticalAlerts = (overview.data?.alerts ?? []).filter((alert) => alert.severity === "critical");

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <div className="space-y-4">
        <Card>
          <SectionTitle
            title="ثبت امروز"
            hint={`${jalali(today)} — فقط چهار عدد لازم است. دکمه‌های + و − برای ورود سریع هستند.`}
            action={<Badge tone={existing ? "warn" : "good"}>{existing ? "قبلاً ثبت شده" : "ثبت نشده"}</Badge>}
          />

          {activeFlocks.length > 1 ? (
            <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="انتخاب گله">
              {activeFlocks.map((item) => (
                <button
                  key={item.flock.id}
                  type="button"
                  onClick={() => setFlockId(item.flock.id)}
                  className={`chip border ${
                    item.flock.id === metrics?.flock.id
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-line bg-white text-ink"
                  }`}
                  aria-pressed={item.flock.id === metrics?.flock.id}
                >
                  {item.flock.name}
                </button>
              ))}
            </div>
          ) : null}

          <form onSubmit={submit} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <BigNumberField
                id="mortality"
                label="تلفات"
                icon="🐔"
                unit="قطعه"
                value={form.mortality}
                onChange={(value) => setForm((prev) => ({ ...prev, mortality: value }))}
                step={1}
                hint="تعداد پرنده‌هایی که امروز تلف شدند"
              />
              <BigNumberField
                id="feedKg"
                label="دان مصرفی"
                icon="🌾"
                unit="کیلوگرم"
                value={form.feedKg}
                onChange={(value) => setForm((prev) => ({ ...prev, feedKg: value }))}
                step={10}
                hint={
                  metrics && metrics.expectedDailyFeedKg > 0
                    ? `انتظار امروز حدود ${fa(Math.round(metrics.expectedDailyFeedKg))} کیلوگرم`
                    : undefined
                }
              />
              <BigNumberField
                id="waterLiter"
                label="آب مصرفی"
                icon="💧"
                unit="لیتر"
                value={form.waterLiter}
                onChange={(value) => setForm((prev) => ({ ...prev, waterLiter: value }))}
                step={20}
                hint="اختیاری — برای هشدار زودهنگام بیماری مهم است"
              />
              <BigNumberField
                id="avgTemp"
                label="دمای سالن"
                icon="🌡️"
                unit="درجه"
                value={form.avgTemp}
                onChange={(value) => setForm((prev) => ({ ...prev, avgTemp: value }))}
                step={0.5}
                decimals
                hint="اختیاری"
              />
            </div>

            {error ? (
              <p className="rounded-xl bg-danger-50 px-3 py-2 text-sm font-bold text-danger-700" role="alert">
                {error}
              </p>
            ) : null}
            {saved ? (
              <p className="rounded-xl bg-brand-50 px-3 py-2 text-sm font-bold text-brand-700" role="status">
                ✅ {saved}
              </p>
            ) : null}

            <button type="submit" className="btn-primary w-full !min-h-[60px] !text-lg" disabled={!canWrite || busy}>
              {busy ? "در حال ذخیره…" : existing ? "به‌روزرسانی ثبت امروز" : "ثبت امروز"}
            </button>

            {!canWrite ? (
              <p className="text-center text-sm text-danger-700">نقش شما اجازه ثبت روزانه ندارد.</p>
            ) : (
              <p className="text-center text-xs text-muted">
                پس از ثبت، «تلفات و آب» امروز در داشبورد و هشدارها لحاظ می‌شود.
              </p>
            )}
          </form>
        </Card>

        {criticalAlerts.length > 0 ? (
          <Card className="!border-danger-500/30">
            <SectionTitle title="هشدارهای فوری" hint="این‌ها را امروز بررسی کنید؛ پیش از آن‌که به تلفات بیشتر برسد." />
            <AlertList alerts={criticalAlerts} limit={2} />
          </Card>
        ) : null}
      </div>

      <div className="space-y-4">
        <Card>
          <SectionTitle title="کارهای امروز" hint="واکسن، دارو، ثبت جاافتاده و بارگیری." />
          {reminders.loading && !reminders.data ? (
            <p className="py-6 text-center text-sm text-muted">در حال دریافت…</p>
          ) : reminders.data?.reminders?.length ? (
            <ReminderList reminders={reminders.data.reminders} limit={6} />
          ) : (
            <p className="rounded-xl bg-brand-50 px-3 py-4 text-center text-sm font-bold text-brand-700">
              کاری برای امروز ثبت نشده است. ✅
            </p>
          )}
        </Card>

        {metrics ? (
          <Card>
            <SectionTitle title="گله‌ی انتخاب‌شده" />
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-muted">گله</dt>
                <dd className="font-bold text-ink">{metrics.flock.name}</dd>
              </div>
              <div>
                <dt className="text-muted">نژاد</dt>
                <dd className="font-bold text-ink">{metrics.flock.breed}</dd>
              </div>
              <div>
                <dt className="text-muted">سن</dt>
                <dd className="num font-bold text-ink">{fa(metrics.ageDays)} روز</dd>
              </div>
              <div>
                <dt className="text-muted">پرنده زنده</dt>
                <dd className="num font-bold text-ink">{fa(metrics.liveBirds)}</dd>
              </div>
            </dl>
            <p className="mt-3 rounded-xl bg-paper px-3 py-2 text-xs leading-6 text-muted">
              اگر عددی اشتباه ثبت شد، همان روز را دوباره ثبت کنید؛ ثبت روز تکراری ساخته نمی‌شود و مقدار قبلی
              به‌روز می‌شود.
            </p>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
