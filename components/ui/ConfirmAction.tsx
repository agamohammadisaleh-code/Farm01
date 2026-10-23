"use client";

import { useState, useTransition, type ReactNode } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";

export default function ConfirmAction({
  onConfirm,
  title,
  description,
  confirmLabel = "تأیید و حذف",
  danger = true,
  trigger,
}: {
  onConfirm: () => Promise<unknown>;
  title: string;
  description: string;
  confirmLabel?: string;
  danger?: boolean;
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const run = () => {
    startTransition(async () => {
      await onConfirm();
      setOpen(false);
    });
  };

  return (
    <>
      <span onClick={() => setOpen(true)} style={{ display: "inline-flex" }}>
        {trigger}
      </span>
      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(16,33,27,.42)",
            backdropFilter: "blur(2px)",
            display: "grid",
            placeItems: "center",
            zIndex: 300,
            padding: 16,
          }}
          onClick={() => !pending && setOpen(false)}
        >
          <div
            className="card"
            style={{ width: "min(400px, 100%)", padding: 22, boxShadow: "var(--shadow-lg)", animation: "fadeUp .18s ease both" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
              <span
                style={{
                  width: 38,
                  height: 38,
                  flex: "0 0 38px",
                  borderRadius: 11,
                  display: "grid",
                  placeItems: "center",
                  background: danger ? "var(--red-soft)" : "var(--brand-soft)",
                  color: danger ? "var(--red)" : "var(--brand)",
                }}
              >
                <AlertTriangle size={19} />
              </span>
              <div>
                <h3 style={{ fontSize: 14 }}>{title}</h3>
                <p className="small muted" style={{ marginTop: 4, lineHeight: 1.8 }}>
                  {description}
                </p>
              </div>
            </div>
            <div className="form-actions" style={{ justifyContent: "flex-end", marginTop: 18 }}>
              <button className="btn btn-outline" onClick={() => setOpen(false)} disabled={pending}>
                انصراف
              </button>
              <button className={danger ? "btn btn-danger" : "btn btn-primary"} onClick={run} disabled={pending}>
                {pending ? <Loader2 size={14} /> : null}
                {pending ? "در حال انجام…" : confirmLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
