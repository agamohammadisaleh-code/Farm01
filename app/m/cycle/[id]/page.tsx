import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowRight,
  Bird,
  Scale,
  Gauge,
  TrendingUp,
  HeartPulse,
  Wheat,
  Sparkles,
  ClipboardPlus,
  Receipt,
  BadgeDollarSign,
  AlertTriangle,
  CircleCheck,
  Info,
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
} from "@/lib/metrics";
import { compactToman, num, pct, toman, signedPct } from "@/lib/format";
import { formatJalali, faDigits } from "@/lib/jalali";
import TrendChart from "@/components/charts/TrendChart";
import DonutChart from "@/components/charts/DonutChart";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "overview", label: "نمای کلی" },
  { key: "growth", label: "رشد" },
  { key: "cost", label: "هزینه" },
  { key: "sales", label: "فروش" },
  { key: "insights", label: "تحلیل" },
];

const sevIcon: Record<string, React.ReactNode> = {
  critical: <AlertTriangle size={14} />,
  warning: <AlertTriangle size={14} />,
  info: <Info size={14} />,
  good: <CircleCheck size={14} />,
};

export default async function MobileCyclePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const tab = sp.tab && TABS.some((t) => t.key === sp.tab) ? sp.tab : "overview";

  const settings = getSettings();
  const cycle = getCycle(Number(id));
  if (!cycle) notFound();

  const logs = getLogs(cycle.id);
  const costs = getCosts(cycle.id);
  const sales = getSales(cycle.id);
  const m = computeMetrics(cycle, logs, costs, sales, {
    marketPrice: settings.market_price,
    feedPrice: settings.feed_price,
  });

  const growthSeries = [
    {
      key: "std",
      name: "استاندارد",
      color: "#a3afa9",
      dashed: true,
      points: m.dailySeries.map((d) => ({ y: d.stdWeightG, label: `${d.day}` })),
    },
    {
      key: "actual",
      name: "وزن گله",
      color: "#1e8a5f",
      area: true,
      points: m.dailySeries.map((d) => ({ y: d.avgWeightG ?? NaN, label: `${d.day}` })),
    },
  ];

  const sortedLogs = [...logs].reverse();

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link href="/m/cycles" className="btn btn-ghost btn-sm" style={{ padding: 0 }}>
          <ArrowRight size={15} />
          دوره‌ها
        </Link>
        <span className={`badge ${cycle.status === "active" ? "badge-green" : "badge-gray"}`} style={{ fontSize: 10 }}>
          {cycle.status === "active" ? `روز ${num(m.ageDays)}` : "بسته‌شده"}
        </span>
      </div>

      <div>
        <h1 className="m-h1">{cycle.name}</h1>
        <div className="m-sub">
          {cycle.house} · {cycle.breed} · جوجه‌ریزی {formatJalali(cycle.placement_date)} · {num(cycle.initial_count)} قطعه
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div className="m-card" style={{ padding: "11px 12px" }}>
          <div style={{ fontSize: 10.5, color: "var(--muted)", display: "flex", gap: 4, alignItems: "center" }}>
            <Bird size={11} /> قطعه زنده
          </div>
          <div style={{ fontSize: 17, fontWeight: 800 }} className="num">
            {num(m.liveBirds)}
          </div>
          <div style={{ fontSize: 10, color: "var(--muted)" }}>تلفات {pct(m.mortalityPct)}</div>
        </div>
        <div className="m-card" style={{ padding: "11px 12px" }}>
          <div style={{ fontSize: 10.5, color: "var(--muted)", display: "flex", gap: 4, alignItems: "center" }}>
            <Scale size={11} /> وزن فعلی
          </div>
          <div style={{ fontSize: 17, fontWeight: 800 }} className="num">
            {num(m.currentWeightG)}g
          </div>
          <div style={{ fontSize: 10 }} className={m.weightVsStdPct >= 0 ? "pos" : "neg"}>
            {signedPct(m.weightVsStdPct)} نسبت به استاندارد
          </div>
        </div>
        <div className="m-card" style={{ padding: "11px 12px" }}>
          <div style={{ fontSize: 10.5, color: "var(--muted)", display: "flex", gap: 4, alignItems: "center" }}>
            <Gauge size={11} /> ضریب تبدیل
          </div>
          <div style={{ fontSize: 17, fontWeight: 800 }} className="num">
            {m.fcr ? num(m.fcr, 2) : "—"}
          </div>
          <div style={{ fontSize: 10, color: "var(--muted)" }}>استاندارد {num(m.stdFcr, 2)}</div>
        </div>
        <div className="m-card" style={{ padding: "11px 12px" }}>
          <div style={{ fontSize: 10.5, color: "var(--muted)", display: "flex", gap: 4, alignItems: "center" }}>
            <TrendingUp size={11} /> سود پیش‌بینی
          </div>
          <div style={{ fontSize: 15, fontWeight: 800 }} className={`num ${m.projection.projectedProfit >= 0 ? "pos" : "neg"}`}>
            {compactToman(m.projection.projectedProfit).replace(" تومان", "")}
          </div>
          <div style={{ fontSize: 10, color: "var(--muted)" }}>تومان</div>
        </div>
      </div>

      {cycle.status === "active" ? (
        <div className="m-actions">
          <Link href={`/m/log/${cycle.id}`} className="m-action">
            <ClipboardPlus size={17} />
            ثبت آمار
          </Link>
          <Link href={`/m/cycle/${cycle.id}?tab=cost`} className="m-action amber">
            <Receipt size={17} />
            هزینه
          </Link>
          <Link href={`/m/cycle/${cycle.id}?tab=sales`} className="m-action blue">
            <BadgeDollarSign size={17} />
            فروش
          </Link>
          <Link href={`/m/assistant?q=${encodeURIComponent(`برای ${cycle.name} چه اقدامی پیشنهاد می‌کنی؟`)}`} className="m-action violet">
            <Sparkles size={17} />
            مشاور
          </Link>
        </div>
      ) : null}

      <div className="m-segment">
        {TABS.map((t) => (
          <Link key={t.key} href={`/m/cycle/${cycle.id}?tab=${t.key}`} className={tab === t.key ? "active" : ""} scroll={false}>
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "overview" && (
        <>
          <div className="m-card">
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span className="m-h2">
                <TrendingUp size={14} style={{ color: "var(--brand)" }} /> روند رشد
              </span>
              <span style={{ fontSize: 10, color: "var(--muted)" }}>گرم / روز</span>
            </div>
            <TrendChart series={growthSeries} format="grams" height={220} yTicks={4} />
          </div>

          <div className="m-card">
            <span className="m-h2" style={{ marginBottom: 8, display: "flex" }}>
              <HeartPulse size={14} style={{ color: "var(--brand)" }} /> وضعیت خوراک و آب
            </span>
            <div className="m-list-row">
              <span className="muted">دان مصرفی</span>
              <b className="num">{num(m.totalFeedKg)} کیلو</b>
            </div>
            <div className="m-list-row">
              <span className="muted">موجودی انبار</span>
              <b className={`num ${m.feedDaysLeft < 2 ? "neg" : ""}`}>
                {num(m.feedStockKg)} کیلو ({num(m.feedDaysLeft, 1)} روز)
              </b>
            </div>
            <div className="m-list-row">
              <span className="muted">سرانه مصرف</span>
              <b className="num">{num(m.avgDailyFeedG)} گرم</b>
            </div>
            <div className="m-list-row">
              <span className="muted">نسبت آب به دان</span>
              <b className="num">{m.totalFeedKg ? num(m.totalWaterL / m.totalFeedKg, 2) : "—"}</b>
            </div>
          </div>

          <div className="m-card">
            <span className="m-h2" style={{ marginBottom: 6, display: "flex" }}>
              <Receipt size={14} style={{ color: "var(--amber)" }} /> آخرین ثبت‌ها
            </span>
            {sortedLogs.slice(0, 5).map((l) => (
              <div key={l.id} className="m-list-row">
                <span className="num" style={{ fontSize: 11.5 }}>
                  {formatJalali(l.date)}
                </span>
                <span style={{ fontSize: 11, color: "var(--muted)" }}>
                  تلفات <b style={{ color: "var(--ink)" }}>{num(l.mortality)}</b> · دان{" "}
                  <b style={{ color: "var(--ink)" }}>{num(l.feed_kg, 0)}</b> · آب{" "}
                  <b style={{ color: "var(--ink)" }}>{num(l.water_l, 0)}</b>
                </span>
              </div>
            ))}
            {logs.length === 0 ? <div className="m-sub">هنوز ثبتی انجام نشده است.</div> : null}
          </div>
        </>
      )}

      {tab === "growth" && (
        <>
          <div className="m-card">
            <span className="m-h2" style={{ marginBottom: 8, display: "flex" }}>
              <Scale size={14} style={{ color: "var(--brand)" }} /> وزن در برابر استاندارد
            </span>
            <TrendChart series={growthSeries} format="grams" height={230} yTicks={4} />
          </div>
          <div className="m-card">
            <div className="m-list-row">
              <span className="muted">وزن فعلی</span>
              <b className="num">{num(m.currentWeightG)} گرم</b>
            </div>
            <div className="m-list-row">
              <span className="muted">استاندارد امروز</span>
              <b className="num">{num(m.stdWeightG)} گرم</b>
            </div>
            <div className="m-list-row">
              <span className="muted">رشد روزانه</span>
              <b className="num">{num(m.dailyGainG)} گرم</b>
            </div>
            <div className="m-list-row">
              <span className="muted">آخرین وزن‌کشی</span>
              <b className="num">{m.lastWeighDate ? formatJalali(m.lastWeighDate) : "—"}</b>
            </div>
            <div className="m-list-row">
              <span className="muted">ضریب تبدیل</span>
              <b className="num">
                {m.fcr ? num(m.fcr, 2) : "—"} / {num(m.stdFcr, 2)}
              </b>
            </div>
          </div>
        </>
      )}

      {tab === "cost" && (
        <>
          <div className="m-card">
            <span className="m-h2" style={{ marginBottom: 8, display: "flex" }}>
              <Receipt size={14} style={{ color: "var(--brand)" }} /> ترکیب هزینه‌ها
            </span>
            {m.costBreakdown.length ? (
              <DonutChart
                slices={m.costBreakdown.slice(0, 5).map((c) => ({ key: c.key, label: c.label, value: c.amount, color: c.color }))}
                centerLabel="کل هزینه"
                centerValue={compactToman(m.totalCost).replace(" تومان", "")}
                size={140}
                thickness={18}
                format="money"
              />
            ) : (
              <div className="m-sub">هزینه‌ای ثبت نشده است.</div>
            )}
            <div className="divider" />
            <div className="m-list-row">
              <span className="muted">هزینه هر قطعه</span>
              <b className="num">{toman(m.costPerBird)}</b>
            </div>
            <div className="m-list-row">
              <span className="muted">بهای هر کیلو زنده</span>
              <b className="num">{m.costPerKgLive ? toman(m.costPerKgLive) : "—"}</b>
            </div>
            <div className="m-list-row">
              <span className="muted">قیمت بازار</span>
              <b className="num">{toman(settings.market_price)}</b>
            </div>
          </div>

          <div className="m-card flush">
            {costs
              .slice()
              .sort((a, b) => (a.date < b.date ? 1 : -1))
              .slice(0, 12)
              .map((c) => (
                <div key={c.id} className="m-list-row" style={{ padding: "11px 14px" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{c.description}</div>
                    <div style={{ fontSize: 10, color: "var(--muted)" }}>
                      <span style={{ color: categoryColor(c.category) }}>{categoryLabel(c.category)}</span> ·{" "}
                      {formatJalali(c.date)}
                    </div>
                  </div>
                  <b className="num" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                    {compactToman(c.amount)}
                  </b>
                </div>
              ))}
            {costs.length === 0 ? <div className="m-empty m-sub">هزینه‌ای ثبت نشده است.</div> : null}
          </div>
          <Link href={`/cycles/${cycle.id}?tab=costs`} className="btn btn-outline btn-block">
            ثبت و مدیریت کامل هزینه‌ها
          </Link>
        </>
      )}

      {tab === "sales" && (
        <>
          <div className="m-card">
            <div className="m-list-row">
              <span className="muted">درآمد فروش</span>
              <b className="num pos">{toman(m.revenue)}</b>
            </div>
            <div className="m-list-row">
              <span className="muted">قطعه فروش‌رفته</span>
              <b className="num">{num(m.soldBirds)}</b>
            </div>
            <div className="m-list-row">
              <span className="muted">وزن فروخته‌شده</span>
              <b className="num">{num(m.soldWeightKg)} کیلو</b>
            </div>
            <div className="m-list-row">
              <span className="muted">میانگین قیمت</span>
              <b className="num">{m.avgSalePricePerKg ? toman(m.avgSalePricePerKg) : "—"}</b>
            </div>
            <div className="m-list-row">
              <span className="muted">ارزش گله زنده</span>
              <b className="num">{toman(m.estimatedLiveValue)}</b>
            </div>
          </div>
          {sales.map((s) => (
            <div key={s.id} className="m-card">
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <b>{num(s.count)} قطعه</b>
                <span className="num pos" style={{ fontWeight: 800 }}>
                  {compactToman(s.weight_kg * s.price_per_kg - s.deductions)}
                </span>
              </div>
              <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 4 }}>
                {formatJalali(s.date)} · {num(s.weight_kg)} کیلو · {num(s.price_per_kg)} تومان/کیلو
                {s.buyer ? ` · ${s.buyer}` : ""}
              </div>
            </div>
          ))}
          <Link href={`/cycles/${cycle.id}?tab=sales`} className="btn btn-primary btn-block">
            <BadgeDollarSign size={15} />
            ثبت فروش جدید
          </Link>
        </>
      )}

      {tab === "insights" && (
        <>
          {m.alerts.map((a, i) => (
            <div key={i} className={`m-alert ${a.severity}`}>
              <span
                style={{
                  width: 26,
                  height: 26,
                  flex: "0 0 26px",
                  borderRadius: 8,
                  display: "grid",
                  placeItems: "center",
                  background:
                    a.severity === "critical"
                      ? "var(--red-soft)"
                      : a.severity === "warning"
                        ? "var(--amber-soft)"
                        : a.severity === "good"
                          ? "var(--brand-soft)"
                          : "var(--blue-soft)",
                  color:
                    a.severity === "critical"
                      ? "var(--red)"
                      : a.severity === "warning"
                        ? "var(--amber)"
                        : a.severity === "good"
                          ? "var(--brand)"
                          : "var(--blue)",
                }}
              >
                {sevIcon[a.severity]}
              </span>
              <div>
                <div className="t">{a.title}</div>
                <div className="d">{a.detail}</div>
                <div className="d" style={{ color: "var(--muted)", borderInlineStart: "2px solid var(--line-strong)", paddingInlineStart: 8, marginTop: 5 }}>
                  {a.recommendation}
                </div>
              </div>
            </div>
          ))}

          <div className="m-card">
            <span className="m-h2" style={{ marginBottom: 8, display: "flex" }}>
              <TrendingUp size={14} style={{ color: "var(--brand)" }} /> پیش‌بینی پایان دوره
            </span>
            <div className="m-list-row">
              <span className="muted">روزهای باقی‌مانده</span>
              <b className="num">{num(m.projection.daysRemaining)} روز</b>
            </div>
            <div className="m-list-row">
              <span className="muted">وزن پیش‌بینی</span>
              <b className="num">{num(m.projection.projectedWeightG)} گرم</b>
            </div>
            <div className="m-list-row">
              <span className="muted">هزینه نهایی</span>
              <b className="num">{compactToman(m.projection.projectedCost)}</b>
            </div>
            <div className="m-list-row">
              <span className="muted">درآمد نهایی</span>
              <b className="num">{compactToman(m.projection.projectedRevenue)}</b>
            </div>
            <div className="m-list-row">
              <span className="muted">سود پیش‌بینی</span>
              <b className={`num ${m.projection.projectedProfit >= 0 ? "pos" : "neg"}`}>
                {compactToman(m.projection.projectedProfit)}
              </b>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {["الان بفروشم یا صبر کنم؟", "چقدر دان سفارش بدهم؟", "علت افزایش تلفات چیست؟"].map((q) => (
              <Link key={q} href={`/m/assistant?q=${encodeURIComponent(q)}`} className="chip" style={{ justifyContent: "center" }}>
                <Sparkles size={12} style={{ marginInlineEnd: 4 }} />
                {q}
              </Link>
            ))}
          </div>
        </>
      )}

      <div style={{ textAlign: "center", fontSize: 10.5, color: "var(--muted)", marginTop: 4, lineHeight: 1.9 }}>
        {faDigits(logs.length)} روز ثبت · برای تحلیل کامل و تنظیمات دوره،{" "}
        <Link href={`/cycles/${cycle.id}`} style={{ color: "var(--brand)", fontWeight: 700 }}>
          نسخه کامل
        </Link>
      </div>
    </>
  );
}
