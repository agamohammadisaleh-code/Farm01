import Link from "next/link";
import { ChartPie, Scale, HeartPulse, Wallet, ArrowLeft, TrendingUp, Download } from "lucide-react";
import { getDb, getSettings } from "@/lib/db";
import { farmOverview, categoryLabel, categoryColor, COST_CATEGORIES } from "@/lib/metrics";
import { compactToman, num, pct, toman, signedPct } from "@/lib/format";
import { isoToJalali, JALALI_MONTHS, faDigits, formatJalali } from "@/lib/jalali";
import { standardAt } from "@/lib/standards";
import StatCard from "@/components/ui/StatCard";
import DonutChart from "@/components/charts/DonutChart";
import BarList from "@/components/ui/BarList";
import TrendChart from "@/components/charts/TrendChart";
import PrintButton from "@/components/ui/PrintButton";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const settings = getSettings();
  const o = farmOverview(settings);
  const db = getDb();

  const allCosts = db
    .prepare("SELECT cycle_id, date, category, amount FROM costs ORDER BY date ASC")
    .all() as { cycle_id: number; date: string; category: string; amount: number }[];
  const allSales = db
    .prepare("SELECT cycle_id, date, weight_kg, price_per_kg, deductions FROM sales ORDER BY date ASC")
    .all() as { cycle_id: number; date: string; weight_kg: number; price_per_kg: number; deductions: number }[];

  // تجمیع ماهانه شمسی
  const monthMap = new Map<string, { label: string; cost: number; revenue: number; sort: number }>();
  for (const c of allCosts) {
    const j = isoToJalali(c.date);
    const key = `${j.jy}-${j.jm}`;
    const cur = monthMap.get(key) ?? { label: `${JALALI_MONTHS[j.jm - 1]} ${faDigits(j.jy)}`, cost: 0, revenue: 0, sort: j.jy * 12 + j.jm };
    cur.cost += c.amount;
    monthMap.set(key, cur);
  }
  for (const s of allSales) {
    const j = isoToJalali(s.date);
    const key = `${j.jy}-${j.jm}`;
    const cur = monthMap.get(key) ?? { label: `${JALALI_MONTHS[j.jm - 1]} ${faDigits(j.jy)}`, cost: 0, revenue: 0, sort: j.jy * 12 + j.jm };
    cur.revenue += Math.max(0, s.weight_kg * s.price_per_kg - s.deductions);
    monthMap.set(key, cur);
  }
  const months = [...monthMap.values()].sort((a, b) => a.sort - b.sort);

  const monthlySeries = [
    {
      key: "cost",
      name: "هزینه ماه",
      color: "#bb3a2b",
      area: true,
      points: months.map((m) => ({ y: m.cost, label: m.label.split(" ")[0] })),
    },
    {
      key: "rev",
      name: "درآمد ماه",
      color: "#1e8a5f",
      area: true,
      points: months.map((m) => ({ y: m.revenue, label: m.label.split(" ")[0] })),
    },
  ];

  const closed = o.closedMetrics;
  const avgFcr = closed.length ? closed.reduce((s, m) => s + (m.fcr ?? 0), 0) / closed.length : 0;
  const avgMortality = closed.length ? closed.reduce((s, m) => s + m.mortalityPct, 0) / closed.length : 0;
  const avgProfitPerBird = closed.length ? closed.reduce((s, m) => s + m.marginPct, 0) / closed.length : 0;
  const totalFeedCost = o.costBreakdown.find((c) => c.key === "feed")?.amount ?? 0;

  return (
    <div className="page-enter">
      <div className="page-head">
        <div>
          <h1>گزارش‌ها و تحلیل عملکرد</h1>
          <p className="desc">
            جمع‌بندی اقتصادی و فنی مزرعه: عملکرد دوره‌های بسته‌شده، ساختار هزینه، روند ماهانه و مقایسه با استاندارد صنعت.
          </p>
        </div>
        <div className="row wrap no-print" style={{ gap: 8 }}>
          <a href="/api/export/logs" className="btn btn-outline btn-sm">
            <Download size={14} />
            خروجی ثبت روزانه
          </a>
          <a href="/api/export/costs" className="btn btn-outline btn-sm">
            <Download size={14} />
            خروجی هزینه‌ها
          </a>
          <a href="/api/export/sales" className="btn btn-outline btn-sm">
            <Download size={14} />
            خروجی فروش
          </a>
          <PrintButton />
          <Link href="/assistant?q=وضعیت سود و زیان چطور است؟" className="btn btn-primary btn-sm no-print">
            تفسیر هوشمند گزارش
            <ArrowLeft size={13} />
          </Link>
        </div>
      </div>

      <div className="grid grid-4">
        <StatCard
          label="میانگین ضریب تبدیل"
          value={closed.length ? num(avgFcr, 2) : "—"}
          icon={<Scale size={17} />}
          hint={`استاندارد ۴۲ روزه: ${num(standardAt(42).fcr, 2)}`}
          tone="blue"
        />
        <StatCard
          label="میانگین تلفات دوره‌ها"
          value={closed.length ? pct(avgMortality) : "—"}
          icon={<HeartPulse size={17} />}
          hint={`${num(closed.length)} دوره بسته‌شده`}
          tone={avgMortality > 5 ? "red" : "green"}
        />
        <StatCard
          label="میانگین حاشیه سود"
          value={closed.length ? signedPct(avgProfitPerBird) : "—"}
          icon={<TrendingUp size={17} />}
          hint="درصد از درآمد فروش"
          tone={avgProfitPerBird >= 10 ? "green" : "amber"}
        />
        <StatCard
          label="سود محقق‌شده کل"
          value={compactToman(o.realizedProfit).replace(" تومان", "")}
          unit="تومان"
          icon={<Wallet size={17} />}
          hint={`درآمد: ${compactToman(o.realizedRevenue)}`}
          tone={o.realizedProfit >= 0 ? "green" : "red"}
        />
      </div>

      <div className="grid grid-2-1 mt-20">
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">
                <ChartPie size={16} style={{ color: "var(--brand)" }} />
                روند ماهانه هزینه و درآمد
              </div>
              <div className="hint" style={{ marginTop: 2 }}>
                بر پایه تاریخ ثبت هزینه‌ها و فروش‌ها (تقویم شمسی)
              </div>
            </div>
          </div>
          <div className="card-body">
            {months.length ? (
              <TrendChart series={monthlySeries} format="money" height={280} />
            ) : (
              <div className="empty-chart">داده مالی ثبت نشده است</div>
            )}
            <div className="table-wrap mt-14">
              <table className="data">
                <thead>
                  <tr>
                    <th>ماه</th>
                    <th>هزینه</th>
                    <th>درآمد</th>
                    <th>تراز</th>
                  </tr>
                </thead>
                <tbody>
                  {months.map((m) => (
                    <tr key={m.label}>
                      <td className="cell-main">{m.label}</td>
                      <td className="num">{compactToman(m.cost)}</td>
                      <td className="num">{compactToman(m.revenue)}</td>
                      <td className={`num bold ${m.revenue - m.cost >= 0 ? "pos" : "neg"}`}>
                        {compactToman(m.revenue - m.cost)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card">
            <div className="card-head">
              <div className="card-title">ساختار هزینه مزرعه</div>
            </div>
            <div className="card-body">
              {o.costBreakdown.length ? (
                <>
                  <DonutChart
                    slices={o.costBreakdown.slice(0, 6).map((c) => ({
                      key: c.key,
                      label: c.label,
                      value: c.amount,
                      color: c.color,
                    }))}
                    centerLabel="کل هزینه"
                    centerValue={compactToman(o.totalCostAll).replace(" تومان", "")}
                    size={150}
                    format="money"
                  />
                  <div className="divider" />
                  <BarList
                    rows={o.costBreakdown.slice(0, 4).map((c) => ({ key: c.key, label: c.label, value: c.amount, color: c.color }))}
                    format={(n) => compactToman(n).replace(" تومان", "")}
                    showShare={false}
                  />
                </>
              ) : (
                <p className="small muted">هزینه‌ای ثبت نشده است.</p>
              )}
            </div>
          </div>

          <div className="card card-pad">
            <b style={{ fontSize: 13 }}>بنچمارک صنعت</b>
            <div className="kv-list mt-8">
              <div className="kv">
                <span className="k">سهم دان از هزینه</span>
                <span className="v num">{o.totalCostAll ? pct((totalFeedCost / o.totalCostAll) * 100) : "—"}</span>
              </div>
              <div className="kv">
                <span className="k">محدوده رایج سهم دان</span>
                <span className="v num">۶۵ تا ۷۰٪</span>
              </div>
              <div className="kv">
                <span className="k">تلفات مطلوب دوره</span>
                <span className="v num">زیر ۴٪</span>
              </div>
              <div className="kv">
                <span className="k">ضریب تبدیل مطلوب (۲۵۰۰ گرم)</span>
                <span className="v num">۱٫۵۵ تا ۱٫۶۵</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card mt-20">
        <div className="card-head">
          <div>
            <div className="card-title">
              <Download size={16} style={{ color: "var(--brand)" }} />
              عملکرد تفصیلی دوره‌های بسته‌شده
            </div>
            <div className="hint" style={{ marginTop: 2 }}>
              معیارهای کلیدی برای مقایسه دوره‌ها و برنامه‌ریزی دوره بعد
            </div>
          </div>
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>دوره</th>
                <th>مدت (روز)</th>
                <th>وزن نهایی</th>
                <th>FCR</th>
                <th>تلفات</th>
                <th>هزینه هر قطعه</th>
                <th>بهای هر کیلو</th>
                <th>قیمت فروش</th>
                <th>حاشیه</th>
                <th>سود</th>
              </tr>
            </thead>
            <tbody>
              {closed.map((m) => (
                <tr key={m.cycle.id}>
                  <td>
                    <Link href={`/cycles/${m.cycle.id}`} className="cell-main" style={{ color: "var(--brand)" }}>
                      {m.cycle.name}
                    </Link>
                    <div className="cell-sub">{formatJalali(m.cycle.placement_date)}</div>
                  </td>
                  <td className="num">{num(m.ageDays)}</td>
                  <td className="num">{num(m.currentWeightG)} گرم</td>
                  <td className="num">
                    {m.fcr ? num(m.fcr, 2) : "—"}{" "}
                    <span className={`tiny ${m.fcr && m.fcr <= m.stdFcr * 1.03 ? "pos" : "neg"}`}>
                      {m.fcr ? (m.fcr <= m.stdFcr ? "✓" : "▲") : ""}
                    </span>
                  </td>
                  <td className="num">{pct(m.mortalityPct)}</td>
                  <td className="num">{compactToman(m.costPerBird)}</td>
                  <td className="num">{m.costPerKgLive ? num(m.costPerKgLive) : "—"}</td>
                  <td className="num">{m.avgSalePricePerKg ? num(m.avgSalePricePerKg) : "—"}</td>
                  <td>
                    <span className={`badge ${m.marginPct >= 15 ? "badge-green" : m.marginPct >= 0 ? "badge-amber" : "badge-red"}`}>
                      {signedPct(m.marginPct)}
                    </span>
                  </td>
                  <td className={`num bold ${m.netProfit >= 0 ? "pos" : "neg"}`}>{compactToman(m.netProfit)}</td>
                </tr>
              ))}
              {closed.length === 0 ? (
                <tr>
                  <td colSpan={10} className="center muted small" style={{ padding: 26 }}>
                    هنوز دوره‌ای بسته نشده است. پس از پایان فروش، دوره را ببندید تا در این گزارش قرار بگیرد.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-2 mt-20">
        <div className="card card-pad">
          <b style={{ fontSize: 13 }}>خلاصه هزینه‌های هر دوره فعال</b>
          <div className="table-wrap mt-8">
            <table className="data">
              <thead>
                <tr>
                  <th>دوره</th>
                  <th>هزینه</th>
                  <th>هزینه هر قطعه</th>
                  <th>درصد پیشرفت</th>
                </tr>
              </thead>
              <tbody>
                {o.activeMetrics.map((m) => (
                  <tr key={m.cycle.id}>
                    <td className="cell-main">{m.cycle.name}</td>
                    <td className="num">{compactToman(m.totalCost)}</td>
                    <td className="num">{compactToman(m.costPerBird)}</td>
                    <td>
                      <div className="progress" style={{ minWidth: 70 }}>
                        <span style={{ width: `${Math.min(100, (m.ageDays / m.projection.targetAge) * 100)}%` }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card card-pad">
          <b style={{ fontSize: 13 }}>یادداشت تحلیلی</b>
          <ul className="small muted" style={{ paddingInlineStart: 18, lineHeight: 2.1, marginTop: 8 }}>
            <li>
              میانگین ضریب تبدیل دوره‌های بسته‌شده {closed.length ? num(avgFcr, 2) : "—"} است؛ هر ۰٫۰۵ کاهش در FCR
              تقریباً ۳٪ از هزینه دان را کم می‌کند.
            </li>
            <li>
              سهم دان از کل هزینه {o.totalCostAll ? pct((totalFeedCost / o.totalCostAll) * 100) : "—"} است؛ فاصله آن با
              محدوده ۶۵ تا ۷۰ درصد، فرصت بازبینی ساختار هزینه را نشان می‌دهد.
            </li>
            <li>
              قیمت تمام‌شده هر کیلوگرم زنده در دوره‌های فعال به‌طور میانگین{" "}
              {o.activeMetrics.length
                ? toman(
                    o.activeMetrics.reduce((s, m) => s + (m.costPerKgLive ?? 0), 0) / o.activeMetrics.length,
                  )
                : "—"}{" "}
              است.
            </li>
            <li>برای تفسیر دقیق‌تر و تصمیم عملی، از مشاور هوشمند استفاده کنید.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
