import Link from "next/link";
import { Bird, Plus, ArrowLeft, Clock, TrendingUp, Scale } from "lucide-react";
import { getSettings } from "@/lib/db";
import { farmOverview } from "@/lib/metrics";
import { compactToman, num, pct, signedPct } from "@/lib/format";
import { formatJalali } from "@/lib/jalali";

export const dynamic = "force-dynamic";

export default async function MobileCycles() {
  const settings = getSettings();
  const o = farmOverview(settings);

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 className="m-h1">
          <Bird size={19} /> دوره‌ها
        </h1>
        <Link href="/cycles/new" className="btn btn-primary btn-sm">
          <Plus size={14} />
          جدید
        </Link>
      </div>

      <div className="m-kpis" style={{ gap: 8 }}>
        <div className="m-card" style={{ padding: "11px 12px", margin: 0 }}>
          <div style={{ fontSize: 10.5, color: "var(--muted)" }}>قطعه زنده</div>
          <div style={{ fontSize: 17, fontWeight: 800 }} className="num">
            {num(o.liveBirds)}
          </div>
        </div>
        <div className="m-card" style={{ padding: "11px 12px", margin: 0 }}>
          <div style={{ fontSize: 10.5, color: "var(--muted)" }}>سود محقق‌شده</div>
          <div style={{ fontSize: 15, fontWeight: 800 }} className={`num ${o.realizedProfit >= 0 ? "pos" : "neg"}`}>
            {compactToman(o.realizedProfit).replace(" تومان", "")}
          </div>
        </div>
      </div>

      <h2 className="m-h2" style={{ marginTop: 4 }}>
        در جریان ({num(o.activeMetrics.length)})
      </h2>

      {o.activeMetrics.map((m) => {
        const ratio = Math.min(100, (m.currentWeightG / m.targetWeightG) * 100);
        return (
          <Link key={m.cycle.id} href={`/m/cycle/${m.cycle.id}`} className="m-cycle-card">
            <div className="m-cycle-head">
              <div style={{ minWidth: 0 }}>
                <div className="m-cycle-title">{m.cycle.name}</div>
                <div className="m-cycle-meta">
                  {m.cycle.house} · {m.cycle.breed} · {formatJalali(m.cycle.placement_date)}
                </div>
              </div>
              <span className="badge badge-green" style={{ fontSize: 10 }}>
                روز {num(m.ageDays)}
              </span>
            </div>

            <div>
              <div className="progress-label" style={{ fontSize: 10 }}>
                <span>
                  وزن {num(m.currentWeightG)} / {num(m.targetWeightG)} گرم
                </span>
                <span className="num">{num(ratio, 0)}٪</span>
              </div>
              <div className="progress">
                <span style={{ width: `${ratio}%` }} />
              </div>
            </div>

            <div className="m-stats-3">
              <div className="m-stat">
                <div className="k">تلفات</div>
                <div className="v num">{pct(m.mortalityPct)}</div>
              </div>
              <div className="m-stat">
                <div className="k">FCR</div>
                <div className="v num">{m.fcr ? num(m.fcr, 2) : "—"}</div>
              </div>
              <div className="m-stat">
                <div className="k">اختلاف وزن</div>
                <div className={`v num ${m.weightVsStdPct >= 0 ? "pos" : "neg"}`}>{signedPct(m.weightVsStdPct)}</div>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11.5 }}>
              <span className="muted">
                هزینه: <b style={{ color: "var(--ink)" }}>{compactToman(m.totalCost)}</b>
              </span>
              <span style={{ color: "var(--brand)", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 3 }}>
                مدیریت
                <ArrowLeft size={12} />
              </span>
            </div>
          </Link>
        );
      })}

      {o.activeMetrics.length === 0 ? (
        <div className="m-card m-empty">
          <p className="m-sub">دوره فعالی وجود ندارد.</p>
        </div>
      ) : null}

      {o.closedMetrics.length ? (
        <>
          <h2 className="m-h2" style={{ marginTop: 6 }}>
            <Clock size={15} /> بسته‌شده ({num(o.closedMetrics.length)})
          </h2>
          {o.closedMetrics.map((m) => (
            <Link key={m.cycle.id} href={`/m/cycle/${m.cycle.id}`} className="m-card" style={{ display: "block" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div className="m-cycle-title">{m.cycle.name}</div>
                  <div className="m-cycle-meta">
                    {m.cycle.house} · {num(m.ageDays)} روز · {formatJalali(m.cycle.placement_date)}
                  </div>
                </div>
                <span className="badge badge-gray" style={{ fontSize: 10 }}>
                  بسته
                </span>
              </div>
              <div style={{ display: "flex", gap: 14, marginTop: 9, fontSize: 11.5, flexWrap: "wrap" }}>
                <span className="muted">
                  <Scale size={11} style={{ verticalAlign: -1 }} /> FCR <b className="num">{m.fcr ? num(m.fcr, 2) : "—"}</b>
                </span>
                <span className="muted">
                  تلفات <b className="num">{pct(m.mortalityPct)}</b>
                </span>
                <span className="muted">
                  <TrendingUp size={11} style={{ verticalAlign: -1 }} /> سود{" "}
                  <b className={`num ${m.netProfit >= 0 ? "pos" : "neg"}`}>{compactToman(m.netProfit)}</b>
                </span>
              </div>
            </Link>
          ))}
        </>
      ) : null}
    </>
  );
}
