import Link from "next/link";
import {
  Bird,
  Scale,
  TrendingUp,
  HeartPulse,
  Sparkles,
  ArrowLeft,
  Wheat,
  Wallet,
  CalendarClock,
  Droplets,
  Plus,
  Egg,
  ChartNoAxesColumnIncreasing,
} from "lucide-react";
import { getSettings } from "@/lib/db";
import { AlertTriangle, CircleCheck, Info } from "lucide-react";
import { farmOverview, loadCycleMetrics } from "@/lib/metrics";
import { compactToman, num, pct, signedPct } from "@/lib/format";
import { todayJalaliLong, formatJalali } from "@/lib/jalali";
import StatCard from "@/components/ui/StatCard";
import TrendChart from "@/components/charts/TrendChart";
import DonutChart from "@/components/charts/DonutChart";
import BarList from "@/components/ui/BarList";

export const dynamic = "force-dynamic";

const sevIcon: Record<string, React.ReactNode> = {
  critical: <AlertTriangle size={14} />,
  warning: <AlertTriangle size={14} />,
  info: <Info size={14} />,
  good: <CircleCheck size={14} />,
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ cycle?: string }>;
}) {
  const sp = await searchParams;
  const settings = getSettings();
  const o = farmOverview(settings);
  const selectedId = Number(sp.cycle) || o.activeMetrics[0]?.cycle.id || o.cycles[0]?.id;
  const selected = selectedId ? loadCycleMetrics(selectedId, settings) : null;

  if (!o.cycles.length) {
    return (
      <div className="page-enter">
        <div className="page-head">
          <div>
            <h1>خوش آمدید به مرغ‌یار</h1>
            <p className="desc">
              چرخه کامل پرورش مرغ گوشتی را از جوجه‌ریزی تا فروش مدیریت کنید؛ هزینه‌ها را شفاف ببینید و از مشاور هوشمند
              برای تصمیم‌گیری کمک بگیرید.
            </p>
          </div>
        </div>
        <div className="card" style={{ padding: "46px 24px", textAlign: "center" }}>
          <div className="empty-icon" style={{ width: 64, height: 64 }}>
            <Egg size={28} />
          </div>
          <h2 style={{ marginBottom: 6 }}>هنوز دوره‌ای ثبت نشده است</h2>
          <p className="muted small" style={{ maxWidth: 480, margin: "0 auto 18px" }}>
            با ثبت تاریخ جوجه‌ریزی، تعداد جوجه و قیمت آن، سامانه محاسبات رشد، تلفات، هزینه، ضریب تبدیل و پیش‌بینی سود را
            آغاز می‌کند.
          </p>
          <Link href="/cycles/new" className="btn btn-primary">
            <Plus size={15} />
            ثبت اولین دوره پرورش
          </Link>
        </div>
      </div>
    );
  }

  const cycleOptions = o.cycles;
  const growthSeries = selected
    ? [
        {
          key: "std",
          name: "استاندارد نژاد",
          color: "#a3afa9",
          dashed: true,
          points: selected.dailySeries.map((d) => ({ y: d.stdWeightG, label: `${d.day}` })),
        },
        {
          key: "actual",
          name: "وزن واقعی گله",
          color: "#1e8a5f",
          area: true,
          points: selected.dailySeries.map((d) => ({
            y: d.avgWeightG ?? NaN,
            label: `${d.day}`,
          })),
        },
      ]
    : [];

  const feedSeries = selected
    ? [
        {
          key: "stdFeed",
          name: "مصرف استاندارد",
          color: "#c9cfc9",
          dashed: true,
          points: selected.dailySeries.map((d) => ({ y: d.stdDailyFeedKg, label: `${d.day}` })),
        },
        {
          key: "feed",
          name: "دان مصرفی واقعی",
          color: "#cf8a06",
          area: true,
          points: selected.dailySeries.map((d) => ({ y: d.feedKg, label: `${d.day}` })),
        },
      ]
    : [];

  const topAlerts = o.activeMetrics
    .flatMap((m) => m.alerts.map((a) => ({ ...a, cycleName: m.cycle.name, cycleId: m.cycle.id })))
    .filter((a) => a.severity !== "good")
    .slice(0, 3);

  const accuracy = selected && selected.fcr && selected.stdFcr ? (selected.stdFcr / selected.fcr) * 100 : null;

  return (
    <div className="page-enter">
      <div className="page-head">
        <div>
          <h1>
            داشبورد مزرعه <span style={{ fontSize: 14, color: "var(--muted)", fontWeight: 500 }}>— {todayJalaliLong()}</span>
          </h1>
          <p className="desc">
            تصویر لحظه‌ای از وضعیت گله‌ها، هزینه‌ها و پیش‌بینی سود. همه محاسبات بر پایه ثبت‌های روزانه و استاندارد رشد
            نژاد به‌روزرسانی می‌شود.
          </p>
        </div>
        <div className="row wrap" style={{ gap: 8 }}>
          <Link href="/cycles" className="btn btn-outline btn-sm">
            همه دوره‌ها
            <ArrowLeft size={13} />
          </Link>
          <Link href="/assistant" className="btn btn-primary btn-sm">
            <Sparkles size={14} />
            تحلیل هوشمند
          </Link>
        </div>
      </div>

      <div className="grid grid-4">
        <StatCard
          label="قطعه زنده در سالن‌ها"
          value={num(o.liveBirds)}
          unit="قطعه"
          icon={<Bird size={17} />}
          hint={`در ${num(o.activeMetrics.length)} دوره فعال`}
          tone="green"
        />
        <StatCard
          label="توده زنده گله‌ها"
          value={num(o.liveBiomassKg)}
          unit="کیلوگرم"
          icon={<Scale size={17} />}
          hint={`ارزش برآوردی: ${compactToman(o.liveBiomassKg * settings.market_price)}`}
          tone="blue"
        />
        <StatCard
          label="سود پیش‌بینی‌شده پایان دوره"
          value={compactToman(o.activeProjectedProfit).replace(" تومان", "")}
          unit="تومان"
          icon={<TrendingUp size={17} />}
          hint={`هزینه مصرف‌شده دوره‌ها: ${compactToman(o.activeCost)}`}
          tone={o.activeProjectedProfit >= 0 ? "green" : "red"}
          trend={{
            value: o.activeMetrics[0]
              ? `${signedPct(
                  o.activeMetrics[0].projection.projectedRevenue
                    ? (o.activeMetrics[0].projection.projectedProfit / o.activeMetrics[0].projection.projectedRevenue) * 100
                    : 0,
                )} حاشیه`
              : "—",
            dir: o.activeProjectedProfit >= 0 ? "up" : "down",
          }}
        />
        <StatCard
          label="تلفات دوره‌های فعال"
          value={pct(o.mortalityPctWeighted)}
          icon={<HeartPulse size={17} />}
          hint="نسبت به کل جوجه‌ریزی"
          tone={o.mortalityPctWeighted > 4 ? "red" : "amber"}
        />
      </div>

      <div className="grid grid-2-1 mt-20">
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">
                <ChartNoAxesColumnIncreasing size={16} style={{ color: "var(--brand)" }} />
                روند رشد گله
              </div>
              <div className="hint" style={{ marginTop: 2 }}>
                مقایسه وزن واقعی با استاندارد نژاد (گرم) — محور افقی: سن به روز
              </div>
            </div>
            <div className="row wrap" style={{ gap: 5 }}>
              {cycleOptions.slice(0, 4).map((c) => (
                <Link
                  key={c.id}
                  href={`/?cycle=${c.id}`}
                  className="chip"
                  style={
                    c.id === selectedId
                      ? { background: "var(--brand)", color: "#fff", borderColor: "var(--brand)" }
                      : undefined
                  }
                >
                  {c.name.length > 22 ? c.name.slice(0, 22) + "…" : c.name}
                </Link>
              ))}
            </div>
          </div>
          <div className="card-body">
            {selected ? (
              <>
                <TrendChart series={growthSeries} format="grams" xTitle="سن (روز)" height={272} />
                <div className="row wrap" style={{ gap: 22, marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
                  <div>
                    <div className="tiny muted">وزن فعلی</div>
                    <div className="bold num">{num(selected.currentWeightG)} گرم</div>
                  </div>
                  <div>
                    <div className="tiny muted">اختلاف با استاندارد</div>
                    <div className={`bold num ${selected.weightVsStdPct >= 0 ? "pos" : "neg"}`}>
                      {signedPct(selected.weightVsStdPct)}
                    </div>
                  </div>
                  <div>
                    <div className="tiny muted">ضریب تبدیل</div>
                    <div className="bold num">
                      {selected.fcr ? num(selected.fcr, 2) : "—"}{" "}
                      <span className="tiny muted">/ استاندارد گله {num(selected.stdFcr, 2)}</span>
                    </div>
                  </div>
                  <div>
                    <div className="tiny muted">سن</div>
                    <div className="bold num">
                      {num(selected.ageDays)} از {num(selected.projection.targetAge)} روز
                    </div>
                  </div>
                  <Link href={`/cycles/${selected.cycle.id}`} className="btn btn-ghost btn-sm" style={{ marginInlineStart: "auto" }}>
                    جزئیات دوره
                    <ArrowLeft size={13} />
                  </Link>
                </div>
              </>
            ) : (
              <div className="empty-chart">دوره‌ای برای نمایش وجود ندارد</div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div className="card-title">
              <Sparkles size={16} style={{ color: "var(--amber)" }} />
              پیشنهادهای هوشمند
            </div>
            <Link href="/assistant" className="badge badge-green" style={{ cursor: "pointer" }}>
              مشاور
            </Link>
          </div>
          <div className="card-body" style={{ paddingTop: 14 }}>
            {topAlerts.length ? (
              topAlerts.map((a, i) => (
                <div key={i} className={`alert-item ${a.severity}`}>
                  <span className="a-icon">{sevIcon[a.severity]}</span>
                  <div style={{ minWidth: 0 }}>
                    <div className="alert-title">
                      {a.title}
                      <span className="badge badge-gray tiny" style={{ fontWeight: 500 }}>
                        {a.cycleName}
                      </span>
                    </div>
                    <div className="alert-text">{a.detail}</div>
                    <Link href={`/cycles/${a.cycleId}`} className="alert-link">
                      بررسی دوره
                      <ArrowLeft size={12} />
                    </Link>
                  </div>
                </div>
              ))
            ) : (
              <div className="alert-item good">
                <span className="a-icon">
                  <CircleCheck size={14} />
                </span>
                <div>
                  <div className="alert-title">همه شاخص‌ها در محدوده مطلوب</div>
                  <div className="alert-text">تلفات، رشد، ضریب تبدیل و موجودی دان در محدوده قابل قبول است.</div>
                </div>
              </div>
            )}

            <div className="divider" />
            <div className="row-between" style={{ fontSize: 11.5 }}>
              <span className="muted">دقت ضریب تبدیل گله منتخب</span>
              <span className="bold num">{accuracy ? `${num(accuracy, 0)}٪` : "—"}</span>
            </div>
            <div className="progress mt-8">
              <span style={{ width: `${Math.min(100, accuracy ?? 0)}%` }} />
            </div>
            <div className="tiny muted mt-8">
              هرچه FCR به استاندارد نزدیک‌تر باشد، هزینه هر کیلو گوشت کمتر می‌شود.
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-2-1 mt-20">
        <div>
          <div className="row-between mb-14">
            <h2>دوره‌های فعال</h2>
            <Link href="/cycles/new" className="btn btn-outline btn-sm">
              <Plus size={14} />
              دوره جدید
            </Link>
          </div>
          <div className="grid grid-2">
            {o.activeMetrics.map((m) => {
              const progress = Math.min(100, (m.ageDays / m.projection.targetAge) * 100);
              return (
                <div key={m.cycle.id} className="card cycle-card">
                  <div className="cycle-top">
                    <div>
                      <div className="cycle-name">
                        {m.cycle.name}
                        <span className="badge badge-green">
                          <span className="dot" />
                          فعال
                        </span>
                      </div>
                      <div className="cycle-meta">
                        {m.cycle.house || "بدون سالن"} · {m.cycle.breed} · جوجه‌ریزی {formatJalali(m.cycle.placement_date)}
                      </div>
                    </div>
                    <span className="badge badge-gray">{num(m.ageDays)} روزه</span>
                  </div>

                  <div>
                    <div className="progress-label">
                      <span>
                        پیشرفت دوره تا سن هدف ({num(m.projection.targetAge)} روز)
                      </span>
                      <span className="num">{num(progress, 0)}٪</span>
                    </div>
                    <div className="progress">
                      <span style={{ width: `${progress}%` }} />
                    </div>
                  </div>

                  <div className="cycle-stats">
                    <div className="cycle-stat">
                      <div className="k">قطعه زنده</div>
                      <div className="v num">{num(m.liveBirds)}</div>
                    </div>
                    <div className="cycle-stat">
                      <div className="k">وزن فعلی</div>
                      <div className="v num">{num(m.currentWeightG)} گرم</div>
                    </div>
                    <div className="cycle-stat">
                      <div className="k">تلفات</div>
                      <div className="v num">{pct(m.mortalityPct)}</div>
                    </div>
                  </div>

                  <div className="cycle-foot">
                    <div>
                      <div className="tiny muted">سود پیش‌بینی پایان دوره</div>
                      <div className={`bold num ${m.projection.projectedProfit >= 0 ? "pos" : "neg"}`} style={{ fontSize: 14 }}>
                        {compactToman(m.projection.projectedProfit)}
                      </div>
                    </div>
                    <Link href={`/cycles/${m.cycle.id}`} className="btn btn-outline btn-sm">
                      مدیریت دوره
                      <ArrowLeft size={13} />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="card mt-20">
            <div className="card-head">
              <div className="card-title">
                <Droplets size={16} style={{ color: "var(--blue)" }} />
                مصرف دان و آب — {selected?.cycle.name}
              </div>
              <span className="hint">مقایسه مصرف دان واقعی با استاندارد (کیلوگرم در روز)</span>
            </div>
            <div className="card-body">
              {selected ? (
                <TrendChart series={feedSeries} format="int" xTitle="سن (روز)" height={230} />
              ) : (
                <div className="empty-chart">داده‌ای موجود نیست</div>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card">
            <div className="card-head">
              <div className="card-title">
                <Wallet size={16} style={{ color: "var(--brand)" }} />
                ترکیب هزینه‌ها
              </div>
            </div>
            <div className="card-body">
              <DonutChart
                slices={o.costBreakdown.slice(0, 6).map((c) => ({ key: c.key, label: c.label, value: c.amount, color: c.color }))}
                centerLabel="کل هزینه"
                centerValue={compactToman(o.totalCostAll).replace(" تومان", "")}
                format="money"
              />
              <div className="divider" />
              <div className="kv-list">
                <div className="kv">
                  <span className="k">سهم دان از کل هزینه</span>
                  <span className="v num">
                    {o.totalCostAll ? pct((o.feedCostTotal / o.totalCostAll) * 100) : "—"}
                  </span>
                </div>
                <div className="kv">
                  <span className="k">هزینه دوره‌های فعال</span>
                  <span className="v num">{compactToman(o.activeCost)}</span>
                </div>
                <div className="kv">
                  <span className="k">سود محقق‌شده (دوره‌های بسته)</span>
                  <span className={`v num ${o.realizedProfit >= 0 ? "pos" : "neg"}`}>{compactToman(o.realizedProfit)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <div className="card-title">
                <Wheat size={16} style={{ color: "var(--amber)" }} />
                موجودی و نیاز دان
              </div>
            </div>
            <div className="card-body">
              <BarList
                rows={o.activeMetrics.map((m) => ({
                  key: String(m.cycle.id),
                  label: m.cycle.name,
                  value: Math.round(m.feedStockKg),
                  color: m.feedDaysLeft < 2 ? "#bb3a2b" : m.feedDaysLeft < 4 ? "#cf8a06" : "#1e8a5f",
                  hint: `${num(m.feedDaysLeft, 1)} روز`,
                }))}
                format={(n) => `${num(n)} کیلو`}
                showShare={false}
              />
              <div className="divider" />
              <div className="row-between">
                <span className="small muted">ارزش تقریبی موجودی انبار</span>
                <span className="bold num">
                  {compactToman(o.activeMetrics.reduce((s, m) => s + m.feedStockKg * settings.feed_price, 0))}
                </span>
              </div>
              <Link href="/assistant" className="btn btn-outline btn-sm btn-block mt-14">
                <Sparkles size={14} />
                محاسبه سفارش بهینه دان
              </Link>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <div className="card-title">
                <CalendarClock size={16} style={{ color: "var(--violet)" }} />
                نزدیک‌ترین فروش
              </div>
            </div>
            <div className="card-body" style={{ paddingTop: 10 }}>
              {o.activeMetrics
                .slice()
                .sort((a, b) => b.currentWeightG / b.targetWeightG - a.currentWeightG / a.targetWeightG)
                .slice(0, 2)
                .map((m) => {
                  const ratio = Math.min(100, (m.currentWeightG / m.targetWeightG) * 100);
                  return (
                    <div key={m.cycle.id} style={{ padding: "8px 0" }}>
                      <div className="row-between small">
                        <span className="bold">{m.cycle.name}</span>
                        <span className="num muted">
                          {num(m.currentWeightG)} / {num(m.targetWeightG)} گرم
                        </span>
                      </div>
                      <div className={`progress mt-8 ${ratio < 80 ? "amber" : ""}`}>
                        <span style={{ width: `${ratio}%` }} />
                      </div>
                      <div className="row-between tiny muted mt-8">
                        <span>{num(m.daysRemaining)} روز تا سن هدف</span>
                        <span>
                          ارزش زنده: <b className="num">{compactToman(m.estimatedLiveValue)}</b>
                        </span>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      </div>

      <div className="card mt-20 card-pad" style={{ background: "linear-gradient(115deg,#0f3b30,#134b3b 60%,#1a6049)", border: "none", color: "#eaf6ef" }}>
        <div className="row-between wrap" style={{ gap: 18 }}>
          <div className="row" style={{ gap: 14 }}>
            <span style={{ width: 44, height: 44, borderRadius: 13, background: "rgba(255,255,255,.12)", display: "grid", placeItems: "center" }}>
              <Sparkles size={20} />
            </span>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, color: "#fff" }}>تصمیم امروز را با داده بگیرید</div>
              <div style={{ fontSize: 12, color: "#b8d6c7", marginTop: 2 }}>
                مشاور هوشمند داده‌های همین مزرعه را تحلیل می‌کند: زمان فروش، سفارش دان، علت تلفات و پیش‌بینی سود.
              </div>
            </div>
          </div>
          <Link href="/assistant" className="btn" style={{ background: "#e9f7c9", color: "#0c3a2c", fontWeight: 700 }}>
            شروع گفتگو با مشاور
            <ArrowLeft size={14} />
          </Link>
        </div>
      </div>
    </div>
  );
}
