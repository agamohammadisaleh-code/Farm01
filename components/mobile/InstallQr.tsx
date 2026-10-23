"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Smartphone, Copy, Check } from "lucide-react";

/** کارت دعوت به نصب اپ موبایل با کد QR از نشانی همین سرور */
export default function InstallQr() {
  const [url, setUrl] = useState("");
  const [svg, setSvg] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const target = `${window.location.origin}/m`;
    setUrl(target);
    QRCode.toString(target, { type: "svg", margin: 1, width: 168, errorCorrectionLevel: "M", color: { dark: "#0f3b30", light: "#ffffff" } })
      .then(setSvg)
      .catch(() => setSvg(""));
  }, []);

  return (
    <div className="card card-pad">
      <div className="row" style={{ gap: 8, marginBottom: 10 }}>
        <span className="stat-icon" style={{ background: "var(--brand-soft)", color: "var(--brand)" }}>
          <Smartphone size={16} />
        </span>
        <div>
          <h3>اپلیکیشن موبایل مرغ‌یار</h3>
          <div className="tiny muted">نصب روی گوشی با پشتیبانی آفلاین و ثبت سریع آمار</div>
        </div>
      </div>

      <div className="row wrap" style={{ gap: 14, alignItems: "center" }}>
        <div
          style={{
            width: 132,
            height: 132,
            borderRadius: 14,
            border: "1px solid var(--line)",
            padding: 6,
            background: "#fff",
            flex: "0 0 132px",
            display: "grid",
            placeItems: "center",
          }}
          aria-label="کد QR برای باز کردن نسخه موبایل"
        >
          {svg ? (
            <div style={{ width: 118, height: 118 }} dangerouslySetInnerHTML={{ __html: svg }} />
          ) : (
            <span className="tiny muted">در حال ساخت…</span>
          )}
        </div>
        <div style={{ flex: "1 1 170px", minWidth: 0 }}>
          <p className="small muted" style={{ lineHeight: 1.9 }}>
            با دوربین گوشی این کد را اسکن کنید یا نشانی زیر را باز کنید. سپس برنامه را از منوی مرورگر «به صفحه اصلی
            اضافه» کنید.
          </p>
          <div
            className="row"
            style={{
              gap: 6,
              marginTop: 8,
              background: "var(--surface-2)",
              border: "1px solid var(--line)",
              borderRadius: 9,
              padding: "6px 9px",
              direction: "ltr",
              justifyContent: "space-between",
            }}
          >
            <code style={{ fontSize: 10.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{url || "…"}</code>
            <button
              className="btn btn-ghost btn-sm"
              style={{ height: 26, padding: "0 8px" }}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(url);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1600);
                } catch {
                  /* ignore */
                }
              }}
              aria-label="کپی نشانی"
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
