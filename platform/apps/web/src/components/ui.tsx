import React from "react";

export function Card({
  children,
  className = "",
  as: Tag = "section",
}: {
  children: React.ReactNode;
  className?: string;
  as?: "section" | "div" | "article";
}) {
  return <Tag className={`card p-5 ${className}`}>{children}</Tag>;
}

export function SectionTitle({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h2 className="text-xl font-extrabold text-ink">{title}</h2>
        {hint ? <p className="mt-1 text-sm leading-6 text-muted">{hint}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "good" | "warn" | "bad" | "neutral" | "info";
  children: React.ReactNode;
}) {
  const map = {
    good: "bg-brand-50 text-brand-700",
    warn: "bg-warn-50 text-warn-700",
    bad: "bg-danger-50 text-danger-700",
    info: "bg-info-50 text-info-500",
    neutral: "bg-paper text-muted",
  } as const;
  return <span className={`chip ${map[tone]}`}>{children}</span>;
}

export function Loading({ label = "در حال بارگذاری…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-muted" role="status" aria-live="polite">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      <span>{label}</span>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="card border-danger-500/30 bg-danger-50 p-6 text-center" role="alert">
      <p className="text-lg font-bold text-danger-700">{message}</p>
      <p className="mt-1 text-sm text-danger-700/80">اگر تکرار شد، اتصال سرور را بررسی کنید.</p>
      {onRetry ? (
        <button type="button" className="btn-ghost mt-4" onClick={onRetry}>
          تلاش دوباره
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({ title, hint, icon = "🌱" }: { title: string; hint?: string; icon?: string }) {
  return (
    <div className="rounded-xl2 border border-dashed border-line bg-white/60 px-6 py-12 text-center">
      <div className="text-4xl" aria-hidden>
        {icon}
      </div>
      <p className="mt-3 text-lg font-bold text-ink">{title}</p>
      {hint ? <p className="mt-1 text-sm text-muted">{hint}</p> : null}
    </div>
  );
}

export function NoAccess({ message }: { message: string }) {
  return (
    <div className="mx-auto mt-10 max-w-xl">
      <Card className="text-center">
        <div className="text-4xl" aria-hidden>
          🔒
        </div>
        <h2 className="mt-3 text-xl font-extrabold">دسترسی به این صفحه ندارید</h2>
        <p className="mt-2 text-muted">{message}</p>
        <a className="btn-primary mt-5" href="/">
          رفتن به صفحه امروز
        </a>
      </Card>
    </div>
  );
}
