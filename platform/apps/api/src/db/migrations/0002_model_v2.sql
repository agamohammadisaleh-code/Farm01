-- 0002_model_v2.sql — переход به مدل داده مصوب (Farm → Hall → Flock)
--
-- این مهاجرت داده موجود را حفظ می‌کند:
--   cycles            → flocks  (و هر «house» متنی به یک رکورد halls تبدیل می‌شود)
--   daily_logs.culls  → cull
--   daily_logs.water_l→ water_liter
--   daily_logs.temp_c → avg_temp
--   daily_logs.avg_weight_g → weight_samples (منبع رسمی وزن)
-- ستون feed_type در daily_logs باقی می‌ماند (افزوده نسبت به فهرست اولیه) چون
-- بدون آن، کسر خودکار از انبار به تفکیک «نوع دان» ممکن نیست.
--   costs             → expenses
--   sales.weight_kg   → total_weight_kg
-- و جدول‌های vaccinations، medications و feed_inventory ساخته می‌شوند.

/* ---------------------------- ۱) کاربر: نقش و مزرعه اصلی ---------------------------- */

ALTER TABLE users ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'owner';
ALTER TABLE users ADD COLUMN IF NOT EXISTS farm_id text;

-- مزرعه اصلی = نخستین عضویت (مالکیت در اولویت)
UPDATE users u
SET role = COALESCE((
      SELECT m.role FROM farm_members m
      WHERE m.user_id = u.id
      ORDER BY CASE m.role WHEN 'owner' THEN 0 ELSE 1 END, m.created_at
      LIMIT 1), u.role),
    farm_id = COALESCE(u.farm_id, (
      SELECT m.farm_id FROM farm_members m
      WHERE m.user_id = u.id
      ORDER BY CASE m.role WHEN 'owner' THEN 0 ELSE 1 END, m.created_at
      LIMIT 1))
WHERE u.farm_id IS NULL;

/* ---------------------------- ۲) مزرعه: مالک ---------------------------- */

ALTER TABLE farms ADD COLUMN IF NOT EXISTS owner_id text;

UPDATE farms f
SET owner_id = m.user_id
FROM farm_members m
WHERE m.farm_id = f.id AND m.role = 'owner' AND f.owner_id IS NULL;

/* ---------------------------- ۳) سالن‌ها از ستون house ---------------------------- */

