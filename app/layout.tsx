import type { Metadata, Viewport } from "next";
import "./globals.css";
import PwaBridge from "@/components/mobile/PwaBridge";

export const metadata: Metadata = {
  title: {
    default: "مرغ‌یار | مدیریت هوشمند پرورش مرغ گوشتی",
    template: "%s | مرغ‌یار",
  },
  description:
    "سیستم یکپارچه مدیریت چرخه پرورش مرغ گوشتی: ثبت روزانه، هزینه‌ها، فروش و مشاور هوشمند برای تصمیم‌گیری مرغدار",
  applicationName: "مرغ‌یار",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "مرغ‌یار", statusBarStyle: "default" },
  icons: {
    icon: [
      { url: "/icons/favicon-96.png", sizes: "96x96", type: "image/png" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#0f3b30",
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <body>
        {children}
        <PwaBridge />
      </body>
    </html>
  );
}
