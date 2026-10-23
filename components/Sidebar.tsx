"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Bird, Sparkles, ChartPie, Settings, Wheat, Egg } from "lucide-react";
import type { ReactNode } from "react";

const NAV: { href: string; label: string; icon: ReactNode }[] = [
  { href: "/", label: "داشبورد", icon: <LayoutDashboard size={17} /> },
  { href: "/cycles", label: "دوره‌های پرورش", icon: <Bird size={17} /> },
  { href: "/assistant", label: "مشاور هوشمند", icon: <Sparkles size={17} /> },
  { href: "/reports", label: "گزارش‌ها", icon: <ChartPie size={17} /> },
  { href: "/settings", label: "تنظیمات", icon: <Settings size={17} /> },
];

export default function Sidebar({
  farmName,
  activeCount,
}: {
  farmName: string;
  activeCount: number;
}) {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      <Link href="/" className="brand">
        <span className="brand-mark">
          <Wheat size={22} />
        </span>
        <span>
          <div className="brand-title">مرغ‌یار</div>
          <div className="brand-sub">مدیریت هوشمند مرغ گوشتی</div>
        </span>
      </Link>

      <div className="nav-group-label">مدیریت مزرعه</div>
      <nav style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {NAV.map((item) => {
          const active =
            item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link key={item.href} href={item.href} className={`nav-item${active ? " active" : ""}`}>
              {item.icon}
              <span className="nav-text">{item.label}</span>
              {item.href === "/cycles" && activeCount > 0 ? <span className="nav-badge">{activeCount}</span> : null}
              {item.href === "/assistant" ? (
                <span className="nav-badge" style={{ background: "rgba(190,240,150,.22)", color: "#d9f5b8" }}>
                  AI
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <div className="farm-chip">
          <span className="farm-avatar">
            <Egg size={16} />
          </span>
          <span>
            <div style={{ color: "#eaf5ef", fontSize: 12, fontWeight: 600 }}>{farmName}</div>
            <div style={{ fontSize: 10.5, color: "#8fb5a4" }}>{activeCount} دوره فعال</div>
          </span>
        </div>
        <div style={{ fontSize: 10, color: "#7ea596", lineHeight: 1.6 }}>
          نسخه ۱٫۰ — داده‌ها روی همین دستگاه ذخیره می‌شوند
        </div>
      </div>
    </aside>
  );
}
