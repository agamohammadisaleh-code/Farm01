-- ۰۰۰۴ — آستانه‌های هشدار قابل تنظیم برای هر مزرعه
-- قواعد کسب‌وکار ۴ و ۵: افت مصرف آب و نرخ تلفات روزانه.
-- مقادیر پیش‌فرض همان مقادیر خواسته‌شده است: ۱۰٪ افت آب و ۰٫۵٪ تلفات روزانه.

ALTER TABLE farm_settings
  ADD COLUMN IF NOT EXISTS daily_mortality_alert_pct numeric(4,2) NOT NULL DEFAULT 0.50;
ALTER TABLE farm_settings
  ADD COLUMN IF NOT EXISTS water_drop_alert_pct numeric(4,2) NOT NULL DEFAULT 10.00;

-- مقادیر خارج از بازه معقول اصلاح می‌شوند تا هشدارها بی‌اثر یا همیشه‌فعال نشوند
UPDATE farm_settings SET daily_mortality_alert_pct = 0.50
WHERE daily_mortality_alert_pct <= 0 OR daily_mortality_alert_pct > 20;
UPDATE farm_settings SET water_drop_alert_pct = 10.00
WHERE water_drop_alert_pct <= 0 OR water_drop_alert_pct >= 100;
