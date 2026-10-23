import { num } from "@/lib/format";

export default function BarList({
  rows,
  format = (n: number) => num(n),
  showShare = true,
}: {
  rows: { key: string; label: string; value: number; color: string; hint?: string }[];
  format?: (n: number) => string;
  showShare?: boolean;
}) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
      {rows.map((r) => (
        <div key={r.key}>
          <div className="row-between" style={{ fontSize: 11.5, marginBottom: 4 }}>
            <span className="row" style={{ gap: 6 }}>
              <span style={{ width: 7, height: 7, borderRadius: 2, background: r.color }} />
              {r.label}
              {r.hint ? <span className="muted tiny">{r.hint}</span> : null}
            </span>
            <span className="row" style={{ gap: 8 }}>
              <span className="bold num">{format(r.value)}</span>
              {showShare ? <span className="muted tiny num">{num((r.value / (max || 1)) * 100, 0)}٪</span> : null}
            </span>
          </div>
          <div className="progress" style={{ height: 6, background: "#f2f0e8" }}>
            <span style={{ width: `${(r.value / max) * 100}%`, background: r.color }} />
          </div>
        </div>
      ))}
    </div>
  );
}
