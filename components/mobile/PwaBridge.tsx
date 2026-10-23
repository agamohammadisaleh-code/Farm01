"use client";

import { useEffect, useState } from "react";
import { WifiOff, Download, X } from "lucide-react";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice?: Promise<{ outcome: string }> };

/** ثبت سرویس‌ورکر + نمایش وضعیت آفلاین + دعوت به نصب اپ */
export default function PwaBridge() {
  const [offline, setOffline] = useState(false);
  const [installEvt, setInstallEvt] = useState<BIPEvent | null>(null);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/m/sw.js", { scope: "/" }).catch(() => {
        /* ثبت ناموفق — برنامه به کار خود ادامه می‌دهد */
      });
    }

    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);

    const onInstall = (e: Event) => {
      e.preventDefault();
      setInstallEvt(e as BIPEvent);
      setDismissed(localStorage.getItem("farm01-install-dismissed") === "1");
    };
    window.addEventListener("beforeinstallprompt", onInstall);

    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
      window.removeEventListener("beforeinstallprompt", onInstall);
    };
  }, []);

  return (
    <>
      {offline ? (
        <div
          role="status"
          style={{
            position: "fixed",
            top: 0,
            insetInline: 0,
            zIndex: 400,
            background: "#b45309",
            color: "#fff",
            fontSize: 12,
            padding: "6px 12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <WifiOff size={13} />
          اتصال اینترنت قطع است — ثبت‌های جدید پس از وصل شدن ارسال می‌شوند
        </div>
      ) : null}

      {installEvt && !dismissed && !offline ? (
        <div
          style={{
            position: "fixed",
            bottom: "calc(env(safe-area-inset-bottom) + 74px)",
            insetInline: 14,
            zIndex: 390,
            background: "#0f3b30",
            color: "#eaf6ef",
            borderRadius: 14,
            padding: "11px 13px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            boxShadow: "var(--shadow-lg)",
            maxWidth: 460,
            margin: "0 auto",
          }}
        >
          <Download size={17} />
          <div style={{ flex: 1, fontSize: 12, lineHeight: 1.7 }}>
            مرغ‌یار را روی گوشی نصب کنید تا بدون مرورگر و با سرعت بیشتر باز شود.
          </div>
          <button
            className="btn btn-sm"
            style={{ background: "#e9f7c9", color: "#0c3a2c", height: 32 }}
            onClick={async () => {
              await installEvt.prompt();
              setInstallEvt(null);
            }}
          >
            نصب
          </button>
          <button
            aria-label="بستن"
            className="btn btn-sm"
            style={{ background: "transparent", color: "#9dc4b2", width: 30, padding: 0 }}
            onClick={() => {
              localStorage.setItem("farm01-install-dismissed", "1");
              setDismissed(true);
            }}
          >
            <X size={15} />
          </button>
        </div>
      ) : null}
    </>
  );
}
