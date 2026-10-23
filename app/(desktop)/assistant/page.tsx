import Link from "next/link";
import { Sparkles, Database, ShieldQuestion, Wand2, ArrowLeft, Bird, Wheat, TrendingUp, BrainCircuit } from "lucide-react";
import { getSettings } from "@/lib/db";
import { farmOverview } from "@/lib/metrics";
import { Q_CHIPS } from "@/lib/ai";
import { compactToman, num, pct } from "@/lib/format";
import ChatPanel from "@/components/assistant/ChatPanel";

export const dynamic = "force-dynamic";

function buildGreeting(o: ReturnType<typeof farmOverview>, marketPrice: number, feedPrice: number) {
  const s = ["### سلام، من مشاور مرغ‌یار هستم 👋"];
  if (!o.activeMetrics.length) {
    s.push(
      "هنوز دوره فعالی برای تحلیل وجود ندارد. با ثبت اولین دوره، می‌توانم درباره رشد، تلفات، خوراک، هزینه و زمان فروش راهنمایی کنم.",
    );
    return s.join("\n");
  }
  s.push(
    `در حال حاضر **${num(o.liveBirds)} قطعه** در **${num(o.activeMetrics.length)} دوره فعال** دارید؛ توده زنده حدود **${num(o.liveBiomassKg)} کیلوگرم** با ارزش برآوردی ${compactToman(o.liveBiomassKg * marketPrice)}.`,
  );

  const critical = o.alerts.filter((a) => a.severity === "critical");
  const warning = o.alerts.filter((a) => a.severity === "warning");
  if (critical.length) {
    s.push("#### مهم‌ترین موضوع امروز");
    s.push(`- 🔴 **${critical[0].title}** در «${critical[0].cycleName}»: ${critical[0].detail}`);
    s.push(`- اقدام پیشنهادی: ${critical[0].recommendation}`);
  } else if (warning.length) {
    s.push("#### نکته قابل توجه");
    s.push(`- 🟠 **${warning[0].title}** در «${warning[0].cycleName}»: ${warning[0].detail}`);
  } else {
    s.push("همه شاخص‌های اصلی (تلفات، رشد، ضریب تبدیل و موجودی دان) در محدوده مطلوب هستند. ✅");
  }

  const nearest = o.activeMetrics
    .slice()
    .sort((a, b) => b.currentWeightG / b.targetWeightG - a.currentWeightG / a.targetWeightG)[0];
  s.push(
    "#### خلاصه تصمیم‌ها",
    `- نزدیک‌ترین گله به فروش: «${nearest.cycle.name}» با وزن ${num(nearest.currentWeightG)} گرم و ${num(nearest.daysRemaining)} روز تا سن هدف`,
    `- سود پیش‌بینی‌شده دوره‌های فعال: **${compactToman(o.activeProjectedProfit)}**`,
    `- مبنای محاسبات: قیمت بازار ${num(marketPrice)} تومان و قیمت دان ${num(feedPrice)} تومان (از تنظیمات)`,
  );
  s.push("> چه چیزی می‌خواهید بررسی کنیم؟ می‌توانید درباره فروش، دان، تلفات، هزینه یا پیش‌بینی پایان دوره بپرسید.");
  return s.join("\n");
}

