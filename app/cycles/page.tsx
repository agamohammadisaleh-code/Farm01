import Link from "next/link";
import { Plus, ArrowLeft, Bird, Scale, TrendingUp, CircleDollarSign, Clock } from "lucide-react";
import { getSettings } from "@/lib/db";
import { farmOverview } from "@/lib/metrics";
import { compactToman, num, pct, signedPct } from "@/lib/format";
import { formatJalali } from "@/lib/jalali";
import StatCard from "@/components/ui/StatCard";

export const dynamic = "force-dynamic";

export default async function CyclesPage() {
  const settings = getSettings();
  const o = farmOverview(settings);
  const active = o.activeMetrics;
  const closed = o.closedMetrics;

  return (
    <div className="page-enter">
      <div className="page-head">
        <div>
          <h1>دوره‌های پرورش</h1>
          <p className="desc">
            هر دوره یک چرخه کامل از جوجه‌ریزی تا فروش است. وضعیت رشد، تلفات، هزینه و سود هر سالن را جداگانه پیگیری کنید.
          </p>
        </div>
        <Link href="/cycles/new" className="btn btn-primary">
          <Plus size={15} />
          دوره جدید
        </Link>
      </div>

      <div className="grid grid-4">
        <StatCard
          label="دوره‌های فعال"
          value={num(active.length)}
          icon={<Bird size={17} />}
          hint={`${num(o.liveBirds)} قطعه زنده`}
        />
        <StatCard
          label="دوره‌های بسته‌شده"
          value={num(closed.length)}
          icon={<Clock size={17} />}
          hint={`${num(closed.reduce((s, m) => s + m.soldBirds, 0))} قطعه فروش‌رفته`}
          tone="blue"
        />
        <StatCard
          label="سود محقق‌شده"
          value={compactToman(o.realizedProfit).replace(" تومان", "")}
          unit="تومان"
          icon={<CircleDollarSign size={17} />}
          hint={`درآمد: ${compactToman(o.realizedRevenue)}`}
          tone={o.realizedProfit >= 0 ? "green" : "red"}
        />
        <StatCard
          label="میانگین ضریب تبدیل"
          value={num(
            closed.length ? closed.reduce((s, m) => s + (m.fcr ?? 0), 0) / closed.length : 0,
            2,
          )}
          icon={<Scale size={17} />}
          hint="دوره‌های بسته‌شده"
          tone="amber"
        />
      </div>

      <div className="row-between mt-20 mb-14">
        <h2>دوره‌های در جریان</h2>
        <span className="badge badge-green">{num(active.length)} دوره</span>
      </div>

      {active.length === 0 ? (
        <div className="card empty">
          <div className="empty-icon">
            <Bird size={24} />
          </div>
          <h3>دوره فعالی وجود ندارد</h3>
          <p>برای شروع، یک دوره جدید با تاریخ جوجه‌ریزی و تعداد جوجه ثبت کنید.</p>
          <Link href="/cycles/new" className="btn btn-primary mt-14">
            <Plus size={15} />
            ثبت دوره جدید
          </Link>
        </div>
      ) : (
        <div className="grid grid-2">
          {active.map((m) => {
            const ratio = Math.min(100, (m.ageDays / m.projection.targetAge) * 100);
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
                      {m.cycle.house || "بدون سالن"} · {m.cycle.breed} · {num(m.cycle.initial_count)} جوجه ·{" "}
                      {formatJalali(m.cycle.placement_date)}
                    </div>
                  </div>
                  <span className="badge badge-gray">{num(m.ageDays)} روزه</span>
                </div>

                <div>
                  <div className="progress-label">
                    <span>
                      روز {num(m.ageDays)} از {num(m.projection.targetAge)}
                    </span>
                    <span className="num">{num(ratio, 0)}٪</span>
                  </div>
                  <div className={`progress ${m.alerts.some((a) => a.severity === "critical") ? "red" : ""}`}>
                    <span style={{ width: `${ratio}%` }} />
                  </div>
                </div>

                <div className="cycle-stats" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
                  <div className="cycle-stat">
                    <div className="k">زنده</div>
                    <div className="v num">{num(m.liveBirds)}</div>
                  </div>
                  <div className="cycle-stat">
                    <div className="k">وزن</div>
                    <div className="v num">{num(m.currentWeightG)}g</div>
                  </div>
                  <div className="cycle-stat">
                    <div className="k">FCR</div>
                    <div className="v num">{m.fcr ? num(m.fcr, 2) : "—"}</div>
                  </div>
                  <div className="cycle-stat">
                    <div className="k">تلفات</div>
                    <div className="v num">{pct(m.mortalityPct)}</div>
                  </div>
                </div>

                <div className="row-between wrap" style={{ fontSize: 12 }}>
                  <span className="muted">
                    هزینه تا امروز: <b className="num" style={{ color: "var(--ink)" }}>{compactToman(m.totalCost)}</b>
                  </span>
                  <span className="muted">
                    سود پیش‌بینی:{" "}
                    <b className={`num ${m.projection.projectedProfit >= 0 ? "pos" : "neg"}`}>
                      {compactToman(m.projection.projectedProfit)}
                    </b>
                  </span>
                </div>

                {m.alerts.filter((a) => a.severity === "critical" || a.severity === "warning").length > 0 ? (
                  <div className="row" style={{ gap: 5 }}>
                    <span className="badge badge-red">
                      {num(m.alerts.filter((a) => a.severity === "critical").length)} بحرانی
                    </span>
                    <span className="badge badge-amber">
                      {num(m.alerts.filter((a) => a.severity === "warning").length)} هشدار
                    </span>
                  </div>
                ) : (
                  <span className="badge badge-green">بدون هشدار</span>
                )}

                <div className="cycle-foot">
                  <Link href={`/cycles/${m.cycle.id}`} className="btn btn-outline btn-sm">
                    مدیریت دوره
                    <ArrowLeft size={13} />
                  </Link>
                  <Link href={`/assistant?q=${encodeURIComponent(`وضعیت ${m.cycle.name} چطور است؟`)}`} className="btn btn-ghost btn-sm">
                    تحلیل هوشمند
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="card mt-20">
        <div className="card-head">
          <div>
            <div className="card-title">
              <TrendingUp size={16} style={{ color: "var(--brand)" }} />
              دوره‌های بسته‌شده
            </div>
            <div className="hint" style={{ marginTop: 2 }}>
              مقایسه عملکرد نهایی دوره‌ها؛ معیار خوب برای برنامه‌ریزی دوره بعد.
            </div>
          </div>
        </div>
        {closed.length === 0 ? (
          <div className="empty" style={{ padding: 30 }}>
            <p>هنوز دوره‌ای بسته نشده است. با پایان فروش، دوره را از صفحه مدیریت آن ببندید.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>دوره</th>
                  <th>بازه</th>
                  <th>جوجه</th>
                  <th>فروش (قطعه)</th>
                  <th>وزن نهایی</th>
                  <th>FCR</th>
                  <th>تلفات</th>
                  <th>درآمد</th>
                  <th>هزینه</th>
                  <th>سود</th>
                  <th>حاشیه</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {closed.map((m) => (
                  <tr key={m.cycle.id}>
                    <td>
                      <div className="cell-main">{m.cycle.name}</div>
                      <div className="cell-sub">{m.cycle.house}</div>
                    </td>
                    <td className="num small">
                      {formatJalali(m.cycle.placement_date)}
                      <div className="cell-sub">تا {formatJalali(m.cycle.closed_date ?? "")}</div>
                    </td>
                    <td className="num">{num(m.cycle.initial_count)}</td>
                    <td className="num">{num(m.soldBirds)}</td>
                    <td className="num">{num(m.currentWeightG)} گرم</td>
                    <td className="num">{m.fcr ? num(m.fcr, 2) : "—"}</td>
                    <td className="num">{pct(m.mortalityPct)}</td>
                    <td className="num">{compactToman(m.revenue)}</td>
                    <td className="num">{compactToman(m.totalCost)}</td>
                    <td className={`num bold ${m.netProfit >= 0 ? "pos" : "neg"}`}>{compactToman(m.netProfit)}</td>
                    <td>
                      <span className={`badge ${m.marginPct >= 15 ? "badge-green" : m.marginPct >= 0 ? "badge-amber" : "badge-red"}`}>
                        {signedPct(m.marginPct)}
                      </span>
                    </td>
                    <td>
                      <Link href={`/cycles/${m.cycle.id}`} className="btn btn-ghost btn-sm">
                        جزئیات
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
