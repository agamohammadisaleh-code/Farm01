import type { Alert } from "../lib/types";
import { Badge } from "./ui";

const SEVERITY = {
  critical: { tone: "bad" as const, label: "فوری", border: "border-danger-500/30", bg: "bg-danger-50/70" },
  warning: { tone: "warn" as const, label: "هشدار", border: "border-warn-500/30", bg: "bg-warn-50/70" },
  info: { tone: "info" as const, label: "اطلاع", border: "border-info-500/20", bg: "bg-info-50/50" },
};

/**
 * هشدارها با «چه شد» و «چه کار کنم».
 * پیام بدون اقدام، برای کارگر سالن فقط اضطراب می‌سازد؛ پس توصیه همیشه
 * نمایش داده می‌شود، نه داخل جزئیات پنهان.
 */
export function AlertList({ alerts, limit }: { alerts: Alert[]; limit?: number }) {
  const sorted = [...alerts].sort((a, b) => rank(a.severity) - rank(b.severity));
  const shown = limit ? sorted.slice(0, limit) : sorted;

  return (
    <ul className="space-y-3">
      {shown.map((alert) => {
        const meta = SEVERITY[alert.severity] ?? SEVERITY.info;
        return (
          <li key={alert.id} className={`rounded-xl2 border ${meta.border} ${meta.bg} p-4`}>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={meta.tone}>{meta.label}</Badge>
              <h3 className="text-base font-extrabold text-ink">{alert.title}</h3>
            </div>
            <p className="mt-2 text-sm leading-6 text-ink/80">{alert.detail}</p>
            {alert.recommendation ? (
              <p className="mt-2 rounded-lg bg-white/70 px-3 py-2 text-sm leading-6 text-ink">
                <span className="font-bold text-brand-700">چه کار کنم؟ </span>
                {alert.recommendation}
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function rank(severity: Alert["severity"]): number {
  return severity === "critical" ? 0 : severity === "warning" ? 1 : 2;
}
