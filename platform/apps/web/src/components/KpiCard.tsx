import type { Kpi } from "../lib/kpi";

const TONE = {
  good: { ring: "border-brand-500/40", head: "text-brand-700", dot: "bg-brand-500", bg: "bg-brand-50/60" },
  warn: { ring: "border-warn-500/40", head: "text-warn-700", dot: "bg-warn-500", bg: "bg-warn-50/60" },
  bad: { ring: "border-danger-500/40", head: "text-danger-700", dot: "bg-danger-500", bg: "bg-danger-50/60" },
  neutral: { ring: "border-line", head: "text-ink", dot: "bg-muted", bg: "bg-white" },
} as const;

/**
 * کارت شاخص: یک عدد بزرگ، یک واحد، یک مرجع مقایسه.
 * برای «کمترین آموزش»: عنوان بالا، عدد درشت، و جمله‌ی راهنما زیر آن — بدون
 * اصطلاح تخصصی و بدون نیاز به باز کردن صفحه دیگر.
 */
export function KpiCard({ kpi }: { kpi: Kpi }) {
  const tone = TONE[kpi.tone];
  const deltaLabel =
    kpi.deltaPct === null
      ? null
      : `${kpi.deltaPct > 0 ? "▲" : kpi.deltaPct < 0 ? "▼" : "•"} ${Math.abs(Number(kpi.deltaPct.toFixed(1)))
          .toLocaleString("fa-IR", { maximumFractionDigits: 1 })}٪`;

  return (
    <article className={`card border ${tone.ring} p-4`} aria-label={kpi.title}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-muted">{kpi.title}</h3>
        <span className={`h-2.5 w-2.5 rounded-full ${tone.dot}`} title={kpi.help} aria-hidden />
      </div>

      <p className={`mt-2 flex items-baseline gap-1 ${tone.head}`}>
        <span className="num text-3xl font-extrabold leading-none">{kpi.value}</span>
        {deltaLabel ? <span className="text-xs font-bold opacity-80">{deltaLabel}</span> : null}
      </p>
      <p className="mt-1 text-xs text-muted">{kpi.unit}</p>

      <p className={`mt-3 rounded-lg ${tone.bg} px-2 py-1.5 text-xs leading-5 text-ink/80`}>{kpi.hint}</p>
      <p className="mt-2 text-[11px] leading-5 text-muted">{kpi.help}</p>
    </article>
  );
}
