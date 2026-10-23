/* شکل داده‌هایی که API می‌دهد.
   فقط فیلدهایی که رابط کاربری مصرف می‌کند تایپ شده‌اند؛ بقیه پاسخ نادیده
   گرفته می‌شود. منبع حقیقت محاسبات، بسته `@farm/domain` و سرور است. */

export type Role = "owner" | "manager" | "worker" | "vet";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  phone?: string | null;
  farms: { farmId: string; role: Role; name: string }[];
}

export interface DailyPoint {
  day: number;
  date: string;
  weightG: number | null;
  stdWeightG: number;
  feedKg: number;
  stdDailyFeedKg: number;
  mortality: number;
  liveBirds: number;
  cumFeedKg: number;
  stdCumFeedKg: number;
  waterL: number | null;
  tempC: number | null;
  avgWeightG: number | null;
}

export interface FlockRef {
  id: string;
  name: string;
  breed: string;
  hall_id: string;
  start_date: string;
  initial_count: number;
  target_weight_g: number;
  target_age_days: number;
  status: "active" | "closed" | string;
}

export interface Alert {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  detail: string;
  recommendation?: string;
  action?: { label: string; href?: string } | null;
}

export interface FlockMetrics {
  flock: FlockRef;
  ageDays: number;
  targetAge: number;
  daysRemaining: number;
  liveBirds: number;
  lostBirds: number;
  mortalityPct: number;
  cullPct: number;
  removalPct: number;
  expectedMortalityPct: number;
  dailyMortalityPct: number;
  waterChangePct: number;
  totalFeedKg: number;
  todayFeedKg: number;
  avgDailyFeedG: number;
  expectedDailyFeedKg: number;
  lastWaterL: number;
  waterBaselineL: number;
  feedStockKg: number;
  feedDaysLeft: number;
  currentWeightG: number;
  weightSource: "measured" | "estimated" | string;
  measuredWeightG: number | null;
  stdWeightG: number;
  weightVsStdPct: number;
  dailyGainG: number;
  fcr: number;
  stdFcr: number;
  feedVsStdPct: number;
  /* شاخص‌های مالی برای نقش‌های بدون `cost:read` توسط API حذف می‌شوند */
  totalCost?: number;
  costPerBird?: number;
  costPerKgLive?: number;
  revenue?: number;
  liveBiomassKg: number;
  estimatedLiveValue?: number;
  netProfit?: number;
  marginPct?: number;
  breakevenPerKg?: number;
  marketPrice?: number;
  targetWeightG: number;
  projection?: {
    targetAge: number;
    daysRemaining: number;
    projectedWeightG: number;
    projectedCost: number;
    projectedRevenue: number;
    projectedProfit: number;
    projectedFcr: number;
  };
  costBreakdown: { key: string; label: string; color: string; amount: number; share: number }[];
  alerts: Alert[];
  dailySeries: DailyPoint[];
}

export interface Overview {
  activeMetrics: FlockMetrics[];
  closedMetrics: FlockMetrics[];
  liveBirds: number;
  liveBiomassKg: number;
  activeCost: number;
  activeProjectedProfit: number;
  activeProjectedRevenue: number;
  realizedProfit: number;
  realizedRevenue: number;
  alerts: Alert[];
  mortalityPctWeighted: number;
  costBreakdown: { key: string; label: string; color: string; amount: number; share: number }[];
  generatedAt: string;
}

export interface Reminder {
  id: string;
  kind: string;
  severity: "critical" | "warning" | "info";
  title: string;
  detail: string;
  due: string | null;
  daysLeft: number | null;
  flockId: string | null;
  flockName: string | null;
  href: string | null;
}

export interface DailyLog {
  id: string;
  flock_id: string;
  date: string;
  mortality: number;
  cull: number;
  feed_kg: number;
  water_liter: number;
  avg_temp: number | null;
}
