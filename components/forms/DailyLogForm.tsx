"use client";

import { useActionState, useState } from "react";
import { ClipboardPlus, CheckCircle2, Wand2 } from "lucide-react";
import { saveDailyLogAction, type ActionState } from "@/app/actions";
import JalaliDateInput from "./JalaliDateInput";
import SubmitButton from "./SubmitButton";
import { num } from "@/lib/format";
import { todayIso } from "@/lib/jalali";
import { FEED_PROGRAM } from "@/lib/standards";

export default function DailyLogForm({
  cycleId,
  ageDays,
  liveBirds,
  suggestedFeedKg,
  suggestedWaterL,
  currentPhase,
}: {
  cycleId: number;
  ageDays: number;
  liveBirds: number;
  suggestedFeedKg: number;
  suggestedWaterL: number;
  currentPhase: string;
}) {
  const [state, formAction] = useActionState<ActionState | null, FormData>(saveDailyLogAction, null);
  const [feed, setFeed] = useState("");
  const [water, setWater] = useState("");
  const err = state?.errors ?? {};

  return (
    <form action={formAction} className="card">
      <div className="card-head">
        <div className="card-title">
          <ClipboardPlus size={16} style={{ color: "var(--brand)" }} />
          ثبت / ویرایش آمار روزانه
        </div>
        <span className="hint">اگر برای این تاریخ قبلاً ثبت شده باشد، به‌روزرسانی می‌شود.</span>
      </div>
      <div className="card-body">
        <input type="hidden" name="cycle_id" value={cycleId} />
        <div className="form-grid">
          <div className="field">
            <label>تاریخ ثبت *</label>
            <JalaliDateInput name="date" defaultValue={todayIso()} required />
            {err.date ? <span className="tiny" style={{ color: "var(--red)" }}>{err.date}</span> : null}
          </div>

          <div className="field">
            <label htmlFor="feed_type">نوع دان</label>
            <select id="feed_type" name="feed_type" className="select" defaultValue={currentPhase}>
              {FEED_PROGRAM.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="mortality">تلفات (قطعه)</label>
            <input id="mortality" name="mortality" className="input" inputMode="numeric" placeholder="0" defaultValue="0" />
            {err.mortality ? <span className="tiny" style={{ color: "var(--red)" }}>{err.mortality}</span> : null}
          </div>

          <div className="field">
            <label htmlFor="culls">حذف انتخابی (قطعه)</label>
            <input id="culls" name="culls" className="input" inputMode="numeric" placeholder="0" defaultValue="0" />
          </div>

          <div className="field">
            <label htmlFor="feed_kg">دان مصرفی (کیلوگرم) *</label>
            <div className="input-group">
              <input
                id="feed_kg"
                name="feed_kg"
                className="input"
                inputMode="decimal"
                placeholder={String(Math.round(suggestedFeedKg))}
                value={feed}
                onChange={(e) => setFeed(e.target.value)}
              />
              <span className="suffix">کیلوگرم</span>
            </div>
            {err.feed_kg ? <span className="tiny" style={{ color: "var(--red)" }}>{err.feed_kg}</span> : null}
            <button
              type="button"
              className="chip"
              style={{ alignSelf: "flex-start", marginTop: 2 }}
              onClick={() => setFeed(String(Math.round(suggestedFeedKg)))}
            >
              <Wand2 size={11} style={{ verticalAlign: -1, marginInlineEnd: 3 }} />
              پیشنهاد سامانه: {num(Math.round(suggestedFeedKg))} کیلوگرم
            </button>
          </div>

          <div className="field">
            <label htmlFor="water_l">آب مصرفی (لیتر)</label>
            <div className="input-group">
              <input
                id="water_l"
                name="water_l"
                className="input"
                inputMode="decimal"
                placeholder={String(Math.round(suggestedWaterL))}
                value={water}
                onChange={(e) => setWater(e.target.value)}
              />
              <span className="suffix">لیتر</span>
            </div>
            {err.water_l ? <span className="tiny" style={{ color: "var(--red)" }}>{err.water_l}</span> : null}
          </div>

          <div className="field">
            <label htmlFor="temp_c">دمای سالن (درجه)</label>
            <input id="temp_c" name="temp_c" className="input" inputMode="decimal" placeholder="26.5" />
            {err.temp_c ? <span className="tiny" style={{ color: "var(--red)" }}>{err.temp_c}</span> : null}
          </div>

          <div className="field">
            <label htmlFor="avg_weight_g">وزن نمونه (گرم)</label>
            <input id="avg_weight_g" name="avg_weight_g" className="input" inputMode="numeric" placeholder="اختیاری — هر ۳ روز" />
            {err.avg_weight_g ? <span className="tiny" style={{ color: "var(--red)" }}>{err.avg_weight_g}</span> : null}
          </div>

          <div className="field full">
            <label htmlFor="notes">یادداشت روز</label>
            <textarea id="notes" name="notes" className="textarea" placeholder="واکسیناسیون، دارو، تغییر تهویه، مشاهدات…" />
          </div>
        </div>

        {state?.message ? (
          <div className={`form-msg ${state.ok ? "success" : "error"}`} style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {state.ok ? <CheckCircle2 size={14} /> : null}
            {state.message}
          </div>
        ) : null}

        <div className="form-actions" style={{ marginTop: 12 }}>
          <SubmitButton icon={<ClipboardPlus size={15} />}>ثبت آمار روز</SubmitButton>
          <span className="tiny muted">
            روز {num(ageDays)} دوره — {num(liveBirds)} قطعه زنده
          </span>
        </div>
      </div>
    </form>
  );
}
