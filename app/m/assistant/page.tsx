import { Sparkles, Bot, ShieldQuestion } from "lucide-react";
import { getSettings } from "@/lib/db";
import { farmOverview } from "@/lib/metrics";
import { Q_CHIPS } from "@/lib/ai";
import { compactToman, num } from "@/lib/format";
import ChatPanel from "@/components/assistant/ChatPanel";

export const dynamic = "force-dynamic";

export default async function MobileAssistant({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const settings = getSettings();
  const o = farmOverview(settings);
  const q = sp.q ? String(sp.q).slice(0, 300) : undefined;

  const greeting = o.activeMetrics.length
    ? [
        "### سلام 👋",
        `**${num(o.liveBirds)} قطعه** در ${num(o.activeMetrics.length)} دوره فعال دارید.`,
        `- سود پیش‌بینی‌شده: **${compactToman(o.activeProjectedProfit)}**`,
        `- تلفات دوره‌های فعال: ${num(o.mortalityPctWeighted, 1)}٪`,
        o.alerts.filter((a) => a.severity === "critical").length
          ? `- 🔴 ${o.alerts.filter((a) => a.severity === "critical").length} هشدار بحرانی نیاز به بررسی دارد.`
          : "- ✅ شاخص‌های بحرانی وجود ندارد.",
        "> چه چیزی می‌خواهید بررسی کنیم؟",
      ].join("\n")
    : "### سلام 👋\nدوره فعالی برای تحلیل وجود ندارد. پس از ثبت دوره، درباره فروش، دان، تلفات و سود راهنمایی می‌کنم.";

  return (
    <>
      <h1 className="m-h1">
        <Sparkles size={19} /> مشاور هوشمند
      </h1>
      <div className="m-sub">پرسش فارسی خود را بنویسید؛ پاسخ بر پایه داده‌های همین مزرعه محاسبه می‌شود.</div>

      <div style={{ height: "min(64vh, 520px)", display: "flex" }}>
        <ChatPanel greeting={greeting} quickQuestions={Q_CHIPS} initialQuestion={q} />
      </div>

      <div className="m-card" style={{ display: "flex", gap: 8, alignItems: "flex-start", background: "#fdf8ec", borderColor: "#f0e2c2" }}>
        <ShieldQuestion size={15} style={{ color: "var(--amber)", marginTop: 2, flex: "0 0 15px" }} />
        <div style={{ fontSize: 10.8, lineHeight: 1.9, color: "#7a6027" }}>
          توصیه‌ها تحلیلی و آموزشی است و جای معاینه دامپزشک را نمی‌گیرد. پردازش به‌صورت محلی انجام می‌شود.
        </div>
      </div>

      <div className="m-card" style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
        <Bot size={15} style={{ color: "var(--brand)", marginTop: 2, flex: "0 0 15px" }} />
        <div style={{ fontSize: 10.8, lineHeight: 1.9, color: "var(--muted)" }}>
          نمونه پرسش‌ها: «الان بفروشم یا صبر کنم؟»، «چقدر دان سفارش بدهم؟»، «علت افزایش تلفات چیست؟»، «کدام هزینه‌ها را کم
          کنم؟»
        </div>
      </div>
    </>
  );
}
