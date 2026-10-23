import type { ReactNode } from "react";

export default function StatCard({
  label,
  value,
  unit,
  icon,
  hint,
  trend,
  tone = "green",
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  icon: ReactNode;
  hint?: ReactNode;
  trend?: { value: string; dir: "up" | "down" | "flat" };
  tone?: "green" | "amber" | "blue" | "red" | "violet";
}) {
  const tones: Record<string, { bg: string; fg: string }> = {
    green: { bg: "var(--brand-soft)", fg: "var(--brand)" },
    amber: { bg: "var(--amber-soft)", fg: "var(--amber)" },
    blue: { bg: "var(--blue-soft)", fg: "var(--blue)" },
    red: { bg: "var(--red-soft)", fg: "var(--red)" },
    violet: { bg: "#efecfb", fg: "var(--violet)" },
  };
  const t = tones[tone];
  return (
    <div className="card stat">
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        <span className="stat-icon" style={{ background: t.bg, color: t.fg }}>
          {icon}
        </span>
      </div>
      <div className="stat-value">
        {value}
        {unit ? <small>{unit}</small> : null}
      </div>
      <div className="stat-foot">
        {trend ? <span className={`trend ${trend.dir}`}>{trend.value}</span> : null}
        {hint}
      </div>
    </div>
  );
}
