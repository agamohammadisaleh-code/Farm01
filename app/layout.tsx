import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import { getSettings } from "@/lib/db";
import { getCycles } from "@/lib/metrics";

export const metadata: Metadata = {
  title: "مرغ‌یار | مدیریت هوشمند پرورش مرغ گوشتی",
  description:
    "سیستم یکپارچه مدیریت چرخه پرورش مرغ گوشتی: ثبت روزانه، هزینه‌ها، فروش و مشاور هوشمند برای تصمیم‌گیری مرغدار",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const settings = getSettings();
  const cycles = getCycles();
  const activeCount = cycles.filter((c) => c.status === "active").length;

  return (
    <html lang="fa" dir="rtl">
      <body>
        <div className="app-shell">
          <Sidebar farmName={settings.farm_name} activeCount={activeCount} />
          <div className="main-col">
            <Topbar farmName={settings.farm_name} />
            <main className="content">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