export default async function AssistantPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const settings = getSettings();
  const o = farmOverview(settings);
  const greeting = buildGreeting(o, settings.market_price, settings.feed_price);
  const initialQuestion = sp.q ? String(sp.q).slice(0, 300) : undefined;

  return (
    <div className="page-enter">
      <div className="page-head" style={{ marginBottom: 14 }}>
        <div>
          <h1 style={{ display: "flex", alignItems: "center", gap: 8 }}>
            مشاور هوشمند
            <span className="badge badge-violet">
              <Sparkles size={11} /> تحلیل مبتنی بر داده
            </span>
          </h1>
          <p className="desc">
            پرسش‌های خود را به فارسی بپرسید؛ مشاور با تکیه بر داده‌های همین مزرعه، استاندارد رشد نژاد و محاسبات اقتصادی
            پاسخ می‌دهد.
          </p>
        </div>
      </div>

      <div className="chat-shell">
        <ChatPanel greeting={greeting} quickQuestions={Q_CHIPS} initialQuestion={initialQuestion} />

        <aside className="side-panel">
          <div className="card">
            <div className="card-head">
              <div className="card-title">
                <Bird size={15} style={{ color: "var(--brand)" }} />
                تصویر داده‌های امروز
              </div>
            </div>
            <div className="card-body" style={{ paddingTop: 8 }}>
              {o.activeMetrics.length === 0 ? (
                <p className="small muted">دوره فعالی وجود ندارد.</p>
              ) : (
                o.activeMetrics.map((m) => (
                  <div key={m.cycle.id} style={{ padding: "9px 0", borderBottom: "1px dashed var(--line)" }}>
                    <div className="row-between" style={{ fontSize: 12 }}>
                      <b>{m.cycle.name}</b>
                      <span className="badge badge-gray tiny">روز {num(m.ageDays)}</span>
                    </div>
                    <div className="row-between tiny muted" style={{ marginTop: 3 }}>
                      <span>
                        {num(m.liveBirds)} قطعه · {num(m.currentWeightG)}g
                      </span>
                      <span className={m.weightVsStdPct >= 0 ? "pos" : "neg"}>
                        {m.weightVsStdPct >= 0 ? "+" : "−"}
                        {num(Math.abs(m.weightVsStdPct), 1)}٪
                      </span>
                    </div>
                  </div>
                ))
              )}
              <div className="kv-list mt-8">
                <div className="kv">
                  <span className="k" style={{ display: "flex", gap: 5, alignItems: "center" }}>
                    <Wheat size={12} /> قیمت دان
                  </span>
                  <span className="v num">{num(settings.feed_price)} تومان</span>
                </div>
                <div className="kv">
                  <span className="k" style={{ display: "flex", gap: 5, alignItems: "center" }}>
                    <TrendingUp size={12} /> قیمت بازار
                  </span>
                  <span className="v num">{num(settings.market_price)} تومان</span>
                </div>
                <div className="kv">
                  <span className="k">تلفات دوره‌های فعال</span>
                  <span className="v num">{pct(o.mortalityPctWeighted)}</span>
                </div>
              </div>
              <Link href="/settings" className="btn btn-outline btn-sm btn-block mt-14">
                به‌روزرسانی قیمت‌ها
                <ArrowLeft size={13} />
              </Link>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <div className="card-title">
                <BrainCircuit size={15} style={{ color: "var(--violet)" }} />
                مشاور چگونه تحلیل می‌کند؟
              </div>
            </div>
            <div className="card-body" style={{ paddingTop: 8 }}>
              <ul className="small muted" style={{ paddingInlineStart: 16, lineHeight: 2, margin: 0 }}>
                <li>مقایسه وزن و مصرف دان با استاندارد مرجع نژاد گوشتی</li>
                <li>محاسبه ضریب تبدیل، بهای تمام‌شده و نقطه سربه‌سر</li>
                <li>تحلیل الگوی تلفات، دما و نسبت آب به دان</li>
                <li>پیش‌بینی سود پایان دوره و تحلیل حساسیت به قیمت</li>
              </ul>
              <div className="divider" />
              <div className="row" style={{ gap: 6, alignItems: "flex-start" }}>
                <Database size={13} style={{ color: "var(--brand)", marginTop: 4 }} />
                <span className="tiny muted">
                  پردازش به‌صورت محلی و روی همین دستگاه انجام می‌شود؛ داده‌های مزرعه به سرور بیرونی ارسال نمی‌شود.
                </span>
              </div>
            </div>
          </div>

          <div className="card card-pad" style={{ background: "var(--amber-soft)", borderColor: "#f0dfb5" }}>
            <div className="row" style={{ gap: 6, alignItems: "flex-start" }}>
              <ShieldQuestion size={15} style={{ color: "var(--amber)", marginTop: 3 }} />
              <div>
                <b style={{ fontSize: 12 }}>یادآوری مهم</b>
                <p className="tiny" style={{ color: "#7a6027", lineHeight: 1.9, marginTop: 3 }}>
                  این توصیه‌ها تحلیلی و آموزشی است و جای معاینه دامپزشک را نمی‌گیرد. در موارد تلفات ناگهانی یا بیماری
                  واگیر، با دامپزشک تماس بگیرید.
                </p>
              </div>
            </div>
          </div>

          <div className="card card-pad">
            <div className="row" style={{ gap: 6, marginBottom: 8 }}>
              <Wand2 size={14} style={{ color: "var(--brand)" }} />
              <b style={{ fontSize: 12 }}>پرسش‌های پرتکرار</b>
            </div>
            <div className="row wrap" style={{ gap: 6 }}>
              {Q_CHIPS.map((q) => (
                <Link key={q} href={`/assistant?q=${encodeURIComponent(q)}`} className="chip">
                  {q}
                </Link>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
