import Link from "next/link";
import { Bird, LayoutDashboard, SearchX } from "lucide-react";

export default function NotFound() {
  return (
    <div className="page-enter" style={{ display: "grid", placeItems: "center", minHeight: "60vh" }}>
      <div className="card" style={{ maxWidth: 460, textAlign: "center", padding: "40px 28px" }}>
        <div className="empty-icon" style={{ width: 60, height: 60 }}>
          <SearchX size={26} />
        </div>
        <h2 style={{ marginBottom: 6 }}>این صفحه پیدا نشد</h2>
        <p className="small muted" style={{ lineHeight: 1.9, marginBottom: 18 }}>
          ممکن است دوره مورد نظر حذف شده باشد یا نشانی را اشتباه وارد کرده باشید. از داشبورد می‌توانید همه دوره‌ها را
          ببینید.
        </p>
        <div className="row" style={{ gap: 8, justifyContent: "center" }}>
          <Link href="/" className="btn btn-primary">
            <LayoutDashboard size={15} />
            بازگشت به داشبورد
          </Link>
          <Link href="/cycles" className="btn btn-outline">
            <Bird size={15} />
            دوره‌های پرورش
          </Link>
        </div>
      </div>
    </div>
  );
}
