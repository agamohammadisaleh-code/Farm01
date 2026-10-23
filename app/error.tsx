"use client";

import Link from "next/link";
import { AlertTriangle, RotateCcw, LayoutDashboard } from "lucide-react";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "60vh" }}>
      <div className="card" style={{ maxWidth: 460, textAlign: "center", padding: "40px 28px" }}>
        <div className="empty-icon" style={{ width: 60, height: 60, background: "var(--red-soft)", color: "var(--red)" }}>
          <AlertTriangle size={26} />
        </div>
        <h2 style={{ marginBottom: 6 }}>خطایی رخ داد</h2>
        <p className="small muted" style={{ lineHeight: 1.9, marginBottom: 18 }}>
          در پردازش این صفحه مشکلی پیش آمد. می‌توانید دوباره تلاش کنید؛ داده‌های ثبت‌شده شما محفوظ است.
        </p>
        <div className="row" style={{ gap: 8, justifyContent: "center" }}>
          <button className="btn btn-primary" onClick={() => reset()}>
            <RotateCcw size={15} />
            تلاش دوباره
          </button>
          <Link href="/" className="btn btn-outline">
            <LayoutDashboard size={15} />
            داشبورد
          </Link>
        </div>
      </div>
    </div>
  );
}
