export type CycleStatus = "active" | "closed";

export interface Cycle {
  id: number;
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
  created_at: string;
}

export interface DailyLog {
  id: number;
  cycle_id: number;
  date: string;
  mortality: number;
  culls: number;
  feed_kg: number;
  water_l: number;
  temp_c: number | null;
  avg_weight_g: number | null;
  feed_type: string | null;
  notes: string | null;
}

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

export interface Cost {
  id: number;
  cycle_id: number;
  date: string;
  category: CostCategory;
  description: string;
  amount: number;
  quantity: number | null;
  unit: string | null;
  vendor: string | null;
}

export interface Sale {
  id: number;
  cycle_id: number;
  date: string;
  count: number;
  weight_kg: number;
  price_per_kg: number;
  deductions: number;
  buyer: string | null;
  notes: string | null;
}

export interface Settings {
  farm_name: string;
  market_price: number;
  feed_price: number;
  target_weight_g: number;
  target_age_days: number;
  default_breed: string;
}
