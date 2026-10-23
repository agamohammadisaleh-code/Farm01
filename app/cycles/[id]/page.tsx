import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowRight,
  Bird,
  Scale,
  Gauge,
  TrendingUp,
  Sparkles,
  HeartPulse,
  Wheat,
  Wallet,
  Droplets,
  Thermometer,
  ClipboardList,
  Receipt,
  BadgeDollarSign,
  CalendarDays,
  PackageOpen,
  CircleDollarSign,
  Settings2,
} from "lucide-react";
import { getSettings } from "@/lib/db";
import {
  computeMetrics,
  getCosts,
  getCycle,
  getLogs,
  getSales,
  categoryColor,
  categoryLabel,
  COST_CATEGORIES,
} from "@/lib/metrics";
import { compactToman, num, pct, toman, signedPct, gram } from "@/lib/format";
import { formatJalali, faDigits } from "@/lib/jalali";
import { standardAt, STANDARD_ANCHORS } from "@/lib/standards";
import StatCard from "@/components/ui/StatCard";
import TrendChart from "@/components/charts/TrendChart";
import DonutChart from "@/components/charts/DonutChart";
import BarList from "@/components/ui/BarList";
import InsightRow from "@/components/ui/InsightRow";
import DailyLogForm from "@/components/forms/DailyLogForm";
import CostForm from "@/components/forms/CostForm";
import SaleForm from "@/components/forms/SaleForm";
import EditCycleForm from "@/components/forms/EditCycleForm";
import { DeleteRecord, CycleStateButton, DeleteCycleButton } from "@/components/forms/RecordActions";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "overview", label: "نمای کلی", icon: <Gauge size={14} /> },
  { key: "daily", label: "ثبت روزانه", icon: <ClipboardList size={14} /> },
  { key: "growth", label: "رشد و عملکرد", icon: <Scale size={14} /> },
  { key: "feed", label: "دان و آب", icon: <Wheat size={14} /> },
  { key: "costs", label: "هزینه‌ها", icon: <Receipt size={14} /> },
  { key: "sales", label: "فروش", icon: <BadgeDollarSign size={14} /> },
  { key: "insights", label: "تحلیل هوشمند", icon: <Sparkles size={14} /> },
  { key: "settings", label: "تنظیمات دوره", icon: <Settings2 size={14} /> },
];

