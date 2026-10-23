"use client";

import { useActionState, useEffect, useState } from "react";
import { CheckCircle2, Loader2, Minus, Plus, Save, Thermometer, Scale, Droplets, Wheat, Skull } from "lucide-react";
import { saveDailyLogAction, type ActionState } from "@/app/actions";
import JalaliDateInput from "@/components/forms/JalaliDateInput";
import { todayIso } from "@/lib/jalali";
import { num, parseNumber } from "@/lib/format";

function Stepper({
  name,
  label,
  icon,
  value,
  onChange,
  step = 1,
  unit,
  max,
}: {
  name: string;
  label: string;
  icon: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  step?: number;
  unit: string;
  max?: number;
}) {
  const bump = (dir: 1 | -1) => {
    const current = parseNumber(value) || 0;
    const next = Math.max(0, Math.min(max ?? Infinity, current + dir * step));
    onChange(String(Number(next.toFixed(1))));
  };
  return (
    <div>
      <div className="m-field-label">
        {icon}
        {label}
      </div>
      <div className="m-stepper">
        <button type="button" onClick={() => bump(-1)} aria-label={`کاهش ${label}`}>
          <Minus size={19} />
        </button>
        <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
          <input
            name={name}
            inputMode="decimal"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-label={label}
          />
          <span
            style={{
              position: "absolute",
              insetInlineEnd: 10,
              top: "50%",
              transform: "translateY(-50%)",
              fontSize: 10.5,
              color: "var(--muted)",
              pointerEvents: "none",
            }}
          >
            {unit}
          </span>
        </div>
        <button type="button" onClick={() => bump(1)} aria-label={`افزایش ${label}`}>
          <Plus size={19} />
        </button>
      </div>
    </div>
  );
}

export default function MobileQuickLog({
  cycleId,
  liveBirds,
  suggestedFeedKg,
  defaultPhase,
  lastMortality,
  lastFeedKg,
}: {
  cycleId: number;
  liveBirds: number;
  suggestedFeedKg: number;
  defaultPhase: string;
  lastMortality: number;
  lastFeedKg: number;
}) {
  const [state, formAction, pending] = useActionState<ActionState | null, FormData>(saveDailyLogAction, null);
  const [mortality, setMortality] = useState(String(lastMortality));
  const [culls, setCulls] = useState("0");
  const [feed, setFeed] = useState(String(Math.round(suggestedFeedKg)));
  const [water, setWater] = useState(String(Math.round(suggestedFeedKg * 1.8)));
  const [temp, setTemp] = useState("");
  const [weight, setWeight] = useState("");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState(todayIso());

  // پس از ثبت موفق، فرم برای روز جدید آماده می‌شود
  useEffect(() => {
    if (state?.ok) {
      const t = setTimeout(() => {
        setMortality("0");
        setCulls("0");
        setNotes("");
        setWeight("");
        setTemp("");
      }, 1200);
      return () => clearTimeout(t);
    }
  }, [state]);

  const err = state?.errors ?? {};

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <input type="hidden" name="cycle_id" value={cycleId} />
      <input type="hidden" name="feed_type" value={defaultPhase} />

      <div className="m-card">
        <div className="m-field-label">تاریخ ثبت</div>
        <JalaliDateInput name="date" defaultValue={date} required />
        <div className="m-sub" style={{ marginTop: 6 }}>
          {num(liveBirds)} قطعه زنده · دان پیشنهادی سامانه {num(Math.round(suggestedFeedKg))} کیلوگرم
          {lastFeedKg > 0 ? ` · آخرین ثبت ${num(lastFeedKg, 0)} کیلو` : ""}
        </div>
      </div>

      <div className="m-card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Stepper
          name="mortality"
          label="تلفات امروز"
          icon={<Skull size={13} />}
          value={mortality}
          onChange={setMortality}
          unit="قطعه"
          max={liveBirds}
        />
        {err.mortality ? <div className="form-msg error">{err.mortality}</div> : null}

        <Stepper
          name="feed_kg"
          label="دان مصرفی"
          icon={<Wheat size={13} />}
          value={feed}
          onChange={setFeed}
          step={5}
          unit="کیلوگرم"
          max={500000}
        />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[0.94, 1, 1.06].map((k) => (
            <button
              key={k}
              type="button"
              className="chip"
              onClick={() => setFeed(String(Math.round(suggestedFeedKg * k)))}
            >
              {Math.round((k - 1) * 100) === 0 ? "پیشنهاد" : `${Math.round((k - 1) * 100) > 0 ? "+" : ""}${Math.round((k - 1) * 100)}٪`}
            </button>
          ))}
        </div>
        {err.feed_kg ? <div className="form-msg error">{err.feed_kg}</div> : null}

        <Stepper
          name="water_l"
          label="آب مصرفی"
          icon={<Droplets size={13} />}
          value={water}
          onChange={setWater}
          step={10}
          unit="لیتر"
          max={2000000}
        />

        <Stepper
          name="culls"
          label="حذف انتخابی"
          icon={<Minus size={13} />}
          value={culls}
          onChange={setCulls}
          unit="قطعه"
          max={liveBirds}
        />
      </div>

      <div className="m-card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <div className="m-field-label">
            <Thermometer size={13} /> دمای سالن
          </div>
          <input
            className="input"
            name="temp_c"
            inputMode="decimal"
            placeholder="مثلاً ۲۶٫۵"
            value={temp}
            onChange={(e) => setTemp(e.target.value)}
            style={{ height: 46 }}
          />
          {err.temp_c ? <div className="form-msg error">{err.temp_c}</div> : null}
        </div>
        <div>
          <div className="m-field-label">
            <Scale size={13} /> وزن نمونه (اختیاری)
          </div>
          <input
            className="input"
            name="avg_weight_g"
            inputMode="numeric"
            placeholder="گرم — هر ۳ روز یک‌بار"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            style={{ height: 46 }}
          />
          {err.avg_weight_g ? <div className="form-msg error">{err.avg_weight_g}</div> : null}
        </div>
        <div>
          <div className="m-field-label">یادداشت</div>
          <textarea
            className="textarea"
            name="notes"
            rows={2}
            placeholder="واکسیناسیون، دارو، تغییر تهویه…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>

      {err.date ? <div className="form-msg error">{err.date}</div> : null}

      {state?.message ? (
        <div className={`form-msg ${state.ok ? "success" : "error"}`} style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {state.ok ? <CheckCircle2 size={15} /> : null}
          {state.message}
        </div>
      ) : null}

      <button type="submit" className="m-submit" disabled={pending}>
        {pending ? <Loader2 size={18} className="spin" /> : <Save size={18} />}
        {pending ? "در حال ثبت…" : "ثبت آمار امروز"}
      </button>

      <div style={{ fontSize: 10.5, color: "var(--muted)", textAlign: "center", lineHeight: 1.8 }}>
        اگر برای این تاریخ قبلاً ثبت کرده باشید، همان رکورد به‌روزرسانی می‌شود.
      </div>
    </form>
  );
}
