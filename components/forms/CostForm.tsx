"use client";

import { useActionState, useState } from "react";
import { Receipt, CheckCircle2 } from "lucide-react";
import { saveCostAction, type ActionState } from "@/app/actions";
import JalaliDateInput from "./JalaliDateInput";
import SubmitButton from "./SubmitButton";
import { num } from "@/lib/format";

export default function CostForm({ cycleId, feedPrice }: { cycleId: number; feedPrice: number }) {
  const [state, formAction] = useActionState<ActionState | null, FormData>(saveCostAction, null);
  const [category, setCategory] = useState("feed");
  const [qty, setQty] = useState("");
  const [amount, setAmount] = useState("");
  const err = state?.errors ?? {};

  const suggest = () => {
    const q = Number(String(qty).replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))));
    if (q > 0) setAmount(String(Math.round(q * feedPrice)));
  };

  return (
    <form action={formAction} className="card">
      <div className="card-head">
        <div className="card-title">
          <Receipt size={16} style={{ color: "var(--brand)" }} />
          ثبت هزینه
        </div>
        <span className="hint">هزینه‌ها به تفکیک دسته، در تحلیل سود و بهای تمام‌شده استفاده می‌شوند.</span>
      </div>
      <div className="card-body">
        <input type="hidden" name="cycle_id" value={cycleId} />
        <div className="form-grid">
          <div className="field">
            <label>تاریخ هزینه *</label>
            <JalaliDateInput name="date" required />
            {err.date ? <span className="tiny" style={{ color: "var(--red)" }}>{err.date}</span> : null}
          </div>

          <div className="field">
            <label htmlFor="category">دسته هزینه *</label>
            <select id="category" name="category" className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="feed">دان و خوراک</option>
              <option value="chick">جوجه یک‌روزه</option>
              <option value="medication">دارو و مکمل</option>
              <option value="vaccine">واکسن</option>
              <option value="labor">نیروی کار</option>
              <option value="energy">انرژی و سوخت</option>
              <option value="litter">بستر</option>
              <option value="transport">حمل و نقل</option>
              <option value="equipment">تجهیزات و تعمیر</option>
              <option value="other">سایر</option>
            </select>
          </div>

          <div className="field full">
            <label htmlFor="description">شرح هزینه *</label>
            <input id="description" name="description" className="input" placeholder="مثلاً خرید ۵ تن دان رشد" />
            {err.description ? <span className="tiny" style={{ color: "var(--red)" }}>{err.description}</span> : null}
          </div>

          <div className="field">
            <label htmlFor="quantity">مقدار</label>
            <div className="input-group">
              <input
                id="quantity"
                name="quantity"
                className="input"
                inputMode="decimal"
                placeholder={category === "feed" ? "مثلاً 5000" : "اختیاری"}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
              <span className="suffix">{category === "feed" ? "کیلوگرم" : "واحد"}</span>
            </div>
            {category === "feed" ? (
              <button type="button" className="chip" style={{ alignSelf: "flex-start", marginTop: 2 }} onClick={suggest}>
                محاسبه مبلغ با قیمت دان {num(feedPrice)} تومان
              </button>
            ) : null}
          </div>

          <div className="field">
            <label htmlFor="amount">مبلغ کل *</label>
            <div className="input-group">
              <input
                id="amount"
                name="amount"
                className="input"
                inputMode="numeric"
                placeholder="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <span className="suffix">تومان</span>
            </div>
            {err.amount ? <span className="tiny" style={{ color: "var(--red)" }}>{err.amount}</span> : null}
          </div>

          <div className="field">
            <label htmlFor="vendor">فروشنده / تأمین‌کننده</label>
            <input id="vendor" name="vendor" className="input" placeholder="نام تأمین‌کننده" />
          </div>

          <div className="field">
            <label htmlFor="unit">واحد</label>
            <input key={category} id="unit" name="unit" className="input" defaultValue={category === "feed" ? "کیلوگرم" : ""} placeholder="کیلوگرم / قطعه / نفر-روز" />
          </div>
        </div>

        {state?.message ? (
          <div className={`form-msg ${state.ok ? "success" : "error"}`} style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {state.ok ? <CheckCircle2 size={14} /> : null}
            {state.message}
          </div>
        ) : null}

        <div className="form-actions" style={{ marginTop: 12 }}>
          <SubmitButton icon={<Receipt size={15} />}>ثبت هزینه</SubmitButton>
        </div>
      </div>
    </form>
  );
}
