"use client";

import { useActionState, useState } from "react";
import { BadgeDollarSign, CheckCircle2, Wand2 } from "lucide-react";
import { saveSaleAction, type ActionState } from "@/app/actions";
import JalaliDateInput from "./JalaliDateInput";
import SubmitButton from "./SubmitButton";
import { num } from "@/lib/format";

export default function SaleForm({
  cycleId,
  marketPrice,
  liveBirds,
  currentWeightG,
}: {
  cycleId: number;
  marketPrice: number;
  liveBirds: number;
  currentWeightG: number;
}) {
  const [state, formAction] = useActionState<ActionState | null, FormData>(saveSaleAction, null);
  const [count, setCount] = useState(String(liveBirds));
  const [weight, setWeight] = useState(String(Math.round((liveBirds * currentWeightG) / 1000)));
  const [price, setPrice] = useState(String(marketPrice));
  const [deduction, setDeduction] = useState("0");
  const err = state?.errors ?? {};

  const estimate = (c: string) => {
    const n = Number(String(c).replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))));
    if (n > 0) setWeight(String(Math.round((n * currentWeightG) / 1000)));
  };

  const gross =
    (Number(String(weight).replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))) || 0) *
      (Number(String(price).replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))) || 0) -
    (Number(String(deduction).replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))) || 0);

  return (
    <form action={formAction} className="card">
      <div className="card-head">
        <div className="card-title">
          <BadgeDollarSign size={16} style={{ color: "var(--brand)" }} />
          ثبت فروش و بارگیری
        </div>
        <span className="hint">درآمد ثبت‌شده در محاسبه سود و زیان دوره لحاظ می‌شود.</span>
      </div>
      <div className="card-body">
        <input type="hidden" name="cycle_id" value={cycleId} />
        <div className="form-grid">
          <div className="field">
            <label>تاریخ فروش *</label>
            <JalaliDateInput name="date" required />
            {err.date ? <span className="tiny" style={{ color: "var(--red)" }}>{err.date}</span> : null}
          </div>

          <div className="field">
            <label htmlFor="count">تعداد قطعه *</label>
            <div className="input-group">
              <input
                id="count"
                name="count"
                className="input"
                inputMode="numeric"
                value={count}
                onChange={(e) => {
                  setCount(e.target.value);
                  estimate(e.target.value);
                }}
              />
              <span className="suffix">قطعه</span>
            </div>
            {err.count ? <span className="tiny" style={{ color: "var(--red)" }}>{err.count}</span> : null}
            <button
              type="button"
              className="chip"
              style={{ alignSelf: "flex-start", marginTop: 2 }}
              onClick={() => {
                setCount(String(liveBirds));
                estimate(String(liveBirds));
              }}
            >
              <Wand2 size={11} style={{ verticalAlign: -1, marginInlineEnd: 3 }} />
              همه {num(liveBirds)} قطعه زنده
            </button>
          </div>

          <div className="field">
            <label htmlFor="weight_kg">وزن کل محموله *</label>
            <div className="input-group">
              <input
                id="weight_kg"
                name="weight_kg"
                className="input"
                inputMode="numeric"
                placeholder="کیلوگرم"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
              />
              <span className="suffix">کیلوگرم</span>
            </div>
            {err.weight_kg ? <span className="tiny" style={{ color: "var(--red)" }}>{err.weight_kg}</span> : null}
            <span className="help">برآورد بر اساس وزن فعلی {num(currentWeightG)} گرم.</span>
          </div>

          <div className="field">
            <label htmlFor="price_per_kg">قیمت هر کیلوگرم *</label>
            <div className="input-group">
              <input
                id="price_per_kg"
                name="price_per_kg"
                className="input"
                inputMode="numeric"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
              <span className="suffix">تومان</span>
            </div>
            {err.price_per_kg ? <span className="tiny" style={{ color: "var(--red)" }}>{err.price_per_kg}</span> : null}
          </div>

          <div className="field">
            <label htmlFor="deductions">کسورات (حمل، ضایعات…)</label>
            <div className="input-group">
              <input
                id="deductions"
                name="deductions"
                className="input"
                inputMode="numeric"
                value={deduction}
                onChange={(e) => setDeduction(e.target.value)}
              />
              <span className="suffix">تومان</span>
            </div>
          </div>

          <div className="field">
            <label htmlFor="buyer">خریدار</label>
            <input id="buyer" name="buyer" className="input" placeholder="کشتارگاه / خریدار" />
          </div>

          <div className="field full">
            <label htmlFor="notes">یادداشت</label>
            <textarea id="notes" name="notes" className="textarea" placeholder="نوبت بارگیری، شرایط پرداخت…" />
          </div>
        </div>

        <div
          className="row-between"
          style={{ marginTop: 14, padding: "11px 14px", background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: 11 }}
        >
          <span className="small muted">درآمد خالص برآوردی این محموله</span>
          <span className="bold num" style={{ fontSize: 15 }}>{num(Math.max(0, Math.round(gross)))} تومان</span>
        </div>

        {state?.message ? (
          <div className={`form-msg ${state.ok ? "success" : "error"}`} style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {state.ok ? <CheckCircle2 size={14} /> : null}
            {state.message}
          </div>
        ) : null}

        <div className="form-actions" style={{ marginTop: 12 }}>
          <SubmitButton icon={<BadgeDollarSign size={15} />}>ثبت فروش</SubmitButton>
        </div>
      </div>
    </form>
  );
}
