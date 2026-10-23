import Link from "next/link";
import { ArrowRight, Lightbulb, ShieldCheck, Wallet } from "lucide-react";
import { getSettings } from "@/lib/db";
import NewCycleForm from "@/components/forms/NewCycleForm";
import { num } from "@/lib/format";
import { standardAt } from "@/lib/standards";

export const dynamic = "force-dynamic";

export default async function NewCyclePage() {
  const settings = getSettings();
  const std = standardAt(settings.target_age_days);

  return (
    <div className="page-enter">
      <div className="page-head">
        <div>
          <Link href="/cycles" className="row tiny muted" style={{ gap: 4, marginBottom: 6 }}>
            <ArrowRight size={12} />
            بازگشت به دوره‌ها
          </Link>
          <h1>دوره پرورش جدید</h1>
          <p className="desc">
            با ثبت اطلاعات اولیه، سامانه برنامه رشد، پیش‌بینی مصرف دان، محاسبه ضریب تبدیل و تحلیل سود را از همان روز اول
            فعال می‌کند.
          </p>
        </div>
      </div>

      <div className="grid grid-2-1" style={{ alignItems: "start" }}>
        <NewCycleForm
          defaultBreed={settings.default_breed}
          defaultTargetWeight={settings.target_weight_g}
          defaultTargetAge={settings.target_age_days}
          chickPriceHint={0}
        />

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card card-pad">
            <div className="row" style={{ gap: 8, marginBottom: 10 }}>
              <span className="stat-icon" style={{ background: "var(--amber-soft)", color: "var(--amber)" }}>
                <Lightbulb size={16} />
              </span>
              <h3>راهنمای انتخاب هدف</h3>
            </div>
            <div className="kv-list">
              <div className="kv">
                <span className="k">وزن استاندارد در {num(settings.target_age_days)} روزگی</span>
                <span className="v num">{num(std.weightG)} گرم</span>
              </div>
              <div className="kv">
                <span className="k">ضریب تبدیل استاندارد</span>
                <span className="v num">{num(std.fcr, 2)}</span>
              </div>
              <div className="kv">
                <span className="k">دان مصرفی استاندارد تا این سن</span>
                <span className="v num">{num(std.cumFeedG / 1000, 2)} کیلوگرم/قطعه</span>
              </div>
            </div>
            <p className="tiny muted mt-14" style={{ lineHeight: 1.9 }}>
              وزن و سن هدف را با سفارش بازار و ظرفیت کشتارگاه تنظیم کنید. در نژاد راس ۳۰۸ رسیدن به ۲۵۰۰ گرم معمولاً
              بین ۳۶ تا ۳۹ روزگی اتفاق می‌افتد؛ اگر وزن بیشتری می‌خواهید، سن هدف را بالاتر ببرید.
            </p>
          </div>

          <div className="card card-pad">
            <div className="row" style={{ gap: 8, marginBottom: 10 }}>
              <span className="stat-icon" style={{ background: "var(--blue-soft)", color: "var(--blue)" }}>
                <Wallet size={16} />
              </span>
              <h3>هزینه جوجه‌ریزی</h3>
            </div>
            <p className="small muted" style={{ lineHeight: 1.9 }}>
              هزینه خرید جوجه به‌صورت خودکار در دسته «جوجه یک‌روزه» ثبت می‌شود. سایر هزینه‌ها (دان، دارو، کارگر، انرژی)
              را در صفحه دوره و در بخش هزینه‌ها اضافه کنید.
            </p>
            <div className="badge badge-blue mt-14">قیمت دان فعلی مزرعه: {num(settings.feed_price)} تومان/کیلو</div>
          </div>

          <div className="card card-pad">
            <div className="row" style={{ gap: 8, marginBottom: 8 }}>
              <span className="stat-icon" style={{ background: "var(--brand-soft)", color: "var(--brand)" }}>
                <ShieldCheck size={16} />
              </span>
              <h3>پیشنهاد سامانه</h3>
            </div>
            <ul className="small muted" style={{ paddingInlineStart: 18, lineHeight: 2, margin: 0 }}>
              <li>تاریخ جوجه‌ریزی واقعی را دقیق ثبت کنید؛ سن گله مبنای همه محاسبات است.</li>
              <li>تعداد جوجه را مطابق فاکتور هچری وارد کنید.</li>
              <li>از روز اول، تلفات و دان مصرفی را روزانه ثبت کنید.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
