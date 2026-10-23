import Link from "next/link";
import { Plus, Sparkles, CalendarDays } from "lucide-react";
import { todayJalaliLong } from "@/lib/jalali";

export default function Topbar({ farmName }: { farmName: string }) {
  return (
    <header className="topbar">
      <div className="topbar-title">
        <span className="title">{farmName}</span>
        <span className="sub" style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <CalendarDays size={12} />
          {todayJalaliLong()}
        </span>
      </div>
      <div className="topbar-actions">
        <Link href="/assistant" className="btn btn-outline btn-sm no-print">
          <Sparkles size={14} />
          پرسش از مشاور
        </Link>
        <Link href="/cycles/new" className="btn btn-primary btn-sm no-print">
          <Plus size={15} />
          دوره جدید
        </Link>
      </div>
    </header>
  );
}
