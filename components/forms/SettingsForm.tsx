"use client";

import { useActionState } from "react";
import { Save, CheckCircle2 } from "lucide-react";
import { saveSettingsAction, type ActionState } from "@/app/actions";
import SubmitButton from "./SubmitButton";
import type { Settings } from "@/lib/types";

export default function SettingsForm({ settings }: { settings: Settings }) {
  const [state, formAction] = useActionState<ActionState | null, FormData>(saveSettingsAction, null);
  const err = state?.errors ?? {};

  return (
    <form action={formAction} className="card">
      <div className="card-head">
        <div className="card-title">
          <Save size={16} style={{ color: "var(--brand)" }} />
          تنظیمات مزرعه
        </div>
        <span className="hint">این مقادیر مبنای همه محاسبات سود، زیان و پیش‌بینی هستند.</span>
      </div>
      <div className="card-body">
        <div className="form-grid">
          <div className="field full">
            <label htmlFor="farm_name">نام مزرعه</label>
            <input id="farm_name" name="farm_name" className="input" defaultValue={settings.farm_name} />
            {err.farm_name ? <span className="tiny" style={{ color: "var(--red)" }}>{err.farm_name}</span> : null}
          </div>

          <div className="field">
            <label htmlFor="market_price">قیمت روز بازار (هر کیلوگرم زنده)</label>
            <div className="input-group">
              <input id="market_price" name="market_price" className="input" inputMode="numeric" defaultValue={settings.market_price} />
              <span className="suffix">تومان</span>
            </div>
            {err.market_price ? <span className="tiny" style={{ color: "var(--red)" }}>{err.market_price}</span> : null}
            <span className="help">برای محاسبه ارزش گله زنده، نقطه سربه‌سر و تحلیل زمان فروش استفاده می‌شود.</span>
          </div>

          <div className="field">
            <label htmlFor="feed_price">قیمت دان (هر کیلوگرم)</label>
            <div className="input-group">
              <input id="feed_price" name="feed_price" className="input" inputMode="numeric" defaultValue={settings.feed_price} />
              <span className="suffix">تومان</span>
            </div>
            {err.feed_price ? <span className="tiny" style={{ color: "var(--red)" }}>{err.feed_price}</span> : null}
            <span className="help">مبنای پیش‌بینی هزینه دان و پیشنهاد سفارش.</span>
          </div>

          <div className="field">
            <label htmlFor="target_weight_g">وزن هدف پیش‌فرض</label>
            <div className="input-group">
              <input id="target_weight_g" name="target_weight_g" className="input" inputMode="numeric" defaultValue={settings.target_weight_g} />
              <span className="suffix">گرم</span>
            </div>
          </div>

          <div className="field">
            <label htmlFor="target_age_days">سن هدف پیش‌فرض</label>
            <div className="input-group">
              <input id="target_age_days" name="target_age_days" className="input" inputMode="numeric" defaultValue={settings.target_age_days} />
              <span className="suffix">روز</span>
            </div>
          </div>

          <div className="field">
            <label htmlFor="default_breed">نژاد پیش‌فرض</label>
            <input id="default_breed" name="default_breed" className="input" defaultValue={settings.default_breed} />
          </div>
        </div>

        {state?.message ? (
          <div className={`form-msg ${state.ok ? "success" : "error"}`} style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {state.ok ? <CheckCircle2 size={14} /> : null}
            {state.message}
          </div>
        ) : null}

        <div className="form-actions" style={{ marginTop: 14 }}>
          <SubmitButton icon={<Save size={15} />}>ذخیره تنظیمات</SubmitButton>
        </div>
      </div>
    </form>
  );
}
