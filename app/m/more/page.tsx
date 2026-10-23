import Link from "next/link";
import {
  Monitor,
  Settings,
  Download,
  Database,
  ShieldCheck,
  Smartphone,
  FileSpreadsheet,
  ChartPie,
  Info,
  Wheat,
} from "lucide-react";
import { getSettings } from "@/lib/db";
import { num } from "@/lib/format";

export const dynamic = "force-dynamic";

const ITEMS = [
  { href: "/", label: "داشبورد کامل (نسخه وب)", icon: Monitor, desc: "گزارش‌ها، نمودارها و مدیریت کامل" },
  { href: "/reports", label: "گزارش‌ها و تحلیل عملکرد", icon: ChartPie, desc: "عملکرد دوره‌ها و بنچمارک" },
  { href: "/settings", label: "تنظیمات قیمت‌ها و اهداف", icon: Settings, desc: "قیمت بازار، دان و وزن هدف" },
  { href: "/cycles/new", label: "ثبت دوره پرورش جدید", icon: Wheat, desc: "جوجه‌ریزی و شروع چرخه" },
];

export default async function MobileMore() {
  const settings = getSettings();
  return (
    <>
      <h1 className="m-h1">
        <Smartphone size={19} /> بیشتر
      </h1>

      <div className="m-card" style={{ background: "linear-gradient(150deg,#10483a,#0c3a2c)", color: "#eaf6ef", border: "none" }}>
        <div style={{ fontSize: 13, fontWeight: 800 }}>{settings.farm_name}</div>
        <div style={{ fontSize: 11, color: "#a9cbbb", marginTop: 2 }}>
          نسخه ۱٫۰ · داده‌ها روی همین دستگاه ذخیره می‌شوند
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 11 }}>
          <span className="badge" style={{ background: "rgba(255,255,255,.12)", color: "#dff3e6", fontSize: 10 }}>
            قیمت بازار {num(settings.market_price)}
          </span>
          <span className="badge" style={{ background: "rgba(255,255,255,.12)", color: "#dff3e6", fontSize: 10 }}>
            دان {num(settings.feed_price)}
          </span>
        </div>
      </div>

      <div className="m-card flush">
        {ITEMS.map((it) => {
          const Icon = it.icon;
          return (
            <Link key={it.href} href={it.href} className="m-list-row" style={{ padding: "13px 15px" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <span
                  style={{
                    width: 34,
                    height: 34,
                    flex: "0 0 34px",
                    borderRadius: 10,
                    background: "var(--brand-soft)",
                    color: "var(--brand)",
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  <Icon size={16} />
                </span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, display: "block" }}>{it.label}</span>
                  <span style={{ fontSize: 10.5, color: "var(--muted)" }}>{it.desc}</span>
                </span>
              </span>
              <span style={{ color: "var(--muted)", fontSize: 16 }}>‹</span>
            </Link>
          );
        })}
      </div>

      <div className="m-card">
        <div className="m-h2" style={{ marginBottom: 7 }}>
          <FileSpreadsheet size={14} /> خروجی داده‌ها
        </div>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
          {[
            ["logs", "ثبت روزانه"],
            ["costs", "هزینه‌ها"],
            ["sales", "فروش"],
          ].map(([t, label]) => (
            <a key={t} href={`/api/export/${t}`} className="chip">
              <Download size={12} style={{ marginInlineEnd: 4 }} />
              {label}
            </a>
          ))}
        </div>
      </div>

      <div className="m-card">
        <div className="m-h2" style={{ marginBottom: 7 }}>
          <Smartphone size={14} /> نصب روی صفحه اصلی
        </div>
        <div style={{ fontSize: 11.3, lineHeight: 2, color: "var(--ink-2)" }}>
          <b>اندروید (کروم):</b> منوی سه‌نقطه ← «افزودن به صفحه اصلی» یا «نصب برنامه»
          <br />
          <b>آیفون (سافاری):</b> دکمه اشتراک‌گذاری ← «افزودن به Home Screen»
          <br />
          پس از نصب، برنامه بدون مرورگر و با پشتیبانی از حالت آفلاین باز می‌شود.
        </div>
      </div>

      <div className="m-card">
        <div className="m-h2" style={{ marginBottom: 7 }}>
          <Database size={14} /> وضعیت داده
        </div>
        <div className="m-list-row">
          <span className="muted">محل ذخیره‌سازی</span>
          <b style={{ fontSize: 11 }}>SQLite محلی</b>
        </div>
        <div className="m-list-row">
          <span className="muted">ارسال به سرور بیرونی</span>
          <b style={{ fontSize: 11, color: "var(--brand)" }}>غیرفعال</b>
        </div>
        <div className="m-list-row">
          <span className="muted">پشتیبان‌گیری</span>
          <b style={{ fontSize: 11 }}>خروجی CSV</b>
        </div>
      </div>

      <div style={{ display: "flex", gap: 7, alignItems: "flex-start", padding: "0 4px" }}>
        <ShieldCheck size={14} style={{ color: "var(--brand)", marginTop: 2, flex: "0 0 14px" }} />
        <div style={{ fontSize: 10.5, color: "var(--muted)", lineHeight: 1.9 }}>
          برای پاک‌سازی یا بازنشانی داده‌های نمونه به صفحه{" "}
          <Link href="/settings" style={{ color: "var(--brand)", fontWeight: 700 }}>
            تنظیمات
          </Link>{" "}
          بروید. توصیه‌های مشاور جای معاینه دامپزشک را نمی‌گیرد.
        </div>
      </div>

      <div style={{ textAlign: "center", fontSize: 10, color: "var(--muted)", display: "flex", gap: 4, justifyContent: "center", alignItems: "center" }}>
        <Info size={11} /> مرغ‌یار — مدیریت هوشمند مرغداری گوشتی
      </div>
    </>
  );
}
