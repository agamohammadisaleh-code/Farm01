"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Sprout } from "lucide-react";
import { createCycleAction, type ActionState } from "@/app/actions";
import JalaliDateInput from "./JalaliDateInput";
import SubmitButton from "./SubmitButton";
import { num, parseNumber } from "@/lib/format";
import { useState } from "react";

const BREEDS = ["راس ۳۰۸", "راس ۵۰۰", "هوبارد", "کاب ۵۰۰", "آربور ایکرز", "سایر"];

export default function NewCycleForm({
  defaultBreed,
  defaultTargetWeight,
  defaultTargetAge,
  chickPriceHint,
}: {
  defaultBreed: string;
  defaultTargetWeight: number;
  defaultTargetAge: number;
  chickPriceHint: number;
}) {
  const [state, formAction] = useActionState<ActionState | null, FormData>(createCycleAction, null);
  const [count, setCount] = useState("10000");
  const [price, setPrice] = useState(String(chickPriceHint || 42000));
  const total = (parseNumber(count) || 0) * (parseNumber(price) || 0);
  const err = state?.errors ?? {};

  return (
    <form action={formAction} className="grid" style={{ gap: 16 }}>
      <div className="card card-pad">
        <div className="row" style={{ gap: 8, marginBottom: 14 }}>
          <span className="stat-icon">
            <Sprout size={17} />
          </span>
          <div>
            <h3>اطلاعات پایه دوره</h3>
            <div className="tiny muted">این اطلاعات مبنای همه محاسبات رشد، هزینه و پیش‌بینی سود است.</div>
          </div>
        </div>

        <div className="form-grid">
          <div className="field full">
            <label htmlFor="name">نام دوره *</label>
            <input id="name" name="name" className="input" placeholder="مثلاً دوره پاییزه — سالن ۱" required />
            {err.name ? <span className="tiny" style={{ color: "var(--red)" }}>{err.name}</span> : null}
            <span className="help">نامی که در گزارش‌ها و فهرست دوره‌ها نمایش داده می‌شود.</span>
          </div>

          <div className="field">
            <label htmlFor="house">سالن / واحد</label>
            <input id="house" name="house" className="input" placeholder="سالن ۱" />
          </div>

          <div className="field">
            <label htmlFor="breed">نژاد</label>
            <input id="breed" name="breed" className="input" defaultValue={defaultBreed} list="breed-list" />
            <datalist id="breed-list">
              {BREEDS.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
          </div>

          <div className="field">
            <label>تاریخ جوجه‌ریزی *</label>
            <JalaliDateInput name="placement_date" required />
            {err.placement_date ? <span className="tiny" style={{ color: "var(--red)" }}>{err.placement_date}</span> : null}
          </div>

          <div className="field">
            <label htmlFor="initial_count">تعداد جوجه یک‌روزه *</label>
            <div className="input-group">
              <input
                id="initial_count"
                name="initial_count"
                className="input"
                inputMode="numeric"
                defaultValue="10000"
                onChange={(e) => setCount(e.target.value)}
              />
              <span className="suffix">قطعه</span>
            </div>
            {err.initial_count ? <span className="tiny" style={{ color: "var(--red)" }}>{err.initial_count}</span> : null}
          </div>

          <div className="field">
            <label htmlFor="chick_price">قیمت هر قطعه جوجه *</label>
            <div className="input-group">
              <input
                id="chick_price"
                name="chick_price"
                className="input"
                inputMode="numeric"
                defaultValue={chickPriceHint || 42000}
                onChange={(e) => setPrice(e.target.value)}
              />
              <span className="suffix">تومان</span>
            </div>
            {err.chick_price ? <span className="tiny" style={{ color: "var(--red)" }}>{err.chick_price}</span> : null}
            <span className="help">هزینه جوجه به‌صورت خودکار در هزینه‌های دوره ثبت می‌شود.</span>
          </div>

          <div className="field">
            <label htmlFor="target_weight_g">وزن هدف فروش</label>
            <div className="input-group">
              <input id="target_weight_g" name="target_weight_g" className="input" inputMode="numeric" defaultValue={defaultTargetWeight} />
              <span className="suffix">گرم</span>
            </div>
            {err.target_weight_g ? <span className="tiny" style={{ color: "var(--red)" }}>{err.target_weight_g}</span> : null}
          </div>

          <div className="field">
            <label htmlFor="target_age_days">سن هدف فروش</label>
            <div className="input-group">
              <input id="target_age_days" name="target_age_days" className="input" inputMode="numeric" defaultValue={defaultTargetAge} />
              <span className="suffix">روز</span>
            </div>
            {err.target_age_days ? <span className="tiny" style={{ color: "var(--red)" }}>{err.target_age_days}</span> : null}
          </div>

          <div className="field full">
            <label htmlFor="notes">یادداشت</label>
            <textarea id="notes" name="notes" className="textarea" placeholder="تأمین‌کننده جوجه، شرایط سالن، برنامه واکسیناسیون…" />
          </div>
        </div>

        <div
          className="row-between"
          style={{ marginTop: 16, padding: "11px 14px", background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: 11 }}
        >
          <span className="small muted">برآورد هزینه اولیه جوجه:</span>
          <span className="bold num" style={{ fontSize: 15 }}>
            {num(Math.round(total))} تومان
          </span>
        </div>

        {state?.message && !state.ok ? <div className="form-msg error">{state.message}</div> : null}

        <div className="form-actions" style={{ marginTop: 16 }}>
          <SubmitButton icon={<Sprout size={15} />} pendingText="در حال ایجاد دوره…">
            ایجاد دوره پرورش
          </SubmitButton>
          <Link href="/cycles" className="btn btn-ghost">
            انصراف
          </Link>
        </div>
      </div>
    </form>
  );
}
