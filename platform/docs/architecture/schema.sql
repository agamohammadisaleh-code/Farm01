-- ═══════════════════════════════════════════════════════════════════════
-- مرغ‌یار — طرح پایگاه‌داده (PostgreSQL)
-- این فایل از پایگاه‌داده‌ی واقعی پس از اجرای همه مهاجرت‌ها تولید شده است.
-- تعداد جدول‌ها: 15 (به‌علاوه جدول فنی _migrations)
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE daily_logs (
  id text NOT NULL,
  flock_id text NOT NULL,
  date date NOT NULL,
  mortality integer DEFAULT 0 NOT NULL,
  cull integer DEFAULT 0 NOT NULL,
  feed_kg numeric(12,2) DEFAULT 0 NOT NULL,
  water_liter numeric(12,2) DEFAULT 0 NOT NULL,
  avg_temp numeric(5,1) NULL,
  feed_type text NULL,
  notes text NULL,
  created_by text NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  deleted_at timestamptz NULL,
  PRIMARY KEY (id)
);

CREATE INDEX daily_logs_flock_date_idx ON public.daily_logs USING btree (flock_id, date);
CREATE UNIQUE INDEX daily_logs_flock_date_uq ON public.daily_logs USING btree (flock_id, date);
CREATE INDEX daily_logs_flock_idx ON public.daily_logs USING btree (flock_id, date);

ALTER TABLE daily_logs ADD CONSTRAINT daily_logs_cycle_id_fkey FOREIGN KEY (flock_id) REFERENCES flocks(id) ON DELETE CASCADE;

CREATE TABLE expenses (
  id text NOT NULL,
  flock_id text NOT NULL,
  date date NOT NULL,
  category text NOT NULL,
  description text NOT NULL,
  amount numeric(14,0) NOT NULL,
  quantity numeric(12,2) NULL,
  unit text NULL,
  vendor text NULL,
  created_by text NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  deleted_at timestamptz NULL,
  feed_type text NULL,
  PRIMARY KEY (id)
);

CREATE INDEX expenses_flock_date_idx ON public.expenses USING btree (flock_id, date);
CREATE INDEX expenses_flock_idx ON public.expenses USING btree (flock_id, date);

ALTER TABLE expenses ADD CONSTRAINT costs_cycle_id_fkey FOREIGN KEY (flock_id) REFERENCES flocks(id) ON DELETE CASCADE;

CREATE TABLE farm_members (
  farm_id text NOT NULL,
  user_id text NOT NULL,
  role text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (farm_id, user_id)
);

CREATE INDEX member_user_idx ON public.farm_members USING btree (user_id);

ALTER TABLE farm_members ADD CONSTRAINT farm_members_farm_id_fkey FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE;
ALTER TABLE farm_members ADD CONSTRAINT farm_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

CREATE TABLE farm_settings (
  farm_id text NOT NULL,
  market_price numeric(14,0) NOT NULL,
  feed_price numeric(14,0) NOT NULL,
  target_weight_g integer NOT NULL,
  target_age_days integer NOT NULL,
  default_breed text NOT NULL,
  timezone text DEFAULT 'Asia/Tehran'::text NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  feed_alert_days integer DEFAULT 3 NOT NULL,
  daily_mortality_alert_pct numeric(4,2) DEFAULT 0.50 NOT NULL,
  water_drop_alert_pct numeric(4,2) DEFAULT 10.00 NOT NULL,
  PRIMARY KEY (farm_id)
);

ALTER TABLE farm_settings ADD CONSTRAINT farm_settings_farm_id_fkey FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE;

CREATE TABLE farms (
  id text NOT NULL,
  name text NOT NULL,
  location text NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  deleted_at timestamptz NULL,
  owner_id text NULL,
  PRIMARY KEY (id)
);

