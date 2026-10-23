"use client";

import { useActionState } from "react";
import { Save, CheckCircle2 } from "lucide-react";
import { updateCycleAction, type ActionState } from "@/app/actions";
import JalaliDateInput from "./JalaliDateInput";
import SubmitButton from "./SubmitButton";
import { num } from "@/lib/format";
import type { Cycle } from "@/lib/types";

export default function EditCycleForm({ cycle }: { cycle: Cycle }) {
  const [state, formAction] = useActionState<ActionState | null, FormData>(updateCycleAction, null);
  const err = state?.errors ?? {};

  return (
    <form action={formAction} className="card">
      <div className="card-head">
        <div className="card-title">
          <Save size={16} style={{ color: "var(--brand)" }} />
          ویرایش اطلاعات دوره
        </div>
        <span className="hint">تغییر وزن و سن هدف، محاسبات پیش‌بینی سود را به‌روز می‌کند.</span>
      </div>
      <div className="card-body">
        <input type="hidden" name="cycle_id" value={cycle.id} />
        <div className="form-grid">
          <div className="field">
            <label htmlFor="edit-name">نام دوره</label>
            <input id="edit-name" name="name" className="input" defaultValue={cycle.name} />
            {err.name ? <span className="tiny" style={{ color: "var(--red)" }}>{err.name}</span> : null}
          </div>
          <div className="field">
            <label htmlFor="edit-house">سالن</label>
            <input id="edit-house" name="house" className="input" defaultValue={cycle.house} />
          </div>
          <div className="field">
            <label htmlFor="edit-breed">نژاد</label>
            <input id="edit-breed" name="breed" className="input" defaultValue={cycle.breed} />
          </div>
          <div className="field">
            <label>تاریخ جوجه‌ریزی</label>
            <JalaliDateInput name="placement_date" defaultValue={cycle.placement_date} required />
            {err.placement_date ? <span className="tiny" style={{ color: "var(--red)" }}>{err.placement_date}</span> : null}
          </div>
          <div className="field">
            <label htmlFor="edit-weight">وزن هدف (گرم)</label>
            <input id="edit-weight" name="target_weight_g" className="input" inputMode="numeric" defaultValue={cycle.target_weight_g} />
            {err.target_weight_g ? <span className="tiny" style={{ color: "var(--red)" }}>{err.target_weight_g}</span> : null}
          </div>
          <div className="field">
            <label htmlFor="edit-age">سن هدف (روز)</label>
            <input id="edit-age" name="target_age_days" className="input" inputMode="numeric" defaultValue={cycle.target_age_days} />
            {err.target_age_days ? <span className="tiny" style={{ color: "var(--red)" }}>{err.target_age_days}</span> : null}
          </div>
          <div className="field full">
            <label htmlFor="edit-notes">یادداشت دوره</label>
            <textarea id="edit-notes" name="notes" className="textarea" defaultValue={cycle.notes ?? ""} />
          </div>
        </div>

        <div className="form-msg" style={{ background: "var(--surface-2)", border: "1px solid var(--line)" }}>
          تعداد جوجه اولیه ({num(cycle.initial_count)} قطعه) و قیمت جوجه پس از ایجاد دوره قابل تغییر نیست؛ در صورت نیاز،
          هزینه اصلاحی را در بخش هزینه‌ها ثبت کنید.
        </div>

        {state?.message ? (
          <div className={`form-msg ${state.ok ? "success" : "error"}`} style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {state.ok ? <CheckCircle2 size={14} /> : null}
            {state.message}
          </div>
        ) : null}

        <div className="form-actions" style={{ marginTop: 12 }}>
          <SubmitButton icon={<Save size={15} />}>ذخیره تغییرات</SubmitButton>
        </div>
      </div>
    </form>
  );
}
