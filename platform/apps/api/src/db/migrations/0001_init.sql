-- 0001_init.sql — طرح اولیه مرغ‌یار روی PostgreSQL
-- همه شناسه‌ها UUID متنی (تولید در برنامه) تا کلاینت آفلاین بتواند پیش از
-- همگام‌سازی رکورد بسازد. حذف نرم با deleted_at برای همگام‌سازی افزایشی.

CREATE TABLE IF NOT EXISTS users (
  id            text PRIMARY KEY,
  email         text NOT NULL,
  password_hash text NOT NULL,
  name          text NOT NULL,
  phone         text,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_uq ON users (email);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         text PRIMARY KEY,
  user_id    text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS refresh_user_idx ON refresh_tokens (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS refresh_hash_uq ON refresh_tokens (token_hash);

CREATE TABLE IF NOT EXISTS farms (
  id         text PRIMARY KEY,
  name       text NOT NULL,
  location   text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS farm_members (
  farm_id    text NOT NULL REFERENCES farms (id) ON DELETE CASCADE,
  user_id    text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (farm_id, user_id)
);
CREATE INDEX IF NOT EXISTS member_user_idx ON farm_members (user_id);

CREATE TABLE IF NOT EXISTS farm_settings (
  farm_id          text PRIMARY KEY REFERENCES farms (id) ON DELETE CASCADE,
  market_price     numeric(14,0) NOT NULL,
  feed_price       numeric(14,0) NOT NULL,
  target_weight_g  integer NOT NULL,
  target_age_days  integer NOT NULL,
  default_breed    text NOT NULL,
  timezone         text NOT NULL DEFAULT 'Asia/Tehran',
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cycles (
  id                text PRIMARY KEY,
  farm_id           text NOT NULL REFERENCES farms (id) ON DELETE CASCADE,
  name              text NOT NULL,
  house             text NOT NULL DEFAULT '',
  breed             text NOT NULL,
  placement_date    date NOT NULL,
  initial_count     integer NOT NULL,
  chick_price       numeric(14,0) NOT NULL DEFAULT 0,
  target_weight_g   integer NOT NULL,
  target_age_days   integer NOT NULL,
  status            text NOT NULL DEFAULT 'active',
  closed_date       date,
  notes             text,
  created_by        text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);
CREATE INDEX IF NOT EXISTS cycles_farm_idx ON cycles (farm_id);
CREATE INDEX IF NOT EXISTS cycles_status_idx ON cycles (farm_id, status);

CREATE TABLE IF NOT EXISTS daily_logs (
  id           text PRIMARY KEY,
  farm_id      text NOT NULL REFERENCES farms (id) ON DELETE CASCADE,
  cycle_id     text NOT NULL REFERENCES cycles (id) ON DELETE CASCADE,
  date         date NOT NULL,
  mortality    integer NOT NULL DEFAULT 0,
  culls        integer NOT NULL DEFAULT 0,
  feed_kg      numeric(12,2) NOT NULL DEFAULT 0,
  water_l      numeric(12,2) NOT NULL DEFAULT 0,
  temp_c       numeric(5,1),
  avg_weight_g integer,
  feed_type    text,
  notes        text,
  created_by   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);
-- قاعده کسب‌وکار: یک ثبت در هر روز برای هر دوره.
-- ایندکس یکتا روی (cycle_id, date) است؛ حذف نرم یعنی رکورد حذف‌شده هم این جای
-- را می‌گیرد و بازیابی آن با upsert انجام می‌شود (deleted_at = NULL).
CREATE UNIQUE INDEX IF NOT EXISTS daily_logs_cycle_date_uq ON daily_logs (cycle_id, date);
CREATE INDEX IF NOT EXISTS daily_logs_cycle_idx ON daily_logs (cycle_id, date);

CREATE TABLE IF NOT EXISTS costs (
  id          text PRIMARY KEY,
  farm_id     text NOT NULL REFERENCES farms (id) ON DELETE CASCADE,
  cycle_id    text NOT NULL REFERENCES cycles (id) ON DELETE CASCADE,
  date        date NOT NULL,
  category    text NOT NULL,
  description text NOT NULL,
  amount      numeric(14,0) NOT NULL,
  quantity    numeric(12,2),
  unit        text,
  vendor      text,
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
CREATE INDEX IF NOT EXISTS costs_cycle_idx ON costs (cycle_id, date);

CREATE TABLE IF NOT EXISTS sales (
  id           text PRIMARY KEY,
  farm_id      text NOT NULL REFERENCES farms (id) ON DELETE CASCADE,
  cycle_id     text NOT NULL REFERENCES cycles (id) ON DELETE CASCADE,
  date         date NOT NULL,
  count        integer NOT NULL,
  weight_kg    numeric(12,2) NOT NULL,
  price_per_kg numeric(14,0) NOT NULL,
  deductions   numeric(14,0) NOT NULL DEFAULT 0,
  buyer        text,
  notes        text,
  created_by   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);
CREATE INDEX IF NOT EXISTS sales_cycle_idx ON sales (cycle_id, date);

CREATE TABLE IF NOT EXISTS sync_receipts (
  id         text PRIMARY KEY,
  farm_id    text NOT NULL REFERENCES farms (id) ON DELETE CASCADE,
  client_id  text NOT NULL,
  entity     text NOT NULL,
  entity_id  text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS sync_receipt_uq ON sync_receipts (client_id, entity, entity_id);
