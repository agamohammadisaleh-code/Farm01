import Link from "next/link";
import { WifiOff, RotateCcw, Home } from "lucide-react";

export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <div className="m-card m-empty" style={{ marginTop: 30 }}>
      <div className="empty-icon" style={{ width: 60, height: 60, background: "var(--surface-3)", color: "var(--muted)" }}>
        <WifiOff size={26} />
      </div>
      <h2 style={{ fontSize: 16, marginBottom: 6 }}>اتصال اینترنت قطع است</h2>
      <p className="m-sub" style={{ maxWidth: 300, margin: "0 auto" }}>
        صفحه‌هایی که قبلاً باز کرده‌اید در حالت آفلاین نمایش داده می‌شوند. برای ثبت آمار جدید، پس از وصل‌شدن اینترنت
        دوباره تلاش کنید.
      </p>
      <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16 }}>
        <Link href="/m" className="btn btn-primary btn-sm">
          <Home size={14} />
          خانه
        </Link>
        <Link href="/m/offline" className="btn btn-outline btn-sm">
          <RotateCcw size={14} />
          تلاش دوباره
        </Link>
      </div>
    </div>
  );
}
