import type { Metadata, Viewport } from "next";
import MobileTabBar from "@/components/mobile/MobileTabBar";
import { getSettings } from "@/lib/db";
import { todayJalaliLong, nowTimeFa } from "@/lib/jalali";

export const metadata: Metadata = {
  title: "اپلیکیشن مرغ‌یار",
  description: "نسخه موبایل مرغ‌یار برای ثبت سریع آمار روزانه و تصمیم‌گیری در سالن",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#10483a",
  viewportFit: "cover",
};

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  const settings = getSettings();
  return (
    <div className="m-app">
      <header className="m-topbar">
        <div className="m-farm">{settings.farm_name}</div>
        <div className="m-date">
          <span>{todayJalaliLong()}</span>
          <span style={{ opacity: 0.5 }}>•</span>
          <span>ساعت {nowTimeFa()}</span>
        </div>
      </header>
      <div className="m-body">{children}</div>
      <MobileTabBar />
    </div>
  );
}
