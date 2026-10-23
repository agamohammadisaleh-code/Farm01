import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardPlus, ArrowLeft, Bird } from "lucide-react";
import { getSettings } from "@/lib/db";
import { getCycles, loadCycleMetrics } from "@/lib/metrics";
import { num } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function QuickEntryPage() {
  const settings = getSettings();
  const active = getCycles().filter((c) => c.status === "active");

  // اگر فقط یک دوره فعال وجود دارد، مستقیم به فرم ثبت می‌رویم
  if (active.length === 1) redirect(`/m/log/${active[0].id}`);

  return (
    <>
      <h1 className="m-h1">
        <ClipboardPlus size={19} /> ثبت سریع آمار
      </h1>
      <p className="m-sub">سالن مورد نظر را انتخاب کنید؛ فرم ثبت با مقادیر پیشنهادی آماده می‌شود.</p>

      {active.length === 0 ? (
        <div className="m-card m-empty">
          <div className="empty-icon" style={{ width: 52, height: 52 }}>
            <Bird size={22} />
          </div>
          <h3>دوره فعالی وجود ندارد</h3>
          <p className="m-sub">ابتدا یک دوره پرورش ایجاد کنید.</p>
          <Link href="/cycles/new" className="btn btn-primary btn-sm" style={{ marginTop: 12 }}>
            دوره جدید
          </Link>
        </div>
      ) : (
        active.map((c) => {
          const m = loadCycleMetrics(c.id, settings);
          return (
            <Link key={c.id} href={`/m/log/${c.id}`} className="m-card" style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 13,
                  background: "var(--brand-soft)",
                  color: "var(--brand)",
                  display: "grid",
                  placeItems: "center",
                  flex: "0 0 42px",
                }}
              >
                <ClipboardPlus size={19} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="m-cycle-title">{c.name}</div>
                <div className="m-cycle-meta">
                  {c.house} · روز {num(m?.ageDays ?? 1)} · {num(m?.liveBirds ?? c.initial_count)} قطعه زنده
                </div>
              </div>
              <ArrowLeft size={16} style={{ color: "var(--muted)" }} />
            </Link>
          );
        })
      )}
    </>
  );
}
