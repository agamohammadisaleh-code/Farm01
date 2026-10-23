import Link from "next/link";
import { AlertTriangle, CircleCheck, Info, ArrowLeft } from "lucide-react";
import type { Insight } from "@/lib/metrics";

const sevIcon: Record<string, React.ReactNode> = {
  critical: <AlertTriangle size={14} />,
  warning: <AlertTriangle size={14} />,
  info: <Info size={14} />,
  good: <CircleCheck size={14} />,
};

export default function InsightRow({ a, href }: { a: Insight; href?: string }) {
  return (
    <div className={`alert-item ${a.severity}`}>
      <span className="a-icon">{sevIcon[a.severity]}</span>
      <div style={{ minWidth: 0 }}>
        <div className="alert-title">{a.title}</div>
        <div className="alert-text">{a.detail}</div>
        <div className="alert-rec">{a.recommendation}</div>
        {a.action ? (
          <Link href={href ?? a.action.href} className="alert-link">
            {a.action.label}
            <ArrowLeft size={12} />
          </Link>
        ) : null}
      </div>
    </div>
  );
}
