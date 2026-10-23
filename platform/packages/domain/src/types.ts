/**
 * انواع مشترک دامنه — بدون وابستگی به فریم‌ورک یا پایگاه داده.
 *
 * شناسه‌ها رشته (UUID) هستند تا اپلیکیشن موبایل بتواند در حالت آفلاین
 * رکورد بسازد و پس از اتصال، همان شناسه را برای همگام‌سازی ارسال کند.
 * تاریخ‌های کاری (date) به شکل `YYYY-MM-DD` میلادی نگهداری و در لایه نمایش
 * به شمسی تبدیل می‌شوند؛ زمان ثبت (created_at/updated_at) ISO کامل است.
 */

export type CycleStatus = "active" | "closed";

export type Role = "owner" | "manager" | "worker" | "vet";

export const ROLE_LABELS: Record<Role, string> = {
  owner: "مالک",
  manager: "مدیر مزرعه",
  worker: "کارگر",
  vet: "دامپزشک",
};

export type CostCategory =
  | "chick"
  | "feed"
  | "medication"
  | "vaccine"
  | "labor"
  | "energy"
  | "litter"
  | "transport"
  | "equipment"
  | "other";

export interface User {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  created_at: string;
}

export interface Farm {
  id: string;
  name: string;
  location: string | null;
  created_at: string;
}

export interface FarmMember {
  farm_id: string;
  user_id: string;
  role: Role;
  created_at: string;
}

/** ردیف همگام‌سازی: هر رکورد قابل نوشتن این فیلدها را دارد */
export interface Syncable {
  created_at: string;
  updated_at: string;
  /** حذف نرم برای همگام‌سازی آفلاین */
  deleted_at: string | null;
}

export interface Cycle extends Syncable {
  id: string;
  farm_id: string;
  name: string;
  house: string;
  breed: string;
  placement_date: string;
  initial_count: number;
  chick_price: number;
  target_weight_g: number;
  target_age_days: number;
  status: CycleStatus;
  closed_date: string | null;
  notes: string | null;
  created_by: string | null;
}

export interface DailyLog extends Syncable {
  id: string;
  farm_id: string;
  cycle_id: string;
  date: string;
  mortality: number;
  culls: number;
  feed_kg: number;
  water_l: number;
  temp_c: number | null;
  avg_weight_g: number | null;
  feed_type: string | null;
  notes: string | null;
  created_by: string | null;
}

export interface Cost extends Syncable {
  id: string;
  farm_id: string;
  cycle_id: string;
  date: string;
  category: CostCategory;
  description: string;
  amount: number;
  quantity: number | null;
  unit: string | null;
  vendor: string | null;
  created_by: string | null;
}

export interface Sale extends Syncable {
  id: string;
  farm_id: string;
  cycle_id: string;
  date: string;
  count: number;
  weight_kg: number;
  price_per_kg: number;
  deductions: number;
  buyer: string | null;
  notes: string | null;
  created_by: string | null;
}

export interface FarmSettings {
  farm_id: string;
  market_price: number;
  feed_price: number;
  target_weight_g: number;
  target_age_days: number;
  default_breed: string;
  timezone: string;
  updated_at: string;
}

export const DEFAULT_SETTINGS: Omit<FarmSettings, "farm_id" | "updated_at"> = {
  market_price: 98000,
  feed_price: 33500,
  target_weight_g: 2500,
  target_age_days: 42,
  default_breed: "راس ۳۰۸",
  timezone: "Asia/Tehran",
};