CREATE TABLE IF NOT EXISTS halls (
  id         text PRIMARY KEY,
  farm_id    text NOT NULL REFERENCES farms (id) ON DELETE CASCADE,
  name       text NOT NULL,
  capacity   integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS halls_farm_name_uq ON halls (farm_id, name);

INSERT INTO halls (id, farm_id, name, capacity)
SELECT gen_random_uuid()::text,
       c.farm_id,
       COALESCE(NULLIF(TRIM(c.house), ''), 'سالن اصلی'),
       MAX(c.initial_count)
FROM cycles c
GROUP BY c.farm_id, COALESCE(NULLIF(TRIM(c.house), ''), 'سالن اصلی')
ON CONFLICT (farm_id, name) DO NOTHING;

/* ---------------------------- ۴) گله‌ها ---------------------------- */

ALTER TABLE cycles RENAME TO flocks;
ALTER TABLE flocks RENAME COLUMN placement_date TO start_date;
ALTER TABLE flocks ADD COLUMN IF NOT EXISTS hall_id text;

UPDATE flocks f
SET hall_id = h.id
FROM halls h
WHERE h.farm_id = f.farm_id
  AND h.name = COALESCE(NULLIF(TRIM(f.house), ''), 'سالن اصلی')
  AND f.hall_id IS NULL;

-- ظرفیت سالن: بیشینه تعداد جوجه‌ریزی همان سالن
UPDATE halls h
SET capacity = GREATEST(h.capacity, sub.mx)
FROM (SELECT hall_id, MAX(initial_count) mx FROM flocks GROUP BY hall_id) sub
WHERE sub.hall_id = h.id;

ALTER TABLE flocks ALTER COLUMN hall_id SET NOT NULL;
ALTER TABLE flocks ADD CONSTRAINT flocks_hall_fk FOREIGN KEY (hall_id) REFERENCES halls (id) ON DELETE RESTRICT;
ALTER TABLE flocks DROP COLUMN IF EXISTS house;

CREATE INDEX IF NOT EXISTS flocks_hall_idx ON flocks (hall_id);

/* ---------------------------- ۵) حذف farm_id تکراری ----------------------------
-- مالکیت از مسیر flock → hall → farm مشتق می‌شود؛ نگه‌داشتن farm_id در
-- جدول‌های فرزند یعنی دو منبع حقیقت که می‌توانند از هم جدا شوند.
*/
ALTER TABLE daily_logs DROP COLUMN IF EXISTS farm_id;
ALTER TABLE costs DROP COLUMN IF EXISTS farm_id;
-- نوع دانِ خرید، لازم برای برگرداندن دقیق انبار هنگام ویرایش/حذف هزینه
ALTER TABLE costs ADD COLUMN IF NOT EXISTS feed_type text;
ALTER TABLE sales DROP COLUMN IF EXISTS farm_id;

/* ---------------------------- ۵) ثبت روزانه ---------------------------- */

ALTER TABLE daily_logs RENAME COLUMN cycle_id TO flock_id;
ALTER TABLE daily_logs RENAME COLUMN culls TO cull;
ALTER TABLE daily_logs RENAME COLUMN water_l TO water_liter;
ALTER TABLE daily_logs RENAME COLUMN temp_c TO avg_temp;

ALTER INDEX IF EXISTS daily_logs_cycle_date_uq RENAME TO daily_logs_flock_date_uq;
ALTER INDEX IF EXISTS daily_logs_cycle_idx RENAME TO daily_logs_flock_idx;

/* ---------------------------- ۶) وزن‌گیری نمونه‌ای ---------------------------- */

CREATE TABLE IF NOT EXISTS weight_samples (
  id            text PRIMARY KEY,
  flock_id      text NOT NULL REFERENCES flocks (id) ON DELETE CASCADE,
  date          date NOT NULL,
  sample_count  integer NOT NULL DEFAULT 100,
  avg_weight_gr integer NOT NULL,
  notes         text,
  created_by    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);
CREATE INDEX IF NOT EXISTS weight_samples_flock_idx ON weight_samples (flock_id, date);

-- انتقال وزن‌های ثبت‌شده در لاگ روزانه به جدول وزن‌گیری
INSERT INTO weight_samples (id, flock_id, date, sample_count, avg_weight_gr, notes, created_at, updated_at)
SELECT gen_random_uuid()::text, dl.flock_id, dl.date, 100, dl.avg_weight_g,
       'منتقل‌شده از ثبت روزانه نسخه اول', dl.created_at, dl.updated_at
FROM daily_logs dl
WHERE dl.avg_weight_g IS NOT NULL AND dl.avg_weight_g > 0;

ALTER TABLE daily_logs DROP COLUMN IF EXISTS avg_weight_g;

/* ---------------------------- ۷) سلامت ---------------------------- */

CREATE TABLE IF NOT EXISTS vaccinations (
  id             text PRIMARY KEY,
  flock_id       text NOT NULL REFERENCES flocks (id) ON DELETE CASCADE,
  name           text NOT NULL,
  scheduled_date date NOT NULL,
  done_date      date,
  status         text NOT NULL DEFAULT 'scheduled',
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz
);
CREATE INDEX IF NOT EXISTS vaccinations_flock_idx ON vaccinations (flock_id, scheduled_date);

CREATE TABLE IF NOT EXISTS medications (
  id              text PRIMARY KEY,
  flock_id        text NOT NULL REFERENCES flocks (id) ON DELETE CASCADE,
  name            text NOT NULL,
  dose            text NOT NULL,
  start_date      date NOT NULL,
  end_date        date,
  withdrawal_days integer,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);
CREATE INDEX IF NOT EXISTS medications_flock_idx ON medications (flock_id, start_date);

/* ---------------------------- ۸) مالی ---------------------------- */

ALTER TABLE costs RENAME TO expenses;
ALTER INDEX IF EXISTS costs_cycle_idx RENAME TO expenses_flock_idx;
ALTER TABLE expenses RENAME COLUMN cycle_id TO flock_id;

ALTER TABLE sales RENAME COLUMN cycle_id TO flock_id;
ALTER TABLE sales RENAME COLUMN weight_kg TO total_weight_kg;
ALTER TABLE sales ALTER COLUMN count DROP NOT NULL;
ALTER INDEX IF EXISTS sales_cycle_idx RENAME TO sales_flock_idx;

/* ---------------------------- ۹) انبار دان ---------------------------- */

CREATE TABLE IF NOT EXISTS feed_inventory (
  id          text PRIMARY KEY,
  farm_id     text NOT NULL REFERENCES farms (id) ON DELETE CASCADE,
  feed_type   text NOT NULL,
  quantity_kg numeric(12,2) NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS feed_inventory_farm_type_uq ON feed_inventory (farm_id, feed_type);

-- نوع دانِ خریدهای قدیمی: در نسخه اول ستون مستقیمی نبود، ولی نام نوع در
-- توضیح هزینه آمده است («خرید دان آغازین»). هرچه تطبیق نخورد در استخر
-- «دان (کل)» می‌نشیند تا هنگام مصرف، کسر از آن انجام شود.
UPDATE expenses e
SET feed_type = t.feed_type
FROM flocks fl, (SELECT DISTINCT feed_type FROM daily_logs WHERE feed_type IS NOT NULL) t
WHERE fl.id = e.flock_id
  AND e.category = 'feed'
  AND e.description LIKE '%' || t.feed_type || '%';

UPDATE expenses SET feed_type = 'دان (کل)' WHERE category = 'feed' AND feed_type IS NULL;

-- موجودی اولیه دان، به تفکیک نوع: خرید همان نوع − مصرف همان نوع.
-- عدد منفی بریده نمی‌شود: یعنی مصرفی ثبت شده که خریدِ هم‌نوعش ثبت نشده و
-- باید در گزارش‌ها به‌عنوان کمبود دیده شود، نه با صفر پنهان شود.
WITH types AS (
  SELECT DISTINCT fl.farm_id, dl.feed_type
  FROM daily_logs dl
  JOIN flocks fl ON fl.id = dl.flock_id
  WHERE dl.feed_type IS NOT NULL AND dl.deleted_at IS NULL
), balances AS (
  SELECT t.farm_id,
         t.feed_type,
         COALESCE((
           SELECT SUM(e.quantity)
           FROM expenses e JOIN flocks fl ON fl.id = e.flock_id
           WHERE fl.farm_id = t.farm_id AND e.category = 'feed' AND e.quantity IS NOT NULL
             AND e.description LIKE '%' || t.feed_type || '%'
         ), 0)
         - COALESCE((
           SELECT SUM(dl.feed_kg)
           FROM daily_logs dl JOIN flocks fl ON fl.id = dl.flock_id
           WHERE fl.farm_id = t.farm_id AND dl.feed_type = t.feed_type AND dl.deleted_at IS NULL
         ), 0) AS q
  FROM types t
)
INSERT INTO feed_inventory (id, farm_id, feed_type, quantity_kg)
SELECT gen_random_uuid()::text, farm_id, feed_type, q FROM balances
ON CONFLICT (farm_id, feed_type) DO NOTHING;

-- استخر دان بدون نوع مشخص (خریدهای فله‌ای که نوعشان در توضیح نیامده)
INSERT INTO feed_inventory (id, farm_id, feed_type, quantity_kg)
SELECT gen_random_uuid()::text, fl.farm_id, 'دان (کل)', COALESCE(SUM(e.quantity), 0)
FROM expenses e
JOIN flocks fl ON fl.id = e.flock_id
WHERE e.category = 'feed' AND e.quantity IS NOT NULL AND e.feed_type = 'دان (کل)'
GROUP BY fl.farm_id
ON CONFLICT (farm_id, feed_type) DO NOTHING;

/* ---------------------------- ۱۰) شاخص نهایی ---------------------------- */

CREATE INDEX IF NOT EXISTS users_farm_idx ON users (farm_id);
CREATE INDEX IF NOT EXISTS flocks_farm_idx ON flocks (farm_id);
