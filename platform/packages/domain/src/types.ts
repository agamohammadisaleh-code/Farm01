/**
 * انواع مشترک دامنه — بدون وابستگی به فریم‌ورک یا پایگاه داده.
 *
 * مدل داده در هفت موجودیت اصلی سازمان می‌یابد:
 *
 *   Farm (مزرعه)
 *     └── Hall (سالن)
 *           └── Flock (گله/دوره)
 *                 ├── DailyLog (ثبت روزانه)
 *                 ├── WeightSample (وزن‌گیری)
 *                 ├── Vaccination (واکسن)
 *                 ├── Medication (دارو)
 *                 ├── Expense (هزینه)
 *                 └── Sale (فروش)
 *   Farm ── FeedInventory (انبار دان)
 *   User ── نقش و مزرعه
 *
 * قواعد:
 * - شناسه‌ها UUID متنی‌اند تا کلاینت آفلاین بتواند پیش از اتصال رکورد بسازد
 *   و هنگام همگام‌سازی همان شناسه را بفرستد.
 * - تاریخ‌های کاری `YYYY-MM-DD` میلادی نگهداری و در لایه نمایش شمسی می‌شوند.
 * - زمان ثبت (`created_at`/`updated_at`) ISO کامل و `deleted_at` برای حذف نرم.
 */

/* ---------------------------------- کاربر و مزرعه ---------------------------------- */

export type Role = "owner" | "manager" | "worker" | "vet";

export const ROLE_LABELS: Record<Role, string> = {
  owner: "مالک",
  manager: "مدیر مزرعه",
  worker: "کارگر",
  vet: "دامپزشک",
};

export interface User {
  id: string;
  name: string;
  phone: string | null;
  email: string;
  /** نقش در مزرعه اصلی */
  role: Role;
  /** مزرعه اصلی کاربر */
  farm_id: string | null;
  created_at: string;
}

export interface Farm {
  id: string;
  name: string;
  location: string | null;
  owner_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/** عضویت چندمزرعه‌ای؛ مالکیت با farms.owner_id و دسترسی با همین جدول کنترل می‌شود */
export interface FarmMember {
  farm_id: string;
  user_id: string;
  role: Role;
  created_at: string;
}

export interface FarmSettings {
  farm_id: string;
  market_price: number;
  feed_price: number;
  target_weight_g: number;
  target_age_days: number;
  default_breed: string;
  /** آستانه هشدار انبار دان (روز) */
  feed_alert_days?: number;
  timezone: string;
  updated_at: string;
}

export const DEFAULT_SETTINGS: Omit<FarmSettings, "farm_id" | "updated_at"> = {
  market_price: 98000,
  feed_price: 33500,
  target_weight_g: 2500,
  target_age_days: 42,
  default_breed: "راس ۳۰۸",
  feed_alert_days: 3,
  timezone: "Asia/Tehran",
};

/* ---------------------------------- سالن و گله ---------------------------------- */

export interface Hall {
  id: string;
  farm_id: string;
  name: string;
  /** ظرفیت اسمی سالن (قطعه) */
  capacity: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type FlockStatus = "active" | "closed";

export interface Flock {
  id: string;
  farm_id: string;
  hall_id: string;
  name: string;
  breed: string;
  start_date: string;
  initial_count: number;
  /** قیمت جوجه یک‌روزه (تومان) */
  chick_price: number;
  target_weight_g: number;
  target_age_days: number;
  status: FlockStatus;
  closed_date: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/** نام قدیمی گله در نسخه اول؛ برای سازگاری کد مهاجرت و وب فعلی */
export type Cycle = Flock;

/* ---------------------------------- ثبت روزانه ---------------------------------- */

export interface DailyLog {
  id: string;
  flock_id: string;
  date: string;
  mortality: number;
  cull: number;
  feed_kg: number;
  water_liter: number;
  /** میانگین دمای سالن (سلسیوس) */
  avg_temp: number | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/** وزن‌گیری نمونه‌ای — منبع رسمی وزن گله (جدا از ثبت روزانه) */
export interface WeightSample {
  id: string;
  flock_id: string;
  date: string;
  /** تعداد قطعه وزن‌شده در نمونه */
  sample_count: number;
  /** میانگین وزن نمونه (گرم) */
  avg_weight_gr: number;
  /** سبک‌ترین و سنگین‌ترین قطعه نمونه (اختیاری، برای برآورد پراکندگی) */
  min_weight_gr?: number | null;
  max_weight_gr?: number | null;
  /** ضریب تغییرات (٪) */
  cv_pct?: number | null;
  /** یکنواختی (٪): سهم قطعه‌های داخل ±۱۰٪ میانگین */
  uniformity_pct?: number | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/* ---------------------------------- سلامت ---------------------------------- */

export type VaccinationStatus = "scheduled" | "done" | "skipped";

export interface Vaccination {
  id: string;
  flock_id: string;
  name: string;
  scheduled_date: string;
  done_date: string | null;
  status: VaccinationStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Medication {
  id: string;
  flock_id: string;
  name: string;
  /** دوز مصرفی، مثلاً «۱ گرم در لیتر» */
  dose: string;
  start_date: string;
  end_date: string | null;
  withdrawal_days: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/* ---------------------------------- مالی ---------------------------------- */

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

export interface Expense {
  id: string;
  flock_id: string;
  date: string;
  category: CostCategory;
  amount: number;
  description: string;
  /** برای خرید دان: مقدار و واحد، تا موجودی انبار به‌روز شود */
  quantity: number | null;
  unit: string | null;
  vendor: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/** نام قدیمی هزینه در نسخه اول */
export type Cost = Expense;

export interface Sale {
  id: string;
  flock_id: string;
  date: string;
  /** وزن کل فروخته‌شده (کیلوگرم) */
  total_weight_kg: number;
  price_per_kg: number;
  buyer: string | null;
  /** تعداد قطعه (اختیاری — اگر ثبت شود، شمارش زنده دقیق‌تر است) */
  count: number | null;
  deductions: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/* ---------------------------------- انبار دان ---------------------------------- */

export interface FeedInventory {
  id: string;
  farm_id: string;
  feed_type: string;
  quantity_kg: number;
  updated_at: string;
}

/* ---------------------------------- همگام‌سازی ---------------------------------- */

/** فیلدهای مشترک رکوردهای قابل همگام‌سازی آفلاین */
export interface Syncable {
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
