import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ClipboardList, Info } from "lucide-react";
import { getSettings } from "@/lib/db";
import { getCycle, getLogs, computeMetrics } from "@/lib/metrics";
import MobileQuickLog from "@/components/mobile/MobileQuickLog";
import { feedPhaseForDay, standardAt } from "@/lib/standards";
import { num } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function MobileLogPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const settings = getSettings();
  const cycle = getCycle(Number(id));
  if (!cycle) notFound();

  const logs = getLogs(cycle.id);
  const m = computeMetrics(cycle, logs, [], [], {
    marketPrice: settings.market_price,
    feedPrice: settings.feed_price,
  });
  const last = logs.at(-1);
  const suggestedFeedKg = (m.liveBirds * standardAt(m.ageDays).dailyFeedG) / 1000;
  const phase = feedPhaseForDay(m.ageDays);

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link href="/m" className="btn btn-ghost btn-sm" style={{ padding: 0 }}>
          <ArrowRight size={15} />
          بازگشت
        </Link>
        <span className="badge badge-gray" style={{ fontSize: 10 }}>
          روز {num(m.ageDays)}
        </span>
      </div>

      <div>
        <h1 className="m-h1">
          <ClipboardList size={19} /> ثبت آمار روز
        </h1>
        <div className="m-sub">{cycle.name}</div>
      </div>

      <div className="m-card" style={{ background: "var(--brand-soft)", borderColor: "#d8ebe1" }}>
        <div style={{ display: "flex", gap: 7, alignItems: "flex-start" }}>
          <Info size={14} style={{ color: "var(--brand)", marginTop: 3, flex: "0 0 14px" }} />
          <div style={{ fontSize: 11.5, lineHeight: 1.85, color: "var(--ink-2)" }}>
            مرحله دان امروز: <b>{phase}</b> · دمای هدف سالن حدود{" "}
            <b>{num(Math.max(20, 33.5 - m.ageDays * 0.33), 1)} درجه</b> · سرانه مصرف {num(m.avgDailyFeedG)} گرم
            <br />
            در صورت ثبت قبلی برای امروز، رکورد موجود به‌روزرسانی می‌شود.
          </div>
        </div>
      </div>

      <MobileQuickLog
        cycleId={cycle.id}
        liveBirds={m.liveBirds}
        suggestedFeedKg={suggestedFeedKg}
        defaultPhase={phase}
        lastMortality={0}
        lastFeedKg={last?.feed_kg ?? 0}
      />
    </>
  );
}
