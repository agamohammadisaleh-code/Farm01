import { Settings2, Database, Cpu, Info, ShieldCheck, Wheat, ChartLine } from "lucide-react";
import { getSettings } from "@/lib/db";
import SettingsForm from "@/components/forms/SettingsForm";
import DataActions from "@/components/forms/DataActions";
import { num } from "@/lib/format";
import { standardAt } from "@/lib/standards";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const settings = getSettings();
  const llmConfigured = Boolean(process.env.OPENAI_API_KEY);
  const std = standardAt(settings.target_age_days);

  return (
    <div className="page-enter">
      <div className="page-head">
        <div>
          <h1>تنظیمات</h1>
          <p className="desc">
            قیمت‌های مرجع و اهداف دوره را تنظیم کنید تا همه تحلیل‌ها و پیش‌بینی‌ها با واقعیت مزرعه شما هم‌راستا شود.
          </p>
        </div>
      </div>

      <div className="grid grid-2-1" style={{ alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <SettingsForm settings={settings} />

          <div className="card">
            <div className="card-head">
              <div className="card-title">
                <Database size={16} style={{ color: "var(--red)" }} />
                مدیریت داده‌ها
              </div>
            </div>
            <div className="card-body">
              <p className="small muted" style={{ lineHeight: 1.9 }}>
                داده‌ها در یک بانک اطلاعاتی محلی روی همین دستگاه ذخیره می‌شوند. می‌توانید برای آزمایش، داده‌های نمونه را
                بازنشانی کنید یا همه داده‌ها را پاک کنید.
              </p>
              <div className="mt-14">
                <DataActions />
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card">
            <div className="card-head">
              <div className="card-title">
                <Cpu size={16} style={{ color: "var(--violet)" }} />
                وضعیت موتور تحلیل
              </div>
            </div>
            <div className="card-body" style={{ paddingTop: 12 }}>
              <div className="switch-row">
                <div>
                  <div className="small bold">تحلیل محلی (آفلاین)</div>
                  <div className="tiny muted">موتور تحلیل داده روی همین دستگاه اجرا می‌شود</div>
                </div>
                <span className="badge badge-green">فعال</span>
              </div>
              <div className="switch-row">
                <div>
                  <div className="small bold">اتصال به مدل زبانی</div>
                  <div className="tiny muted">
                    {llmConfigured
                      ? "کلید OPENAI_API_KEY شناسایی شد؛ پاسخ‌ها با مدل زبانی غنی‌سازی می‌شود"
                      : "اختیاری — با تنظیم متغیر محیطی OPENAI_API_KEY فعال می‌شود"}
                  </div>
                </div>
                <span className={`badge ${llmConfigured ? "badge-green" : "badge-gray"}`}>
                  {llmConfigured ? "متصل" : "غیرفعال"}
                </span>
              </div>
              <div className="switch-row">
                <div>
                  <div className="small bold">حالت حریم خصوصی</div>
                  <div className="tiny muted">بدون ارسال داده به سرور خارجی</div>
                </div>
                <span className="badge badge-green">فعال</span>
              </div>
              <div className="form-msg success" style={{ lineHeight: 1.9 }}>
                حتی بدون اتصال به مدل زبانی، مشاور می‌تواند درباره فروش، دان، تلفات، هزینه و پیش‌بینی پایان دوره تحلیل
                عددی ارائه دهد.
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <div className="card-title">
                <Wheat size={16} style={{ color: "var(--amber)" }} />
                مبانی محاسبه
              </div>
            </div>
            <div className="card-body">
              <div className="kv-list">
                <div className="kv">
                  <span className="k">وزن استاندارد در سن هدف ({num(settings.target_age_days)} روز)</span>
                  <span className="v num">{num(std.weightG)} گرم</span>
                </div>
                <div className="kv">
                  <span className="k">ضریب تبدیل استاندارد همان سن</span>
                  <span className="v num">{num(std.fcr, 2)}</span>
                </div>
                <div className="kv">
                  <span className="k">دان تجمعی استاندارد</span>
                  <span className="v num">{num(std.cumFeedG / 1000, 2)} کیلو/قطعه</span>
                </div>
                <div className="kv">
                  <span className="k">وزن شروع جوجه یک‌روزه</span>
                  <span className="v num">۴۲ گرم</span>
                </div>
              </div>
              <p className="tiny muted mt-14" style={{ lineHeight: 1.9 }}>
                استاندارد رشد بر پایه راهنمای مدیریت نژاد راس ۳۰۸ و به‌صورت نقاط مرجع روزانه درون‌یابی شده است. اعداد
                سامانه برای مقایسه و هشدار است، نه جایگزین توصیه دامپزشک یا کارشناس تغذیه.
              </p>
            </div>
          </div>

          <div className="card card-pad">
            <div className="row" style={{ gap: 8, marginBottom: 8 }}>
              <ShieldCheck size={16} style={{ color: "var(--brand)" }} />
              <b style={{ fontSize: 13 }}>درباره مرغ‌یار</b>
            </div>
            <p className="tiny muted" style={{ lineHeight: 1.9 }}>
              نسخه ۱٫۰ — سامانه مدیریت چرخه پرورش مرغ گوشتی با رابط فارسی و راست‌به‌چپ. شامل ثبت روزانه، مدیریت هزینه و
              فروش، تحلیل رشد در برابر استاندارد، هشدارهای هوشمند و مشاور تصمیم‌یار.
            </p>
            <div className="row wrap mt-14" style={{ gap: 6 }}>
              <span className="badge badge-gray">
                <Info size={11} /> رابط فارسی RTL
              </span>
              <span className="badge badge-gray">
                <ChartLine size={11} /> گزارش‌های تحلیلی
              </span>
              <span className="badge badge-gray">
                <Settings2 size={11} /> کاملاً قابل تنظیم
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
