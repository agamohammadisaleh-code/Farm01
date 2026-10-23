"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Bird, Plus, Sparkles, Menu } from "lucide-react";

const TABS = [
  { href: "/m", label: "خانه", icon: Home, exact: true },
  { href: "/m/cycles", label: "دوره‌ها", icon: Bird },
  { href: "/m/quick", label: "ثبت آمار", icon: Plus, center: true },
  { href: "/m/assistant", label: "مشاور", icon: Sparkles },
  { href: "/m/more", label: "بیشتر", icon: Menu },
];

export default function MobileTabBar() {
  const pathname = usePathname();
  return (
    <nav className="m-tabbar" aria-label="ناوبری اصلی موبایل">
      {TABS.map((t) => {
        const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
        const Icon = t.icon;
        if (t.center) {
          return (
            <Link key={t.href} href={t.href} aria-label={t.label} style={{ textAlign: "center" }}>
              <span className="m-fab">
                <Icon size={25} />
              </span>
              <span style={{ fontSize: 9.8, color: "var(--brand)", fontWeight: 700 }}>{t.label}</span>
            </Link>
          );
        }
        return (
          <Link key={t.href} href={t.href} className={`m-tab${active ? " active" : ""}`} aria-current={active ? "page" : undefined}>
            <span className="m-tab-icon">
              <Icon size={19} />
            </span>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
