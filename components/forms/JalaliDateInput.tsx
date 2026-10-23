"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import {
  JALALI_MONTHS,
  addDaysIso,
  faDigits,
  formatJalali,
  isoToJalali,
  jalaliMonthLength,
  jalaliToIso,
  pad2,
  todayIso,
  toGregorian,
} from "@/lib/jalali";

const WEEK = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"];

export default function JalaliDateInput({
  name,
  defaultValue,
  required,
  placeholder = "انتخاب تاریخ",
}: {
  name: string;
  defaultValue?: string;
  required?: boolean;
  placeholder?: string;
}) {
  const [value, setValue] = useState(defaultValue || todayIso());
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const today = todayIso();
  const j = isoToJalali(value);

  const [view, setView] = useState({ jy: j.jy, jm: j.jm });

  useEffect(() => {
    setView({ jy: j.jy, jm: j.jm });
  }, [j.jy, j.jm]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const grid = useMemo(() => {
    const len = jalaliMonthLength(view.jy, view.jm);
    const firstIso = jalaliToIso(view.jy, view.jm, 1);
    const g = toGregorian(view.jy, view.jm, 1);
    const weekday = new Date(Date.UTC(g.gy, g.gm - 1, g.gd)).getUTCDay();
    const offset = (weekday + 1) % 7;
    const cells: (number | null)[] = Array.from({ length: offset }, () => null);
    for (let d = 1; d <= len; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return { cells, firstIso };
  }, [view]);

  const move = (delta: number) => {
    let jm = view.jm + delta;
    let jy = view.jy;
    if (jm < 1) {
      jm = 12;
      jy -= 1;
    }
    if (jm > 12) {
      jm = 1;
      jy += 1;
    }
    setView({ jy, jm });
  };

  const select = (d: number) => {
    setValue(jalaliToIso(view.jy, view.jm, d));
    setOpen(false);
  };

  const isToday = (d: number) => jalaliToIso(view.jy, view.jm, d) === today;

  return (
    <div ref={boxRef} style={{ position: "relative" }}>
      <input type="hidden" name={name} value={value} />
      <button
        type="button"
        className="input"
        onClick={() => setOpen((o) => !o)}
        style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", textAlign: "right" }}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <CalendarDays size={15} style={{ color: "var(--brand)", flex: "0 0 15px" }} />
        <span style={{ flex: 1, fontWeight: value ? 600 : 400, color: value ? "inherit" : "#a8b1ac" }}>
          {value ? formatJalali(value) : placeholder}
        </span>
        {value && !required ? (
          <span
            role="button"
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation();
              setValue("");
            }}
            style={{ color: "var(--muted)", display: "grid", placeItems: "center" }}
          >
            <X size={13} />
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            insetInlineStart: 0,
            zIndex: 70,
            background: "#fff",
            border: "1px solid var(--line-strong)",
            borderRadius: 14,
            boxShadow: "var(--shadow-lg)",
            padding: 12,
            width: 278,
            animation: "fadeUp .16s ease both",
          }}
        >
          <div className="row-between" style={{ marginBottom: 8 }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => move(1)} aria-label="ماه بعد">
              <ChevronRight size={16} />
            </button>
            <div style={{ fontWeight: 700, fontSize: 12.5 }}>
              {JALALI_MONTHS[view.jm - 1]} {faDigits(view.jy)}
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => move(-1)} aria-label="ماه قبل">
              <ChevronLeft size={16} />
            </button>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              gap: 2,
              fontSize: 10.5,
              color: "var(--muted)",
              textAlign: "center",
              marginBottom: 3,
            }}
          >
            {WEEK.map((w) => (
              <div key={w} style={{ padding: "2px 0" }}>
                {w.slice(0, 1)}
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
            {grid.cells.map((d, i) => {
              if (d === null) return <div key={i} />;
              const iso = jalaliToIso(view.jy, view.jm, d);
              const selected = iso === value;
              const t = isToday(d);
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => select(d)}
                  style={{
                    height: 31,
                    borderRadius: 8,
                    border: "1px solid transparent",
                    background: selected ? "var(--brand)" : t ? "var(--brand-soft)" : "transparent",
                    color: selected ? "#fff" : t ? "var(--brand)" : "var(--ink)",
                    fontSize: 12,
                    fontWeight: selected || t ? 700 : 400,
                    cursor: "pointer",
                  }}
                >
                  {faDigits(d)}
                </button>
              );
            })}
          </div>
          <div className="row" style={{ gap: 6, marginTop: 9, borderTop: "1px solid var(--line)", paddingTop: 8 }}>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => {
                setValue(today);
                setView(isoToJalali(today));
                setOpen(false);
              }}
            >
              امروز
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                const y = addDaysIso(today, -1);
                setValue(y);
                setView(isoToJalali(y));
                setOpen(false);
              }}
            >
              دیروز
            </button>
            <span className="muted tiny" style={{ marginInlineStart: "auto" }}>
              {pad2(j.jm)}/{pad2(j.jd)}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
