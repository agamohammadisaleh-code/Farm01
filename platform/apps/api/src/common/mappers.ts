import type { Cost, CostCategory, Cycle, DailyLog, FarmSettings, Sale } from "@farm/domain";
import { isoDate, isoDateTime, money, n, nOrNull } from "./parse";

/** نگاشت ردیف پایگاه داده (numeric به رشته، date به Date) به نوع دامنه */

export function toCycle(r: any): Cycle {
  return {
    id: r.id,
    farm_id: r.farmId,
    name: r.name,
    house: r.house ?? "",
    breed: r.breed,
    placement_date: isoDate(r.placementDate),
    initial_count: n(r.initialCount),
    chick_price: money(r.chickPrice),
    target_weight_g: n(r.targetWeightG),
    target_age_days: n(r.targetAgeDays),
    status: r.status,
    closed_date: r.closedDate ? isoDate(r.closedDate) : null,
    notes: r.notes,
    created_by: r.createdBy,
    created_at: isoDateTime(r.createdAt),
    updated_at: isoDateTime(r.updatedAt),
    deleted_at: r.deletedAt ? isoDateTime(r.deletedAt) : null,
  };
}

export function toLog(r: any): DailyLog {
  return {
    id: r.id,
    farm_id: r.farmId,
    cycle_id: r.cycleId,
    date: isoDate(r.date),
    mortality: n(r.mortality),
    culls: n(r.culls),
    feed_kg: n(r.feedKg),
    water_l: n(r.waterL),
    temp_c: nOrNull(r.tempC),
    avg_weight_g: nOrNull(r.avgWeightG),
    feed_type: r.feedType,
    notes: r.notes,
    created_by: r.createdBy,
    created_at: isoDateTime(r.createdAt),
    updated_at: isoDateTime(r.updatedAt),
    deleted_at: r.deletedAt ? isoDateTime(r.deletedAt) : null,
  };
}

export function toCost(r: any): Cost {
  return {
    id: r.id,
    farm_id: r.farmId,
    cycle_id: r.cycleId,
    date: isoDate(r.date),
    category: r.category as CostCategory,
    description: r.description,
    amount: money(r.amount),
    quantity: nOrNull(r.quantity),
    unit: r.unit,
    vendor: r.vendor,
    created_by: r.createdBy,
    created_at: isoDateTime(r.createdAt),
    updated_at: isoDateTime(r.updatedAt),
    deleted_at: r.deletedAt ? isoDateTime(r.deletedAt) : null,
  };
}

export function toSale(r: any): Sale {
  return {
    id: r.id,
    farm_id: r.farmId,
    cycle_id: r.cycleId,
    date: isoDate(r.date),
    count: n(r.count),
    weight_kg: n(r.weightKg),
    price_per_kg: money(r.pricePerKg),
    deductions: money(r.deductions),
    buyer: r.buyer,
    notes: r.notes,
    created_by: r.createdBy,
    created_at: isoDateTime(r.createdAt),
    updated_at: isoDateTime(r.updatedAt),
    deleted_at: r.deletedAt ? isoDateTime(r.deletedAt) : null,
  };
}

export function toSettings(r: any): FarmSettings {
  return {
    farm_id: r.farmId,
    market_price: money(r.marketPrice),
    feed_price: money(r.feedPrice),
    target_weight_g: n(r.targetWeightG),
    target_age_days: n(r.targetAgeDays),
    default_breed: r.defaultBreed,
    timezone: r.timezone,
    updated_at: isoDateTime(r.updatedAt),
  };
}
