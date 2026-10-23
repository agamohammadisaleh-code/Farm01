/* داشبورد مدیریتی — برای مالک و مدیر.

   ساختار صفحه از بالا به پایین، از «چه خبر؟» به «چرا؟»:
   ۱. چهار شاخص کلیدی (FCR، تلفات، وزن، بهای تمام‌شده)
   ۲. هشدارهای امروز
   ۳. سه نمودار روند: دان، وزن، تلفات
   ۴. ترکیب هزینه و پیش‌بینی پایان دوره */

import { useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../auth";
import { useOverview } from "../hooks";
import { deriveKpis, secondaryStats } from "../lib/kpi";
import { buildChartSeries, feedSummary, mortalitySummary, weightSummary } from "../lib/series";
import { fa, percent, toman, tomanCompact, weightText, jalali, todayIso } from "../lib/format";
import { Card, EmptyState, ErrorState, Loading, SectionTitle, Badge } from "../components/ui";
import { KpiCard } from "../components/KpiCard";
import { AlertList } from "../components/AlertList";
import { FeedChart, MortalityChart, WeightChart } from "../components/charts";
import { can } from "@farm/domain";

export function DashboardPage() {
  const { role } = useAuth();
  const overview = useOverview();
  const [params, setParams] = useSearchParams();

  const active = overview.data?.activeMetrics ?? [];
  const selectedId = params.get("flock");
  const metrics = useMemo(
    () => active.find((item) => item.flock.id === selectedId) ?? active[0] ?? null,
    [active, selectedId],
  );

  useEffect(() => {
    if (!selectedId && active[0]) setParams({ flock: active[0].flock.id }, { replace: true });
  }, [active, selectedId, setParams]);

  const series = useMemo(() => buildChartSeries(metrics), [metrics]);
  const kpis = useMemo(() => deriveKpis(metrics), [metrics]);
  const stats = useMemo(() => secondaryStats(metrics), [metrics]);

  if (overview.loading && !overview.data) return <Loading label="در حال محاسبه شاخص‌ها…" />;
  if (overview.error) return <ErrorState message={overview.error} onRetry={overview.reload} />;
  if (!overview.data) return <EmptyState title="داده‌ای برای نمایش نیست" />;

  if (!can(role, "cost:read")) {
    return (
      <EmptyState
        icon="🔒"
        title="داشبورد مالی برای نقش شما باز نیست"
        hint="کارگر سالن و دامپزشک داده هزینه و سود را نمی‌بینند. صفحه «امروز» برای ثبت روزانه در دسترس است."
      />
    );
  }

  const data = overview.data;
  const alerts = data.alerts ?? [];

  return (
    <div className="space-y-4">
      {/* خلاصه مزرعه */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryTile label="پرنده زنده مزرعه" value={fa(data.liveBirds)} unit="قطعه" />
        <SummaryTile label="وزن زنده کل" value={fa(data.liveBiomassKg)} unit="کیلوگرم" />
        <SummaryTile label="هزینه فعال" value={tomanCompact(data.activeCost)} unit="جمع هزینه گله‌های فعال" />
        <SummaryTile
          label="سود تحقق‌یافته"
          value={tomanCompact(data.realizedProfit)}
          unit={`از فروش ${tomanCompact(data.realizedRevenue)}`}
        />
      </div>

      {active.length > 1 ? (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="انتخاب گله">
          <span className="text-sm font-bold text-muted">گله:</span>
          {active.map((item) => (
            <button
              key={item.flock.id}
              type="button"
              onClick={() => setParams({ flock: item.flock.id })}
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

      {metrics ? (
        <>
          <Card className="!p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-xl font-extrabold text-ink">{metrics.flock.name}</h1>
                <p className="mt-1 text-sm text-muted">
                  {metrics.flock.breed} · شروع {jalali(metrics.flock.start_date)} ·{" "}
                  <span className="font-bold text-ink">روز {fa(metrics.ageDays)}</span> از {fa(metrics.targetAge)} ·{" "}
                  {fa(metrics.liveBirds)} پرنده زنده
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge tone="info">{fa(metrics.daysRemaining)} روز تا بارگیری</Badge>
                <Badge tone={metrics.weightSource === "measured" ? "good" : "neutral"}>
                  {metrics.weightSource === "measured" ? "وزن اندازه‌گیری‌شده" : "وزن برآوردی"}
                </Badge>
              </div>
            </div>
          </Card>

          {/* ۱. شاخص‌های کلیدی */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {kpis.map((kpi) => (
              <KpiCard key={kpi.key} kpi={kpi} />
            ))}
          </div>

          {/* آمار عملیاتی روزانه */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {stats.map((stat) => (
              <div key={stat.key} className="card p-4">
                <p className="text-xs font-bold text-muted">{stat.label}</p>
                <p className="num mt-1 text-xl font-extrabold text-ink">{stat.value}</p>
                {stat.hint ? <p className="mt-1 text-[11px] leading-5 text-muted">{stat.hint}</p> : null}
              </div>
            ))}
          </div>

          {/* ۲. هشدارها */}
          {alerts.length > 0 ? (
            <Card>
              <SectionTitle
                title="هشدارها"
                hint="از قواعد کسب‌وکار و روند داده ساخته می‌شوند؛ هر هشدار می‌گوید چه کاری انجام دهید."
              />
              <AlertList alerts={alerts} />
            </Card>
          ) : (
            <Card className="!border-brand-500/30 !bg-brand-50/50">
              <p className="text-center text-base font-bold text-brand-700">
                ✅ هشدار فعالی نیست — روند آب، دان، تلفات و وزن در محدوده طبیعی است.
              </p>
            </Card>
          )}

          {/* ۳. نمودارهای روند */}
          <Card>
            <SectionTitle
              title="مصرف دان روزانه"
              hint="ستون سبز مصرف واقعی است و خط خاکستری، انتظار استاندارد نژاد در همان روز."
              action={<Badge tone={metrics.feedVsStdPct > 5 ? "warn" : "good"}>{percent(metrics.feedVsStdPct)} نسبت به استاندارد</Badge>}
            />
            <FeedChart data={series} />
            <p className="mt-2 text-xs text-muted">{feedSummary(series, todayIso())}</p>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <SectionTitle title="روند وزن" hint={`استاندارد روز جاری: ${weightText(metrics.stdWeightG)}`} />
              <WeightChart data={series} />
              <p className="mt-2 text-xs text-muted">{weightSummary(series)}</p>
            </Card>

            <Card>
              <SectionTitle title="تلفات" hint="ستون: تلفات روز · خط: درصد تجمعی از کل جوجه‌ریزی" />
              <MortalityChart data={series} />
              <p className="mt-2 text-xs text-muted">{mortalitySummary(series)}</p>
            </Card>
          </div>

          {/* ۴. هزینه و پیش‌بینی */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <SectionTitle title="ترکیب هزینه" hint={`جمع: ${toman(metrics.totalCost)}`} />
              <ul className="space-y-3">
                {metrics.costBreakdown.map((slice) => (
                  <li key={slice.key}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-bold text-ink">{slice.label}</span>
                      <span className="num text-muted">
                        {tomanCompact(slice.amount)} · {percent(slice.share)}
                      </span>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-paper" role="presentation">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${Math.max(1, Math.min(100, slice.share))}%`, backgroundColor: slice.color }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </Card>

            <Card>
              <SectionTitle
                title="پیش‌بینی پایان دوره"
                hint={
                  metrics.projection
                    ? `اگر روند فعلی ادامه یابد (روز ${fa(metrics.projection.targetAge)})`
                    : "برای نقش شما پنهان است"
                }
              />
              {metrics.projection ? (
                <>
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    <Row label="وزن پیش‌بینی" value={weightText(metrics.projection.projectedWeightG)} />
                    <Row label="FCR پیش‌بینی" value={fa(metrics.projection.projectedFcr, 2)} />
                    <Row label="درآمد پیش‌بینی" value={tomanCompact(metrics.projection.projectedRevenue)} />
                    <Row label="هزینه پیش‌بینی" value={tomanCompact(metrics.projection.projectedCost)} />
                  </dl>
                  <div className="mt-3 rounded-xl bg-brand-50 px-4 py-3">
                    <p className="text-xs font-bold text-brand-700">سود پیش‌بینی‌شده</p>
                    <p className="num text-2xl font-extrabold text-brand-700">
                      {toman(metrics.projection.projectedProfit)}
                    </p>
                    <p className="mt-1 text-[11px] text-brand-700/80">
                      حاشیه سود فعلی: {percent(metrics.marginPct)} · نقطه سربه‌سر: {toman(metrics.breakevenPerKg)} هر
                      کیلو
                    </p>
                  </div>
                </>
              ) : (
                <p className="rounded-xl bg-paper px-3 py-4 text-sm text-muted">
                  شاخص‌های مالی برای نقش شما نمایش داده نمی‌شود.
                </p>
              )}
            </Card>
          </div>
        </>
      ) : (
        <EmptyState
          icon="🐣"
          title="گله فعالی وجود ندارد"
          hint="پس از ساخت گله، شاخص‌ها و نمودارها اینجا نمایش داده می‌شوند."
        />
      )}

      {data.closedMetrics.length > 0 ? (
        <Card>
          <SectionTitle title="گله‌های بسته‌شده" hint="نتیجه واقعی، نه پیش‌بینی." />
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead>
                <tr className="text-xs text-muted">
                  <th className="p-2 font-bold">گله</th>
                  <th className="p-2 font-bold">سن پایان</th>
                  <th className="p-2 font-bold">FCR</th>
                  <th className="p-2 font-bold">تلفات</th>
                  <th className="p-2 font-bold">فروش</th>
                  <th className="p-2 font-bold">سود</th>
                </tr>
              </thead>
              <tbody>
                {data.closedMetrics.map((row) => (
                  <tr key={row.flock.id} className="border-t border-line">
                    <td className="p-2 font-bold text-ink">{row.flock.name}</td>
                    <td className="num p-2">{fa(row.ageDays)} روز</td>
                    <td className="num p-2">{fa(row.fcr, 2)}</td>
                    <td className="num p-2">{percent(row.removalPct)}</td>
                    <td className="num p-2">{tomanCompact(row.revenue)}</td>
                    <td className={`num p-2 font-bold ${(row.netProfit ?? 0) >= 0 ? "text-brand-700" : "text-danger-700"}`}>
                      {tomanCompact(row.netProfit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function SummaryTile({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-bold text-muted">{label}</p>
      <p className="num mt-1 text-2xl font-extrabold text-ink">{value}</p>
      <p className="mt-1 text-[11px] text-muted">{unit}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="num font-bold text-ink">{value}</dd>
    </div>
  );
}
