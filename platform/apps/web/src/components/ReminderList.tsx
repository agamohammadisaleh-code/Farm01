import type { Reminder } from "../lib/types";
import { jalali } from "../lib/format";

const KIND_ICON: Record<string, string> = {
  vaccination: "💉",
  medication: "🧪",
  withdrawal: "⏳",
  alert: "⚠️",
  log: "📝",
  milestone: "🚚",
  stock: "🌾",
  health: "🩺",
};

const SEVERITY_STYLE = {
  critical: "border-danger-500/30 bg-danger-50/60",
  warning: "border-warn-500/30 bg-warn-50/60",
  info: "border-line bg-white",
};

/**
 * کارهای امروز و روزهای بعد، به زبان کارگر:
 * آیکون + عنوان + «تا چند روز دیگر» — بدون جدول و بدون عدد خام.
 */
export function ReminderList({ reminders, limit = 6 }: { reminders: Reminder[]; limit?: number }) {
  const sorted = [...reminders].sort((a, b) => {
    const severity = rank(a.severity) - rank(b.severity);
    if (severity !== 0) return severity;
    return (a.daysLeft ?? 99) - (b.daysLeft ?? 99);
  });

  return (
    <ul className="space-y-2">
      {sorted.slice(0, limit).map((reminder) => (
        <li
          key={reminder.id}
          className={`flex items-start gap-3 rounded-xl border p-3 ${
            SEVERITY_STYLE[reminder.severity] ?? SEVERITY_STYLE.info
          }`}
        >
          <span className="text-xl" aria-hidden>
            {KIND_ICON[reminder.kind] ?? "•"}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-extrabold text-ink">{reminder.title}</p>
            <p className="mt-0.5 text-xs leading-5 text-muted">{reminder.detail}</p>
            <p className="mt-1 text-xs font-bold text-brand-700">{dueLabel(reminder)}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function dueLabel(reminder: Reminder): string {
  if (reminder.daysLeft === null || reminder.daysLeft === undefined) {
    return reminder.due ? `موعد: ${jalali(reminder.due)}` : "";
  }
  if (reminder.daysLeft < 0) return `${Math.abs(reminder.daysLeft).toLocaleString("fa-IR")} روز گذشته — انجام نشده`;
  if (reminder.daysLeft === 0) return "همین امروز";
  return `${reminder.daysLeft.toLocaleString("fa-IR")} روز دیگر`;
}

function rank(severity: Reminder["severity"]): number {
  return severity === "critical" ? 0 : severity === "warning" ? 1 : 2;
}