CREATE TABLE feed_inventory (
  id text NOT NULL,
  farm_id text NOT NULL,
  feed_type text NOT NULL,
  quantity_kg numeric(12,2) DEFAULT 0 NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE UNIQUE INDEX feed_inventory_farm_type_uq ON public.feed_inventory USING btree (farm_id, feed_type);

ALTER TABLE feed_inventory ADD CONSTRAINT feed_inventory_farm_id_fkey FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE;

CREATE TABLE flocks (
  id text NOT NULL,
  farm_id text NOT NULL,
  name text NOT NULL,
  breed text NOT NULL,
  start_date date NOT NULL,
  initial_count integer NOT NULL,
  chick_price numeric(14,0) DEFAULT 0 NOT NULL,
  target_weight_g integer NOT NULL,
  target_age_days integer NOT NULL,
  status text DEFAULT 'active'::text NOT NULL,
  closed_date date NULL,
  notes text NULL,
  created_by text NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  deleted_at timestamptz NULL,
  hall_id text NOT NULL,
  PRIMARY KEY (id)
);

CREATE INDEX cycles_farm_idx ON public.flocks USING btree (farm_id);
CREATE INDEX cycles_status_idx ON public.flocks USING btree (farm_id, status);
CREATE INDEX flocks_farm_idx ON public.flocks USING btree (farm_id);
CREATE INDEX flocks_hall_idx ON public.flocks USING btree (hall_id);

ALTER TABLE flocks ADD CONSTRAINT cycles_farm_id_fkey FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE;
ALTER TABLE flocks ADD CONSTRAINT flocks_hall_fk FOREIGN KEY (hall_id) REFERENCES halls(id) ON DELETE RESTRICT;

CREATE TABLE halls (
  id text NOT NULL,
  farm_id text NOT NULL,
  name text NOT NULL,
  capacity integer DEFAULT 0 NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  deleted_at timestamptz NULL,
  PRIMARY KEY (id)
);

CREATE UNIQUE INDEX halls_farm_name_uq ON public.halls USING btree (farm_id, name);

ALTER TABLE halls ADD CONSTRAINT halls_farm_id_fkey FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE;

CREATE TABLE medications (
  id text NOT NULL,
  flock_id text NOT NULL,
  name text NOT NULL,
  dose text NOT NULL,
  start_date date NOT NULL,
  end_date date NULL,
  withdrawal_days integer NULL,
  notes text NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  deleted_at timestamptz NULL,
  PRIMARY KEY (id)
);

CREATE INDEX medications_flock_idx ON public.medications USING btree (flock_id, start_date);

ALTER TABLE medications ADD CONSTRAINT medications_flock_id_fkey FOREIGN KEY (flock_id) REFERENCES flocks(id) ON DELETE CASCADE;

CREATE TABLE refresh_tokens (
  id text NOT NULL,
  user_id text NOT NULL,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE UNIQUE INDEX refresh_hash_uq ON public.refresh_tokens USING btree (token_hash);
CREATE INDEX refresh_user_idx ON public.refresh_tokens USING btree (user_id);

ALTER TABLE refresh_tokens ADD CONSTRAINT refresh_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

CREATE TABLE sales (
  id text NOT NULL,
  flock_id text NOT NULL,
  date date NOT NULL,
  count integer NULL,
  total_weight_kg numeric(12,2) NOT NULL,
  price_per_kg numeric(14,0) NOT NULL,
  deductions numeric(14,0) DEFAULT 0 NOT NULL,
  buyer text NULL,
  notes text NULL,
  created_by text NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  deleted_at timestamptz NULL,
  PRIMARY KEY (id)
);

CREATE INDEX sales_flock_date_idx ON public.sales USING btree (flock_id, date);
CREATE INDEX sales_flock_idx ON public.sales USING btree (flock_id, date);

ALTER TABLE sales ADD CONSTRAINT sales_cycle_id_fkey FOREIGN KEY (flock_id) REFERENCES flocks(id) ON DELETE CASCADE;

CREATE TABLE sync_receipts (
  id text NOT NULL,
  farm_id text NOT NULL,
  client_id text NOT NULL,
  entity text NOT NULL,
  entity_id text NOT NULL,
  applied_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE UNIQUE INDEX sync_receipt_uq ON public.sync_receipts USING btree (client_id, entity, entity_id);

ALTER TABLE sync_receipts ADD CONSTRAINT sync_receipts_farm_id_fkey FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE;

CREATE TABLE users (
  id text NOT NULL,
  email text NOT NULL,
  password_hash text NOT NULL,
  name text NOT NULL,
  phone text NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  role text DEFAULT 'owner'::text NOT NULL,
  farm_id text NULL,
  PRIMARY KEY (id)
);

CREATE UNIQUE INDEX users_email_uq ON public.users USING btree (email);
CREATE INDEX users_farm_idx ON public.users USING btree (farm_id);

CREATE TABLE vaccinations (
  id text NOT NULL,
  flock_id text NOT NULL,
  name text NOT NULL,
  scheduled_date date NOT NULL,
  done_date date NULL,
  status text DEFAULT 'scheduled'::text NOT NULL,
  notes text NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  deleted_at timestamptz NULL,
  PRIMARY KEY (id)
);

CREATE INDEX vaccinations_flock_idx ON public.vaccinations USING btree (flock_id, scheduled_date);

ALTER TABLE vaccinations ADD CONSTRAINT vaccinations_flock_id_fkey FOREIGN KEY (flock_id) REFERENCES flocks(id) ON DELETE CASCADE;

CREATE TABLE weight_samples (
  id text NOT NULL,
  flock_id text NOT NULL,
  date date NOT NULL,
  sample_count integer DEFAULT 100 NOT NULL,
  avg_weight_gr integer NOT NULL,
  notes text NULL,
  created_by text NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  deleted_at timestamptz NULL,
  min_weight_gr integer NULL,
  max_weight_gr integer NULL,
  cv_pct numeric(5,2) NULL,
  uniformity_pct numeric(5,2) NULL,
  PRIMARY KEY (id)
);

CREATE INDEX weight_samples_flock_date_idx ON public.weight_samples USING btree (flock_id, date);
CREATE INDEX weight_samples_flock_idx ON public.weight_samples USING btree (flock_id, date);

ALTER TABLE weight_samples ADD CONSTRAINT weight_samples_flock_id_fkey FOREIGN KEY (flock_id) REFERENCES flocks(id) ON DELETE CASCADE;

