import Link from "next/link";
import {
  Bird,
  Scale,
  TrendingUp,
  HeartPulse,
  ClipboardPlus,
  Receipt,
  BadgeDollarSign,
  ArrowLeft,
  Plus,
  Sparkles,
  AlertTriangle,
  CircleCheck,
  Info,
  Egg,
  Wheat,
} from "lucide-react";
import { getSettings } from "@/lib/db";
import { farmOverview } from "@/lib/metrics";
import { compactToman, num, pct } from "@/lib/format";
import { formatJalali as fj } from "@/lib/jalali";

export const dynamic = "force-dynamic";

const sevIcon: Record<string, React.ReactNode> = {
  critical: <AlertTriangle size={14} />,
  warning: <AlertTriangle size={14} />,
  info: <Info size={14} />,
  good: <CircleCheck size={14} />,
};

export default async function MobileHome() {
  const settings = getSettings();
  const o = farmOverview(settings);

  if (!o.cycles.length) {
    return (
      <>
        <h1 className="m-h1">
          <Egg size={19} /> شروع کار
        </h1>
        <div className="m-card m-empty">
          <div className="empty-icon" style={{ width: 56, height: 56 }}>
            <Egg size={24} />
          </div>
          <h3>هنوز دوره‌ای ثبت نشده است</h3>
          <p className="m-sub">برای شروع، اولین دوره پرورش را ایجاد کنید.</p>
          <Link href="/cycles/new" className="btn btn-primary" style={{ marginTop: 12 }}>
            <Plus size={15} />
            دوره جدید
          </Link>
        </div>
      </>
    );
  }

  const nearest = o.activeMetrics
    .slice()
    .sort((a, b) => a.daysRemaining - b.daysRemaining)[0];
  const topAlerts = o.activeMetrics
    .flatMap((m) => m.alerts.map((a) => ({ ...a, cycleName: m.cycle.name, cycleId: m.cycle.id })))
    .filter((a) => a.severity === "critical" || a.severity === "warning")
    .slice(0, 2);

  return (
    <>
      {/* کارت وضعیت مزرعه */}
      <section className="m-card m-hero">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: "#a9cbbb" }}>وضعیت امروز مزرعه</div>
          <span className="badge" style={{ background: "rgba(233,247,201,.16)", color: "#dff3c4", fontSize: 10 }}>
            {num(o.activeMetrics.length)} دوره فعال
          </span>
        </div>
        <div className="m-kpis">
          <div className="m-kpi">
            <div className="k">
              <Bird size={11} /> قطعه زنده
            </div>
            <div className="v">
              {num(o.liveBirds)} <small>قطعه</small>
            </div>
          </div>
          <div className="m-kpi">
            <div className="k">
              <Scale size={11} /> توده زنده
            </div>
            <div className="v">
              {num(o.liveBiomassKg)} <small>کیلو</small>
            </div>
          </div>
          <div className="m-kpi">
            <div className="k">
              <TrendingUp size={11} /> سود پیش‌بینی
            </div>
            <div className="v" style={{ fontSize: 15 }}>
              {compactToman(o.activeProjectedProfit).replace(" تومان", "")}
            </div>
          </div>
          <div className="m-kpi">
            <div className="k">
              <HeartPulse size={11} /> تلفات
            </div>
            <div className="v">{pct(o.mortalityPctWeighted)}</div>
          </div>
        </div>
      </section>

      {/* هشدارها */}
      {topAlerts.length ? (
        <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {topAlerts.map((a, i) => (
            <Link key={i} href={`/m/cycle/${a.cycleId}?tab=insights`} className={`m-alert ${a.severity}`}>
              <span
                style={{
                  width: 26,
                  height: 26,
                  flex: "0 0 26px",
                  borderRadius: 8,
                  display: "grid",
                  placeItems: "center",
                  background: a.severity === "critical" ? "var(--red-soft)" : "var(--amber-soft)",
                  color: a.severity === "critical" ? "var(--red)" : "var(--amber)",
                }}
              >
                {sevIcon[a.severity]}
              </span>
              <div style={{ minWidth: 0 }}>
                <div className="t">{a.title}</div>
                <div className="d">{a.detail.length > 90 ? a.detail.slice(0, 90) + "…" : a.detail}</div>
                <div style={{ fontSize: 10.5, color: "var(--brand)", fontWeight: 700, marginTop: 3 }}>
                  {a.cycleName} — مشاهده اقدام
                </div>
              </div>
            </Link>
          ))}
        </section>
      ) : (
        <div className="m-alert good">
          <span style={{ color: "var(--brand)" }}>
            <CircleCheck size={16} />
          </span>
          <div>
            <div className="t">همه شاخص‌ها مطلوب است</div>
            <div className="d">تلفات، رشد و موجودی دان در محدوده قابل قبول قرار دارند.</div>
          </div>
        </div>
      )}

      {/* نزدیک‌ترین دوره به فروش */}
      {nearest ? (
        <section className="m-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span className="m-h2">
              <TrendingUp size={15} style={{ color: "var(--brand)" }} />
              نزدیک‌ترین فروش
            </span>
            <span className="badge badge-green" style={{ fontSize: 10 }}>
              {num(nearest.daysRemaining)} روز تا هدف
            </span>
          </div>
          <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>{nearest.cycle.name}</div>
          <div className="progress-label" style={{ fontSize: 10 }}>
            <span className="num">
              وزن {num(nearest.currentWeightG)} از {num(nearest.targetWeightG)} گرم
            </span>
            <span className="num">{num((nearest.currentWeightG / nearest.targetWeightG) * 100, 0)}٪</span>
          </div>
          <div className="progress">
            <span style={{ width: `${Math.min(100, (nearest.currentWeightG / nearest.targetWeightG) * 100)}%` }} />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <Link href={`/m/cycle/${nearest.cycle.id}`} className="btn btn-outline btn-sm" style={{ flex: 1 }}>
              جزئیات
            </Link>
            <Link href={`/m/log/${nearest.cycle.id}`} className="btn btn-primary btn-sm" style={{ flex: 1 }}>
              <ClipboardPlus size={14} />
              ثبت امروز
            </Link>
          </div>
        </section>
      ) : null}

      {/* دوره‌ها */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 2 }}>
        <h2 className="m-h2">
          <Bird size={15} /> دوره‌های فعال
        </h2>
        <Link href="/m/cycles" style={{ fontSize: 11.5, color: "var(--brand)", fontWeight: 700 }}>
          همه
          <ArrowLeft size={11} style={{ verticalAlign: -1 }} />
        </Link>
      </div>

      {o.activeMetrics.map((m) => (
        <article key={m.cycle.id} className="m-cycle-card">
          <div className="m-cycle-head">
            <div style={{ minWidth: 0 }}>
              <div className="m-cycle-title">{m.cycle.name}</div>
              <div className="m-cycle-meta">
                {m.cycle.house || "بدون سالن"} · روز {num(m.ageDays)} · {fj(m.cycle.placement_date)}
              </div>
            </div>
            <span className={`badge ${m.alerts.some((a) => a.severity === "critical") ? "badge-red" : "badge-green"}`} style={{ fontSize: 10 }}>
              {m.alerts.some((a) => a.severity === "critical") ? "نیاز به توجه" : "در جریان"}
            </span>
          </div>

          <div className="m-stats-3">
            <div className="m-stat">
              <div className="k">زنده</div>
              <div className="v num">{num(m.liveBirds)}</div>
            </div>
            <div className="m-stat">
              <div className="k">وزن</div>
              <div className="v num">{num(m.currentWeightG)}g</div>
            </div>
            <div className="m-stat">
              <div className="k">تلفات</div>
              <div className="v num">{pct(m.mortalityPct)}</div>
            </div>
          </div>

          <div style={{ fontSize: 11.5, display: "flex", justifyContent: "space-between", color: "var(--muted)" }}>
            <span>
              دان انبار: <b style={{ color: m.feedDaysLeft < 2 ? "var(--red)" : "var(--ink)" }}>{num(m.feedStockKg)} کیلو</b>
            </span>
            <span>
              سود پیش‌بینی:{" "}
              <b style={{ color: m.projection.projectedProfit >= 0 ? "var(--brand-2)" : "var(--red)" }}>
                {compactToman(m.projection.projectedProfit)}
              </b>
            </span>
          </div>

          <div className="m-actions">
            <Link href={`/m/log/${m.cycle.id}`} className="m-action">
              <ClipboardPlus size={17} />
              ثبت آمار
            </Link>
            <Link href={`/m/cycle/${m.cycle.id}?tab=cost`} className="m-action amber">
              <Receipt size={17} />
              هزینه
            </Link>
            <Link href={`/m/cycle/${m.cycle.id}?tab=sales`} className="m-action blue">
              <BadgeDollarSign size={17} />
              فروش
            </Link>
            <Link href={`/m/assistant?q=${encodeURIComponent(`وضعیت ${m.cycle.name} چطور است؟`)}`} className="m-action violet">
              <Sparkles size={17} />
              مشاور
            </Link>
          </div>
        </article>
      ))}

      {o.activeMetrics.length === 0 ? (
        <div className="m-card m-empty">
          <p className="m-sub">دوره فعالی وجود ندارد. یک دوره جدید بسازید.</p>
          <Link href="/cycles/new" className="btn btn-primary btn-sm" style={{ marginTop: 10 }}>
            <Plus size={14} />
            دوره جدید
          </Link>
        </div>
      ) : null}

      {/* دان و خوراک */}
      <section className="m-card">
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 9 }}>
          <Wheat size={15} style={{ color: "var(--amber)" }} />
          <span className="m-h2">موجودی دان</span>
        </div>
        {o.activeMetrics.map((m) => (
          <div key={m.cycle.id} style={{ padding: "7px 0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, marginBottom: 4 }}>
              <span style={{ fontWeight: 600 }}>{m.cycle.name}</span>
              <span
                className="num"
                style={{ color: m.feedDaysLeft < 2 ? "var(--red)" : "var(--muted)", fontWeight: 700 }}
              >
                {num(m.feedDaysLeft, 1)} روز کفایت
              </span>
            </div>
            <div className={`progress ${m.feedDaysLeft < 2 ? "red" : m.feedDaysLeft < 4 ? "amber" : ""}`}>
              <span style={{ width: `${Math.min(100, (m.feedDaysLeft / 7) * 100)}%` }} />
            </div>
          </div>
        ))}
        <Link href="/m/assistant?q=چقدر دان سفارش بدهم؟" className="btn btn-outline btn-sm btn-block" style={{ marginTop: 10 }}>
          <Sparkles size={13} />
          محاسبه سفارش دان
        </Link>
      </section>

      <div style={{ textAlign: "center", fontSize: 10.5, color: "var(--muted)", padding: "4px 0 2px" }}>
        آخرین به‌روزرسانی: {fj(new Date().toISOString().slice(0, 10))} · داده‌ها محلی ذخیره می‌شوند
      </div>
    </>
  );
}
