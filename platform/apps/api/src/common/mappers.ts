import type {
  DailyLog,
  Expense,
  FarmSettings,
  FeedInventory,
  Flock,
  Hall,
  Medication,
  Sale,
  Vaccination,
  WeightSample,
} from "@farm/domain";
import { isoDate, isoDateTime, money, n, nOrNull } from "./parse";

/** نگاشت ردیف پایگاه داده (numeric به رشته، date به Date) به نوع دامنه */

export function toHall(r: any): Hall {
  return {
    id: r.id,
    farm_id: r.farmId,
    name: r.name,
    capacity: n(r.capacity),
    created_at: isoDateTime(r.createdAt),
    updated_at: isoDateTime(r.updatedAt),
    deleted_at: r.deletedAt ? isoDateTime(r.deletedAt) : null,
  };
}

export function toFlock(r: any): Flock {
  return {
    id: r.id,
    farm_id: r.farmId,
    hall_id: r.hallId,
    name: r.name,
    breed: r.breed,
    start_date: isoDate(r.startDate),
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
    flock_id: r.flockId,
    date: isoDate(r.date),
    mortality: n(r.mortality),
    cull: n(r.cull),
    feed_kg: n(r.feedKg),
    water_liter: n(r.waterLiter),
    avg_temp: nOrNull(r.avgTemp),
    notes: r.notes,
    created_by: r.createdBy,
    created_at: isoDateTime(r.createdAt),
    updated_at: isoDateTime(r.updatedAt),
    deleted_at: r.deletedAt ? isoDateTime(r.deletedAt) : null,
  };
}

export function toWeightSample(r: any): WeightSample {
  return {
    id: r.id,
    flock_id: r.flockId,
    date: isoDate(r.date),
    sample_count: n(r.sampleCount),
    avg_weight_gr: n(r.avgWeightGr),
    notes: r.notes,
    created_by: r.createdBy,
    created_at: isoDateTime(r.createdAt),
    updated_at: isoDateTime(r.updatedAt),
    deleted_at: r.deletedAt ? isoDateTime(r.deletedAt) : null,
  };
}

export function toVaccination(r: any): Vaccination {
  return {
    id: r.id,
    flock_id: r.flockId,
    name: r.name,
    scheduled_date: isoDate(r.scheduledDate),
    done_date: r.doneDate ? isoDate(r.doneDate) : null,
    status: r.status,
    notes: r.notes,
    created_at: isoDateTime(r.createdAt),
    updated_at: isoDateTime(r.updatedAt),
    deleted_at: r.deletedAt ? isoDateTime(r.deletedAt) : null,
  };
}

export function toMedication(r: any): Medication {
  return {
    id: r.id,
    flock_id: r.flockId,
    name: r.name,
    dose: r.dose,
    start_date: isoDate(r.startDate),
    end_date: r.endDate ? isoDate(r.endDate) : null,
    withdrawal_days: nOrNull(r.withdrawalDays),
    notes: r.notes,
    created_at: isoDateTime(r.createdAt),
    updated_at: isoDateTime(r.updatedAt),
    deleted_at: r.deletedAt ? isoDateTime(r.deletedAt) : null,
  };
}

export function toExpense(r: any): Expense {
  return {
    id: r.id,
    flock_id: r.flockId,
    date: isoDate(r.date),
    category: r.category,
    amount: money(r.amount),
    description: r.description,
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
    flock_id: r.flockId,
    date: isoDate(r.date),
    total_weight_kg: n(r.totalWeightKg),
    price_per_kg: money(r.pricePerKg),
    buyer: r.buyer,
    count: nOrNull(r.count),
    deductions: money(r.deductions),
    notes: r.notes,
    created_by: r.createdBy,
    created_at: isoDateTime(r.createdAt),
    updated_at: isoDateTime(r.updatedAt),
    deleted_at: r.deletedAt ? isoDateTime(r.deletedAt) : null,
  };
}

export function toFeedInventory(r: any): FeedInventory {
  return {
    id: r.id,
    farm_id: r.farmId,
    feed_type: r.feedType,
    quantity_kg: n(r.quantityKg),
    updated_at: isoDateTime(r.updatedAt),
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