export default async function CyclePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; created?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const cycleId = Number(id);
  const settings = getSettings();
  const cycle = getCycle(cycleId);
  if (!cycle) notFound();

  const logs = getLogs(cycleId);
  const costs = getCosts(cycleId);
  const sales = getSales(cycleId);
  const m = computeMetrics(cycle, logs, costs, sales, {
    marketPrice: settings.market_price,
    feedPrice: settings.feed_price,
  });
  const tab = TABS.some((t) => t.key === sp.tab) ? sp.tab! : "overview";
  const sortedLogs = [...logs].reverse();
  const sortedCosts = [...costs].sort((a, b) => (a.date < b.date ? 1 : -1));
  const sortedSales = [...sales].sort((a, b) => (a.date < b.date ? 1 : -1));
  const lastLog = logs.at(-1);

  const growthSeries = [
    {
      key: "std",
      name: "استاندارد نژاد",
      color: "#a3afa9",
      dashed: true,
      points: m.dailySeries.map((d) => ({ y: d.stdWeightG, label: `${d.day}` })),
    },
    {
      key: "actual",
      name: "وزن نمونه‌گیری",
      color: "#1e8a5f",
      area: true,
      points: m.dailySeries.map((d) => ({ y: d.avgWeightG ?? NaN, label: `${d.day}` })),
    },
  ];
  const feedSeries = [
    {
      key: "feed",
      name: "دان مصرفی (کیلوگرم)",
      color: "#cf8a06",
      area: true,
      points: m.dailySeries.map((d) => ({ y: d.feedKg, label: `${d.day}` })),
    },
    {
      key: "std",
      name: "مصرف استاندارد گله",
      color: "#a3afa9",
      dashed: true,
      points: m.dailySeries.map((d) => ({ y: d.stdDailyFeedKg, label: `${d.day}` })),
    },
  ];
  const mortalitySeries = [
    {
      key: "mort",
      name: "تلفات روزانه (قطعه)",
      color: "#bb3a2b",
      area: true,
      points: m.dailySeries.map((d) => ({ y: d.mortality, label: `${d.day}` })),
    },
  ];
  const waterSeries = [
    {
      key: "water",
      name: "آب مصرفی (لیتر)",
      color: "#2c6e9b",
      area: true,
      points: m.dailySeries.map((d) => ({ y: d.waterL, label: `${d.day}` })),
    },
  ];

  const phase = m.ageDays <= 10 ? 1 : m.ageDays <= 24 ? 2 : 3;
  const currentFeedName = ["دان آغازین", "دان رشد", "دان پایانی"][phase - 1] ?? "دان پایانی";
  const suggestedFeedKg = m.liveBirds * standardAt(m.ageDays).dailyFeedG / 1000;
  const suggestedWaterL = suggestedFeedKg * 1.8;

  return (
    <div className="page-enter">
      <div className="page-head" style={{ marginBottom: 16 }}>
        <div>
          <Link href="/cycles" className="row tiny muted" style={{ gap: 4, marginBottom: 6 }}>
            <ArrowRight size={12} />
            همه دوره‌ها
          </Link>
          <div className="row wrap" style={{ gap: 9 }}>
            <h1>{cycle.name}</h1>
            {cycle.status === "active" ? (
              <span className="badge badge-green">
                <span className="dot" />
                در جریان
              </span>
            ) : (
              <span className="badge badge-gray">بسته‌شده</span>
            )}
            {m.alerts.some((a) => a.severity === "critical") ? <span className="badge badge-red">نیاز به توجه</span> : null}
          </div>
          <p className="desc">
            {cycle.house || "بدون سالن"} · {cycle.breed} · جوجه‌ریزی {formatJalali(cycle.placement_date)} · سن{" "}
            {num(m.ageDays)} روز {cycle.closed_date ? `· بسته‌شده در ${formatJalali(cycle.closed_date)}` : ""}
          </p>
        </div>
        <div className="row wrap" style={{ gap: 8 }}>
          <Link
            href={`/assistant?q=${encodeURIComponent(`وضعیت ${cycle.name} چطور است و چه اقدامی لازم است؟`)}`}
            className="btn btn-outline btn-sm"
          >
            <Sparkles size={14} />
            تحلیل هوشمند
          </Link>
          <CycleStateButton cycleId={cycle.id} status={cycle.status} />
          <DeleteCycleButton cycleId={cycle.id} />
        </div>
      </div>

      {sp.created ? (
        <div className="form-msg success" style={{ marginBottom: 16 }}>
          دوره با موفقیت ایجاد شد. برای دقت تحلیل‌ها، آمار امروز را ثبت کنید.
        </div>
      ) : null}

      <div className="grid grid-4">
        <StatCard
          label="قطعه زنده"
          value={num(m.liveBirds)}
          unit={`از ${num(cycle.initial_count)}`}
          icon={<Bird size={17} />}
          hint={`تلفات: ${num(m.lostBirds)} قطعه (${pct(m.mortalityPct)})`}
          tone={m.mortalityPct > m.expectedMortalityPct * 1.3 ? "red" : "green"}
        />
        <StatCard
          label="وزن فعلی گله"
          value={num(m.currentWeightG)}
          unit="گرم"
          icon={<Scale size={17} />}
          trend={{ value: signedPct(m.weightVsStdPct), dir: m.weightVsStdPct >= 0 ? "up" : "down" }}
          hint={m.weightSource === "measured" ? "بر پایه آخرین وزن‌کشی" : "برآوردی"}
          tone={m.weightVsStdPct < -6 ? "amber" : "green"}
        />
        <StatCard
          label="ضریب تبدیل خوراک"
          value={m.fcr ? num(m.fcr, 2) : "—"}
          icon={<Gauge size={17} />}
          hint={`استاندارد گله: ${num(m.stdFcr, 2)}`}
          tone={m.fcr && m.fcr > m.stdFcr * 1.07 ? "amber" : "blue"}
        />
        <StatCard
          label="سود پیش‌بینی پایان دوره"
          value={compactToman(m.projection.projectedProfit).replace(" تومان", "")}
          unit="تومان"
          icon={<TrendingUp size={17} />}
          hint={`درآمد برآوردی: ${compactToman(m.projection.projectedRevenue)}`}
          tone={m.projection.projectedProfit >= 0 ? "green" : "red"}
        />
      </div>

      <div className="card mt-20" style={{ overflow: "visible" }}>
        <div className="tabs">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={`/cycles/${cycleId}?tab=${t.key}`}
              className={`tab${tab === t.key ? " active" : ""}`}
              scroll={false}
            >
              {t.icon}
              {t.label}
            </Link>
          ))}
        </div>

        <div className="card-body">
          {tab === "overview" && (
            <div className="grid" style={{ gap: 16 }}>
              <div className="grid grid-2-1">
                <div>
                  <div className="row-between mb-14">
                    <h3>روند رشد در برابر استاندارد</h3>
                    <span className="tiny muted">وزن بر حسب گرم</span>
                  </div>
                  <TrendChart series={growthSeries} format="int" xTitle="سن (روز)" height={262} />
                </div>
                <div>
                  <h3 style={{ marginBottom: 12 }}>هشدارها و توصیه‌ها</h3>
                  {m.alerts.slice(0, 3).map((a, i) => (
                    <InsightRow key={i} a={a} />
                  ))}
                  {m.alerts.length > 3 ? (
                    <Link href={`/cycles/${cycleId}?tab=insights`} className="alert-link">
                      مشاهده همه {faDigits(m.alerts.length)} توصیه
                      <ArrowRight size={12} />
                    </Link>
                  ) : null}
                </div>
              </div>

              <div className="grid grid-2">
                <div className="card" style={{ boxShadow: "none", background: "var(--surface-2)" }}>
                  <div className="card-head" style={{ background: "transparent" }}>
                    <div className="card-title">
                      <Wallet size={15} style={{ color: "var(--brand)" }} />
                      وضعیت مالی دوره
                    </div>
                  </div>
                  <div className="card-body" style={{ paddingTop: 10 }}>
                    <div className="kv-list">
                      <div className="kv">
                        <span className="k">هزینه مصرف‌شده تا امروز</span>
                        <span className="v num">{toman(m.totalCost)}</span>
                      </div>
                      <div className="kv">
                        <span className="k">درآمد تحقق‌یافته (فروش)</span>
                        <span className="v num">{toman(m.revenue)}</span>
                      </div>
                      <div className="kv">
                        <span className="k">ارزش گله زنده (قیمت بازار)</span>
                        <span className="v num">{toman(m.estimatedLiveValue)}</span>
                      </div>
                      <div className="kv">
                        <span className="k">هزینه هر قطعه</span>
                        <span className="v num">{toman(m.costPerBird)}</span>
                      </div>
                      <div className="kv">
                        <span className="k">بهای تمام‌شده هر کیلو زنده</span>
                        <span className="v num">{m.costPerKgLive ? toman(m.costPerKgLive) : "—"}</span>
                      </div>
                      <div className="kv">
                        <span className="k">سود پیش‌بینی پایان دوره</span>
                        <span className={`v num ${m.projection.projectedProfit >= 0 ? "pos" : "neg"}`}>
                          {toman(m.projection.projectedProfit)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="card" style={{ boxShadow: "none", background: "var(--surface-2)" }}>
                  <div className="card-head" style={{ background: "transparent" }}>
                    <div className="card-title">
                      <Wheat size={15} style={{ color: "var(--amber)" }} />
                      خوراک و آب
                    </div>
                  </div>
                  <div className="card-body" style={{ paddingTop: 10 }}>
                    <div className="kv-list">
                      <div className="kv">
                        <span className="k">دان مصرفی تجمعی</span>
                        <span className="v num">{num(m.totalFeedKg)} کیلوگرم</span>
                      </div>
                      <div className="kv">
                        <span className="k">دان خریداری‌شده</span>
                        <span className="v num">{num(m.purchasedFeedKg)} کیلوگرم</span>
                      </div>
                      <div className="kv">
                        <span className="k">موجودی انبار</span>
                        <span className={`v num ${m.feedDaysLeft < 2 ? "neg" : ""}`}>
                          {num(m.feedStockKg)} کیلوگرم ({num(m.feedDaysLeft, 1)} روز)
                        </span>
                      </div>
                      <div className="kv">
                        <span className="k">سرانه مصرف دان روزانه</span>
                        <span className="v num">{gram(m.avgDailyFeedG)}</span>
                      </div>
                      <div className="kv">
                        <span className="k">نسبت آب به دان</span>
                        <span className="v num">{m.totalFeedKg ? num(m.totalWaterL / m.totalFeedKg, 2) : "—"}</span>
                      </div>
                      <div className="kv">
                        <span className="k">دمای آخرین ثبت</span>
                        <span className="v num">{lastLog?.temp_c != null ? `${num(lastLog.temp_c, 1)} درجه` : "—"}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-2">
                <div>
                  <h3 style={{ marginBottom: 10 }}>ترکیب هزینه‌ها</h3>
                  {m.costBreakdown.length ? (
                    <DonutChart
                      slices={m.costBreakdown.slice(0, 6).map((c) => ({ key: c.key, label: c.label, value: c.amount, color: c.color }))}
                      centerLabel="کل هزینه"
                      centerValue={compactToman(m.totalCost).replace(" تومان", "")}
                      size={150}
                      format="money"
                    />
                  ) : (
                    <p className="small muted">هنوز هزینه‌ای ثبت نشده است.</p>
                  )}
                </div>
                <div>
                  <div className="row-between mb-14">
                    <h3>آخرین ثبت‌های روزانه</h3>
                    <Link href={`/cycles/${cycleId}?tab=daily`} className="tiny" style={{ color: "var(--brand)" }}>
                      همه ثبت‌ها
                    </Link>
                  </div>
                  {sortedLogs.length ? (
                    <div className="table-wrap">
                      <table className="data">
                        <thead>
                          <tr>
                            <th>تاریخ</th>
                            <th>روز</th>
                            <th>تلفات</th>
                            <th>دان (kg)</th>
                            <th>وزن (g)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortedLogs.slice(0, 5).map((l) => (
                            <tr key={l.id}>
                              <td className="num">{formatJalali(l.date)}</td>
                              <td className="num">{num(logs.findIndex((x) => x.id === l.id) + 1)}</td>
                              <td className="num">{num(l.mortality)}</td>
                              <td className="num">{num(l.feed_kg, 1)}</td>
                              <td className="num">{l.avg_weight_g ? num(l.avg_weight_g) : "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="small muted">هنوز ثبت روزانه‌ای وجود ندارد.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {tab === "daily" && (
            <div className="grid" style={{ gap: 16 }}>
              <DailyLogForm
                cycleId={cycle.id}
                ageDays={m.ageDays}
                liveBirds={m.liveBirds}
                suggestedFeedKg={suggestedFeedKg}
                suggestedWaterL={suggestedWaterL}
                currentPhase={currentFeedName}
              />
              <div className="grid grid-2">
                <div>
                  <h3 style={{ marginBottom: 10 }}>تلفات روزانه</h3>
                  <TrendChart series={mortalitySeries} format="int" xTitle="سن (روز)" height={220} />
                </div>
                <div>
                  <h3 style={{ marginBottom: 10 }}>مصرف آب روزانه</h3>
                  <TrendChart series={waterSeries} format="int" xTitle="سن (روز)" height={220} />
                </div>
              </div>

              <div className="card" style={{ boxShadow: "none" }}>
                <div className="card-head">
                  <div className="card-title">
                    <CalendarDays size={15} style={{ color: "var(--brand)" }} />
                    تاریخچه ثبت روزانه
                  </div>
                  <span className="hint">{num(logs.length)} روز ثبت شده</span>
                </div>
                <div className="table-wrap" style={{ maxHeight: 520, overflowY: "auto" }}>
                  <table className="data">
                    <thead>
                      <tr>
                        <th>تاریخ</th>
                        <th>تلفات</th>
                        <th>حذف</th>
                        <th>دان (kg)</th>
                        <th>آب (L)</th>
                        <th>دما</th>
                        <th>وزن (g)</th>
                        <th>یادداشت</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedLogs.map((l) => (
                        <tr key={l.id}>
                          <td className="num" style={{ whiteSpace: "nowrap" }}>
                            {formatJalali(l.date)}
                          </td>
                          <td className={`num ${l.mortality > cycle.initial_count * 0.0012 ? "neg" : ""}`}>
                            {num(l.mortality)}
                          </td>
                          <td className="num">{num(l.culls)}</td>
                          <td className="num">{num(l.feed_kg, 1)}</td>
                          <td className="num">{num(l.water_l)}</td>
                          <td className="num">{l.temp_c != null ? num(l.temp_c, 1) : "—"}</td>
                          <td className="num">{l.avg_weight_g != null ? num(l.avg_weight_g) : "—"}</td>
                          <td className="small muted" style={{ maxWidth: 220 }}>
                            {l.notes ?? "—"}
                          </td>
                          <td>
                            <DeleteRecord kind="log" id={l.id} />
                          </td>
                        </tr>
                      ))}
                      {sortedLogs.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="center muted small" style={{ padding: 24 }}>
                            هنوز آماری ثبت نشده است.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {tab === "growth" && (
            <div className="grid" style={{ gap: 18 }}>
              <TrendChart series={growthSeries} format="int" xTitle="سن (روز)" height={300} />

              <div className="grid grid-3">
                <div className="card card-pad" style={{ boxShadow: "none", background: "var(--surface-2)" }}>
                  <div className="tiny muted">وزن فعلی / استاندارد</div>
                  <div className="bold num" style={{ fontSize: 17 }}>
                    {num(m.currentWeightG)} / {num(m.stdWeightG)} گرم
                  </div>
                  <div className={`badge mt-8 ${m.weightVsStdPct >= 0 ? "badge-green" : "badge-amber"}`}>
                    {signedPct(m.weightVsStdPct)}
                  </div>
                </div>
                <div className="card card-pad" style={{ boxShadow: "none", background: "var(--surface-2)" }}>
                  <div className="tiny muted">رشد روزانه</div>
                  <div className="bold num" style={{ fontSize: 17 }}>
                    {gram(m.dailyGainG)}
                  </div>
                  <div className="tiny muted mt-8">
                    استاندارد امروز: {gram(Math.round((standardAt(m.ageDays).weightG - standardAt(Math.max(1, m.ageDays - 1)).weightG)))}
                  </div>
                </div>
                <div className="card card-pad" style={{ boxShadow: "none", background: "var(--surface-2)" }}>
                  <div className="tiny muted">ضریب تبدیل / استاندارد گله</div>
                  <div className="bold num" style={{ fontSize: 17 }}>
                    {m.fcr ? num(m.fcr, 2) : "—"} / {num(m.stdFcr, 2)}
                  </div>
                  <div className={`badge mt-8 ${!m.fcr || m.fcr <= m.stdFcr * 1.05 ? "badge-green" : "badge-amber"}`}>
                    {m.fcr ? (m.fcr <= m.stdFcr ? "بهتر از استاندارد" : "بالاتر از استاندارد") : "داده ناکافی"}
                  </div>
                </div>
              </div>

              <div className="grid grid-1-2">
                <div className="card" style={{ boxShadow: "none" }}>
                  <div className="card-head">
                    <div className="card-title">جدول استاندارد رشد</div>
                    <span className="hint">نژاد راس ۳۰۸</span>
                  </div>
                  <div className="table-wrap">
                    <table className="data">
                      <thead>
                        <tr>
                          <th>سن</th>
                          <th>وزن</th>
                          <th>دان تجمعی</th>
                          <th>FCR</th>
                        </tr>
                      </thead>
                      <tbody>
                        {STANDARD_ANCHORS.map((s) => (
                          <tr key={s.day} style={s.day === m.ageDays ? { background: "var(--brand-soft)" } : undefined}>
                            <td className="num">{num(s.day)} روز</td>
                            <td className="num">{num(s.weightG)}g</td>
                            <td className="num">{num(s.cumFeedG / 1000, 2)}kg</td>
                            <td className="num">{num(s.cumFeedG / s.weightG, 2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="card" style={{ boxShadow: "none" }}>
                  <div className="card-head">
                    <div className="card-title">نقاط وزن‌کشی ثبت‌شده</div>
                    <span className="hint">مقایسه با استاندارد همان روز</span>
                  </div>
                  <div className="table-wrap" style={{ maxHeight: 330, overflowY: "auto" }}>
                    <table className="data">
                      <thead>
                        <tr>
                          <th>تاریخ</th>
                          <th>سن</th>
                          <th>وزن ثبت‌شده</th>
                          <th>استاندارد</th>
                          <th>اختلاف</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedLogs
                          .filter((l) => l.avg_weight_g)
                          .map((l) => {
                            const day = Math.max(1, logs.findIndex((x) => x.id === l.id) + 1);
                            const std = standardAt(day).weightG;
                            const diff = ((l.avg_weight_g! - std) / std) * 100;
                            return (
                              <tr key={l.id}>
                                <td className="num">{formatJalali(l.date)}</td>
                                <td className="num">{num(day)}</td>
                                <td className="num">{num(l.avg_weight_g!)}g</td>
                                <td className="num">{num(std)}g</td>
                                <td className={`num ${diff >= 0 ? "pos" : "neg"}`}>{signedPct(diff)}</td>
                              </tr>
                            );
                          })}
                        {sortedLogs.filter((l) => l.avg_weight_g).length === 0 ? (
                          <tr>
                            <td colSpan={5} className="center muted small" style={{ padding: 20 }}>
                              وزن‌کشی ثبت نشده است. با ثبت وزن نمونه، تحلیل رشد دقیق‌تر می‌شود.
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === "feed" && (
            <div className="grid" style={{ gap: 18 }}>
              <div className="grid grid-3">
                <div className="card card-pad" style={{ boxShadow: "none", background: "var(--surface-2)" }}>
                  <div className="tiny muted">دان مصرفی تجمعی</div>
                  <div className="bold num" style={{ fontSize: 17 }}>{num(m.totalFeedKg)} کیلوگرم</div>
                  <div className="tiny muted mt-8">
                    استاندارد تا امروز: {num((m.stdCumFeedG * cycle.initial_count) / 1000)} کیلوگرم
                  </div>
                </div>
                <div className="card card-pad" style={{ boxShadow: "none", background: "var(--surface-2)" }}>
                  <div className="tiny muted">موجودی انبار</div>
                  <div className={`bold num ${m.feedDaysLeft < 2 ? "neg" : ""}`} style={{ fontSize: 17 }}>
                    {num(m.feedStockKg)} کیلوگرم
                  </div>
                  <div className="tiny muted mt-8">{num(m.feedDaysLeft, 1)} روز کفایت</div>
                </div>
                <div className="card card-pad" style={{ boxShadow: "none", background: "var(--surface-2)" }}>
                  <div className="tiny muted">هزینه دان تا امروز</div>
                  <div className="bold num" style={{ fontSize: 17 }}>
                    {compactToman(costs.filter((c) => c.category === "feed").reduce((s, c) => s + c.amount, 0))}
                  </div>
                  <div className="tiny muted mt-8">{pct(m.feedCostShare)} از کل هزینه</div>
                </div>
              </div>

              <TrendChart series={feedSeries} format="int" xTitle="سن (روز)" height={280} />

              <div className="grid grid-2">
                <div>
                  <h3 style={{ marginBottom: 10 }}>مصرف آب روزانه</h3>
                  <TrendChart series={waterSeries} format="int" xTitle="سن (روز)" height={220} />
                </div>
                <div className="card" style={{ boxShadow: "none" }}>
                  <div className="card-head">
                    <div className="card-title">
                      <PackageOpen size={15} style={{ color: "var(--amber)" }} />
                      خریدهای دان
                    </div>
                  </div>
                  <div className="table-wrap" style={{ maxHeight: 260, overflowY: "auto" }}>
                    <table className="data">
                      <thead>
                        <tr>
                          <th>تاریخ</th>
                          <th>شرح</th>
                          <th>مقدار</th>
                          <th>مبلغ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedCosts
                          .filter((c) => c.category === "feed")
                          .map((c) => (
                            <tr key={c.id}>
                              <td className="num">{formatJalali(c.date)}</td>
                              <td className="small">{c.description}</td>
                              <td className="num">{c.quantity ? `${num(c.quantity)} kg` : "—"}</td>
                              <td className="num">{compactToman(c.amount)}</td>
                            </tr>
                          ))}
                        {sortedCosts.filter((c) => c.category === "feed").length === 0 ? (
                          <tr>
                            <td colSpan={4} className="center muted small" style={{ padding: 18 }}>
                              خرید دانی ثبت نشده است.
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="form-msg success" style={{ lineHeight: 2 }}>
                <b>تحلیل خوراک:</b> مصرف دان تا امروز {m.feedVsStdPct >= 0 ? "بالاتر" : "پایین‌تر"} از استاندارد به میزان{" "}
                {pct(Math.abs(m.feedVsStdPct))} است. ضریب تبدیل فعلی {m.fcr ? num(m.fcr, 2) : "—"} در برابر استاندارد{" "}
                {num(m.stdFcr, 2)} قرار دارد. سرانه مصرف روزانه هر پرنده {gram(m.avgDailyFeedG)} است.
              </div>
            </div>
          )}

          {tab === "costs" && (
            <div className="grid" style={{ gap: 18 }}>
              <div className="grid grid-1-2" style={{ alignItems: "start" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div className="card card-pad" style={{ boxShadow: "none", background: "var(--surface-2)" }}>
                    <div className="tiny muted">هزینه مصرف‌شده دوره</div>
                    <div className="bold num" style={{ fontSize: 20 }}>{toman(m.totalCost)}</div>
                    <div className="kv-list mt-14">
                      <div className="kv">
                        <span className="k">خریدهای ثبت‌شده (نقدی)</span>
                        <span className="v num">{toman(m.cashCost)}</span>
                      </div>
                      <div className="kv">
                        <span className="k">ارزش موجودی دان انبار</span>
                        <span className="v num">{toman(m.inventoryValue)}</span>
                      </div>
                      <div className="kv">
                        <span className="k">هزینه هر قطعه</span>
                        <span className="v num">{toman(m.costPerBird)}</span>
                      </div>
                      <div className="kv">
                        <span className="k">بهای هر کیلوگرم زنده</span>
                        <span className="v num">{m.costPerKgLive ? toman(m.costPerKgLive) : "—"}</span>
                      </div>
                      <div className="kv">
                        <span className="k">قیمت بازار</span>
                        <span className="v num">{toman(settings.market_price)}</span>
                      </div>
                      <div className="kv">
                        <span className="k">حاشیه هر کیلوگرم</span>
                        <span className={`v num ${m.costPerKgLive && settings.market_price > m.costPerKgLive ? "pos" : "neg"}`}>
                          {m.costPerKgLive ? toman(settings.market_price - m.costPerKgLive) : "—"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <BarList
                    rows={m.costBreakdown.map((c) => ({ key: c.key, label: c.label, value: c.amount, color: c.color }))}
                    format={(n) => compactToman(n).replace(" تومان", "")}
                    showShare={false}
                  />
                </div>
                <CostForm cycleId={cycle.id} feedPrice={settings.feed_price} />
              </div>

              <div className="card" style={{ boxShadow: "none" }}>
                <div className="card-head">
                  <div className="card-title">
                    <Receipt size={15} style={{ color: "var(--brand)" }} />
                    فهرست هزینه‌ها
                  </div>
                  <span className="hint">{num(sortedCosts.length)} ردیف</span>
                </div>
                <div className="table-wrap" style={{ maxHeight: 460, overflowY: "auto" }}>
                  <table className="data">
                    <thead>
                      <tr>
                        <th>تاریخ</th>
                        <th>دسته</th>
                        <th>شرح</th>
                        <th>مقدار</th>
                        <th>تأمین‌کننده</th>
                        <th>مبلغ</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedCosts.map((c) => (
                        <tr key={c.id}>
                          <td className="num" style={{ whiteSpace: "nowrap" }}>
                            {formatJalali(c.date)}
                          </td>
                          <td>
                            <span className="badge" style={{ background: `${categoryColor(c.category)}18`, color: categoryColor(c.category), borderColor: `${categoryColor(c.category)}30` }}>
                              {categoryLabel(c.category)}
                            </span>
                          </td>
                          <td className="small">{c.description}</td>
                          <td className="num small">
                            {c.quantity ? `${num(c.quantity)} ${c.unit ?? ""}` : "—"}
                          </td>
                          <td className="small muted">{c.vendor ?? "—"}</td>
                          <td className="num bold">{toman(c.amount)}</td>
                          <td>
                            <DeleteRecord kind="cost" id={c.id} />
                          </td>
                        </tr>
                      ))}
                      {sortedCosts.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="center muted small" style={{ padding: 24 }}>
                            هنوز هزینه‌ای ثبت نشده است.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {tab === "sales" && (
            <div className="grid" style={{ gap: 18 }}>
              <div className="grid grid-3">
                <div className="card card-pad" style={{ boxShadow: "none", background: "var(--surface-2)" }}>
                  <div className="tiny muted">درآمد کل فروش</div>
                  <div className="bold num pos" style={{ fontSize: 18 }}>{toman(m.revenue)}</div>
                </div>
                <div className="card card-pad" style={{ boxShadow: "none", background: "var(--surface-2)" }}>
                  <div className="tiny muted">وزن فروش‌رفته</div>
                  <div className="bold num" style={{ fontSize: 18 }}>{num(m.soldWeightKg)} کیلوگرم</div>
                  <div className="tiny muted mt-8">{num(m.soldBirds)} قطعه از {num(cycle.initial_count)}</div>
                </div>
                <div className="card card-pad" style={{ boxShadow: "none", background: "var(--surface-2)" }}>
                  <div className="tiny muted">میانگین قیمت فروش</div>
                  <div className="bold num" style={{ fontSize: 18 }}>
                    {m.avgSalePricePerKg ? toman(m.avgSalePricePerKg) : "—"}
                  </div>
                  <div className="tiny muted mt-8">قیمت بازار: {num(settings.market_price)}</div>
                </div>
              </div>

              <SaleForm
                cycleId={cycle.id}
                marketPrice={settings.market_price}
                liveBirds={m.liveBirds}
                currentWeightG={m.currentWeightG}
              />

              <div className="card" style={{ boxShadow: "none" }}>
                <div className="card-head">
                  <div className="card-title">
                    <CircleDollarSign size={15} style={{ color: "var(--brand)" }} />
                    محموله‌های فروش
                  </div>
                  <span className="hint">{num(sortedSales.length)} محموله</span>
                </div>
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>تاریخ</th>
                        <th>تعداد</th>
                        <th>وزن (kg)</th>
                        <th>میانگین وزن</th>
                        <th>قیمت هر کیلو</th>
                        <th>کسورات</th>
                        <th>درآمد خالص</th>
                        <th>خریدار</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedSales.map((s) => {
                        const net = s.weight_kg * s.price_per_kg - s.deductions;
                        return (
                          <tr key={s.id}>
                            <td className="num">{formatJalali(s.date)}</td>
                            <td className="num">{num(s.count)}</td>
                            <td className="num">{num(s.weight_kg)}</td>
                            <td className="num">{s.count ? num((s.weight_kg * 1000) / s.count) : "—"}g</td>
                            <td className="num">{num(s.price_per_kg)}</td>
                            <td className="num">{num(s.deductions)}</td>
                            <td className="num bold pos">{toman(net)}</td>
                            <td className="small muted">{s.buyer ?? "—"}</td>
                            <td>
                              <DeleteRecord kind="sale" id={s.id} />
                            </td>
                          </tr>
                        );
                      })}
                      {sortedSales.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="center muted small" style={{ padding: 24 }}>
                            هنوز فروشی ثبت نشده است. با رسیدن گله به وزن هدف، فروش را ثبت کنید.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>

              {cycle.status === "active" ? (
                <div className="form-msg success" style={{ lineHeight: 2 }}>
                  <b>ارزیابی فروش:</b> ارزش گله زنده {compactToman(m.estimatedLiveValue)} و بهای تمام‌شده تا امروز{" "}
                  {compactToman(m.totalCost)} است. برای تحلیل دقیق «فروش امروز یا صبر تا سن هدف»، از مشاور هوشمند استفاده
                  کنید.
                </div>
              ) : null}
            </div>
          )}

          {tab === "settings" && (
            <div className="grid grid-1-2" style={{ alignItems: "start" }}>
              <EditCycleForm cycle={cycle} />
              <div className="card" style={{ boxShadow: "none", background: "var(--surface-2)" }}>
                <div className="card-head" style={{ background: "transparent" }}>
                  <div className="card-title">شناسنامه دوره</div>
                </div>
                <div className="card-body" style={{ paddingTop: 8 }}>
                  <div className="kv-list">
                    <div className="kv">
                      <span className="k">تعداد جوجه اولیه</span>
                      <span className="v num">{num(cycle.initial_count)} قطعه</span>
                    </div>
                    <div className="kv">
                      <span className="k">قیمت جوجه</span>
                      <span className="v num">{toman(cycle.chick_price)}</span>
                    </div>
                    <div className="kv">
                      <span className="k">تاریخ ایجاد رکورد</span>
                      <span className="v num">{formatJalali(cycle.created_at.slice(0, 10))}</span>
                    </div>
                    <div className="kv">
                      <span className="k">وضعیت</span>
                      <span className="v">{cycle.status === "active" ? "در جریان" : "بسته‌شده"}</span>
                    </div>
                    <div className="kv">
                      <span className="k">سن فعلی</span>
                      <span className="v num">{num(m.ageDays)} روز</span>
                    </div>
                  </div>
                  <p className="tiny muted mt-14" style={{ lineHeight: 1.9 }}>
                    برای تغییر تعداد جوجه یا قیمت خرید، بهتر است رکورد هزینه اصلاحی ثبت کنید تا سابقه مالی دوره حفظ شود.
                  </p>
                </div>
              </div>
            </div>
          )}

          {tab === "insights" && (
            <div className="grid" style={{ gap: 18 }}>
              <div className="row-between wrap">
                <div>
                  <h3>تحلیل و توصیه‌های هوشمند</h3>
                  <p className="tiny muted mt-8">
                    بر پایه استاندارد رشد، الگوی تلفات، مصرف دان و آب، هزینه‌های واقعی و قیمت بازار.
                  </p>
                </div>
                <Link
                  href={`/assistant?q=${encodeURIComponent(`برای ${cycle.name} چه اقدامی پیشنهاد می‌کنی؟`)}`}
                  className="btn btn-primary btn-sm"
                >
                  <Sparkles size={14} />
                  گفتگو با مشاور
                </Link>
              </div>

              <div className="grid grid-2">
                <div>
                  {m.alerts.map((a, i) => (
                    <InsightRow key={i} a={a} />
                  ))}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div className="card" style={{ boxShadow: "none" }}>
                    <div className="card-head">
                      <div className="card-title">
                        <TrendingUp size={15} style={{ color: "var(--brand)" }} />
                        پیش‌بینی پایان دوره
                      </div>
                      <span className="hint">سن هدف {num(m.projection.targetAge)} روز</span>
                    </div>
                    <div className="card-body" style={{ paddingTop: 10 }}>
                      <div className="kv-list">
                        <div className="kv">
                          <span className="k">روزهای باقی‌مانده</span>
                          <span className="v num">{num(m.projection.daysRemaining)} روز</span>
                        </div>
                        <div className="kv">
                          <span className="k">وزن پیش‌بینی‌شده</span>
                          <span className="v num">{num(m.projection.projectedWeightG)} گرم</span>
                        </div>
                        <div className="kv">
                          <span className="k">دان پیش‌بینی‌شده</span>
                          <span className="v num">{num(m.projection.projectedFeedKg)} کیلوگرم</span>
                        </div>
                        <div className="kv">
                          <span className="k">ضریب تبدیل پیش‌بینی</span>
                          <span className="v num">{num(m.projection.projectedFcr, 2)}</span>
                        </div>
                        <div className="kv">
                          <span className="k">هزینه نهایی برآوردی</span>
                          <span className="v num">{toman(m.projection.projectedCost)}</span>
                        </div>
                        <div className="kv">
                          <span className="k">درآمد نهایی برآوردی</span>
                          <span className="v num">{toman(m.projection.projectedRevenue)}</span>
                        </div>
                        <div className="kv">
                          <span className="k">سود پیش‌بینی‌شده</span>
                          <span className={`v num ${m.projection.projectedProfit >= 0 ? "pos" : "neg"}`}>
                            {toman(m.projection.projectedProfit)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="card card-pad" style={{ background: "linear-gradient(135deg,#0f3b30,#155241)", color: "#e9f5ee", border: "none" }}>
                    <div className="row" style={{ gap: 8, marginBottom: 6 }}>
                      <HeartPulse size={16} />
                      <b style={{ fontSize: 13 }}>خلاصه تصمیم‌گیری</b>
                    </div>
                    <p style={{ fontSize: 12, lineHeight: 2, color: "#c5ddd0" }}>
                      {m.projection.projectedProfit > 0
                        ? `با قیمت فعلی بازار، ادامه دوره تا روز ${num(m.projection.targetAge)} سودآور است. مهم‌ترین اهرم‌های بهبود: کنترل تلفات (${pct(m.mortalityPct)}) و کاهش ضریب تبدیل (${m.fcr ? num(m.fcr, 2) : "—"}).`
                        : "با قیمت فعلی بازار، دوره در وضعیت زیان‌دهی قرار دارد. کاهش هزینه خوراک، بازبینی زمان فروش و کنترل تلفات را فوری بررسی کنید."}
                    </p>
                    <div className="row wrap" style={{ gap: 6, marginTop: 10 }}>
                      <span className="badge" style={{ background: "rgba(255,255,255,.12)", color: "#dff3e6" }}>
                        بازار: {num(settings.market_price)}
                      </span>
                      <span className="badge" style={{ background: "rgba(255,255,255,.12)", color: "#dff3e6" }}>
                        دان: {num(settings.feed_price)}
                      </span>
                      <span className="badge" style={{ background: "rgba(255,255,255,.12)", color: "#dff3e6" }}>
                        سربه‌سر هر کیلو: {m.breakevenPerKg ? num(m.breakevenPerKg) : "—"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="card" style={{ boxShadow: "none" }}>
                <div className="card-head">
                  <div className="card-title">
                    <Sparkles size={15} style={{ color: "var(--amber)" }} />
                    سؤال‌های پیشنهادی برای این دوره
                  </div>
                </div>
                <div className="card-body">
                  <div className="row wrap" style={{ gap: 8 }}>
                    {[
                      "الان بفروشم یا صبر کنم؟",
                      "چقدر دان سفارش بدهم؟",
                      "علت افزایش تلفات چیست؟",
                      "پیش‌بینی پایان این دوره",
                      "کدام هزینه‌ها را کاهش بدهم؟",
                      `وضعیت ${cycle.name} چطور است؟`,
                    ].map((q) => (
                      <Link key={q} href={`/assistant?q=${encodeURIComponent(q)}`} className="chip">
                        {q}
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="row wrap mt-20" style={{ gap: 10, justifyContent: "space-between" }}>
        <span className="tiny muted">
          آخرین ثبت: {lastLog ? `${formatJalali(lastLog.date)}` : "بدون ثبت"} · داده‌ها روی همین دستگاه ذخیره می‌شوند
        </span>
        <div className="row" style={{ gap: 8 }}>
          <Link href="/reports" className="btn btn-ghost btn-sm">
            گزارش عملکرد دوره
          </Link>
          <Link href={`/cycles/${cycleId}?tab=costs`} className="btn btn-outline btn-sm">
            <Wallet size={14} />
            مدیریت هزینه‌ها
          </Link>
        </div>
      </div>
    </div>
  );
}
