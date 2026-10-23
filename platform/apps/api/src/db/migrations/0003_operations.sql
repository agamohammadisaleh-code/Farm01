-- ۰۰۰۳ — قابلیت‌های عملیاتی: یکنواختی وزن، آستانه هشدار انبار، گزارش‌ها
-- این مهاجرت فقط ستون اضافه می‌کند و داده موجود را دست نمی‌زند.

/* ------------------------- یکنواختی و پراکندگی وزن ------------------------- */

-- «یکنواختی» نسبت قطعه‌های داخل بازه ±۱۰٪ میانگین است. برای محاسبه آن
-- حداقل و حداکثر وزن نمونه کافی است؛ اگر ترازوی دیجیتال خودش ضریب تغییرات
-- را بدهد، همان مقدار ذخیره می‌شود.
ALTER TABLE weight_samples ADD COLUMN IF NOT EXISTS min_weight_gr integer;
ALTER TABLE weight_samples ADD COLUMN IF NOT EXISTS max_weight_gr integer;
ALTER TABLE weight_samples ADD COLUMN IF NOT EXISTS cv_pct numeric(5,2);
ALTER TABLE weight_samples ADD COLUMN IF NOT EXISTS uniformity_pct numeric(5,2);

-- نمونه‌های قدیمی این ستون‌ها را ندارند؛ با میانگین موجود پر می‌شوند تا
-- گزارش‌ها عدد «نامعلوم» نشان ندهند.
UPDATE weight_samples SET min_weight_gr = avg_weight_gr WHERE min_weight_gr IS NULL;
UPDATE weight_samples SET max_weight_gr = avg_weight_gr WHERE max_weight_gr IS NULL;

/* ------------------------- آستانه هشدار انبار ------------------------- */

ALTER TABLE farm_settings ADD COLUMN IF NOT EXISTS feed_alert_days integer NOT NULL DEFAULT 3;

/* ------------------------- ایندکس‌های گزارش ------------------------- */

CREATE INDEX IF NOT EXISTS daily_logs_flock_date_idx ON daily_logs (flock_id, date);
CREATE INDEX IF NOT EXISTS weight_samples_flock_date_idx ON weight_samples (flock_id, date);
CREATE INDEX IF NOT EXISTS expenses_flock_date_idx ON expenses (flock_id, date);
CREATE INDEX IF NOT EXISTS sales_flock_date_idx ON sales (flock_id, date);
