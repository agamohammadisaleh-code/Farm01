"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb, resetDemoData, clearAllData, saveSettings } from "@/lib/db";
import { getCycle, getLogs } from "@/lib/metrics";
import { parseNumber } from "@/lib/format";
import { todayIso } from "@/lib/jalali";

export interface ActionState {
  ok: boolean;
  message?: string;
  errors?: Record<string, string>;
  at?: number;
}

/** بازتازه‌سازی کش صفحات؛ بیرون از چرخه درخواست (مثلاً تست) بی‌اثر است */
function refresh() {
  try {
    revalidatePath("/", "layout");
  } catch {
    /* بدون درخواست فعال — نادیده گرفته می‌شود */
  }
}

const ok = (message: string): ActionState => ({ ok: true, message, at: Date.now() });
const fail = (message: string, errors?: Record<string, string>): ActionState => ({
  ok: false,
  message,
  errors,
  at: Date.now(),
});

function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return v ? String(v).trim() : "";
}

function numField(fd: FormData, key: string): number {
  return parseNumber(fd.get(key));
}

function isValidIso(iso: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) && !Number.isNaN(Date.parse(iso));
}

/* ---------------------------------- دوره ---------------------------------- */

export async function createCycleAction(_prev: ActionState | null, fd: FormData): Promise<ActionState> {
  const name = str(fd, "name");
  const house = str(fd, "house");
  const breed = str(fd, "breed") || "راس ۳۰۸";
  const placement = str(fd, "placement_date");
  const initial = numField(fd, "initial_count");
  const chickPrice = numField(fd, "chick_price");
  const targetWeight = numField(fd, "target_weight_g");
  const targetAge = numField(fd, "target_age_days");
  const notes = str(fd, "notes");

  const errors: Record<string, string> = {};
  if (!name) errors.name = "نام دوره را وارد کنید.";
  if (!isValidIso(placement)) errors.placement_date = "تاریخ جوجه‌ریزی معتبر نیست.";
  if (!initial || initial < 1) errors.initial_count = "تعداد جوجه باید حداقل ۱ باشد.";
  if (initial > 500000) errors.initial_count = "تعداد جوجه بیش از حد بزرگ است.";
  if (Number.isNaN(chickPrice) || chickPrice < 0) errors.chick_price = "قیمت جوجه را وارد کنید.";
  if (!targetWeight || targetWeight < 1000 || targetWeight > 5000) errors.target_weight_g = "وزن هدف باید بین ۱۰۰۰ تا ۵۰۰۰ گرم باشد.";
  if (!targetAge || targetAge < 21 || targetAge > 70) errors.target_age_days = "سن هدف باید بین ۲۱ تا ۷۰ روز باشد.";
  if (placement && placement > todayIso()) errors.placement_date = "تاریخ جوجه‌ریزی نمی‌تواند در آینده باشد.";
  if (Object.keys(errors).length) return fail("لطفاً خطاهای فرم را برطرف کنید.", errors);

  const db = getDb();
  const res = db
    .prepare(
      `INSERT INTO cycles (name, house, breed, placement_date, initial_count, chick_price, target_weight_g, target_age_days, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
    )
    .run(name, house, breed, placement, Math.round(initial), Math.round(chickPrice), Math.round(targetWeight), Math.round(targetAge), notes || null);

  const id = Number(res.lastInsertRowid);
  // هزینه جوجه به‌صورت خودکار ثبت می‌شود
  if (chickPrice > 0) {
    db.prepare(
      `INSERT INTO costs (cycle_id, date, category, description, amount, quantity, unit, vendor)
       VALUES (?, ?, 'chick', 'خرید جوجه یک‌روزه', ?, ?, 'قطعه', NULL)`,
    ).run(id, placement, Math.round(initial) * Math.round(chickPrice), Math.round(initial));
  }
  refresh();
  redirect(`/cycles/${id}?created=1`);
}

export async function updateCycleAction(_prev: ActionState | null, fd: FormData): Promise<ActionState> {
  const cycleId = Number(fd.get("cycle_id"));
  const cycle = getCycle(cycleId);
  if (!cycle) return fail("دوره یافت نشد.");

  const name = str(fd, "name");
  const house = str(fd, "house");
  const breed = str(fd, "breed") || cycle.breed;
  const placement = str(fd, "placement_date");
  const targetWeight = numField(fd, "target_weight_g");
  const targetAge = numField(fd, "target_age_days");
  const notes = str(fd, "notes");

  const errors: Record<string, string> = {};
  if (!name) errors.name = "نام دوره را وارد کنید.";
  if (!isValidIso(placement)) errors.placement_date = "تاریخ جوجه‌ریزی معتبر نیست.";
  if (placement > todayIso()) errors.placement_date = "تاریخ جوجه‌ریزی نمی‌تواند در آینده باشد.";
  if (!targetWeight || targetWeight < 1000 || targetWeight > 5000) errors.target_weight_g = "وزن هدف باید بین ۱۰۰۰ تا ۵۰۰۰ گرم باشد.";
  if (!targetAge || targetAge < 21 || targetAge > 70) errors.target_age_days = "سن هدف باید بین ۲۱ تا ۷۰ روز باشد.";
  if (Object.keys(errors).length) return fail("تغییرات ذخیره نشد.", errors);

  getDb()
    .prepare(
      `UPDATE cycles SET name=?, house=?, breed=?, placement_date=?, target_weight_g=?, target_age_days=?, notes=? WHERE id=?`,
    )
    .run(name, house, breed, placement, Math.round(targetWeight), Math.round(targetAge), notes || null, cycleId);
  refresh();
  return ok("اطلاعات دوره به‌روزرسانی شد.");
}

export async function archiveCycleAction(cycleId: number, closedDate: string) {
  const db = getDb();
  const cycle = getCycle(cycleId);
  if (!cycle) return;
  db.prepare("UPDATE cycles SET status = 'closed', closed_date = ? WHERE id = ?").run(closedDate || todayIso(), cycleId);
  refresh();
}

export async function reopenCycleAction(cycleId: number) {
  const db = getDb();
  db.prepare("UPDATE cycles SET status = 'active', closed_date = NULL WHERE id = ?").run(cycleId);
  refresh();
}

export async function deleteCycleAction(cycleId: number) {
  const db = getDb();
  db.prepare("DELETE FROM cycles WHERE id = ?").run(cycleId);
  refresh();
  redirect("/cycles");
}

/* ---------------------------------- ثبت روزانه ---------------------------------- */

export async function saveDailyLogAction(_prev: ActionState | null, fd: FormData): Promise<ActionState> {
  const cycleId = Number(fd.get("cycle_id"));
  const cycle = getCycle(cycleId);
  if (!cycle) return fail("دوره یافت نشد.");
  const date = str(fd, "date");
  const mortality = numField(fd, "mortality") || 0;
  const culls = numField(fd, "culls") || 0;
  const feedKg = numField(fd, "feed_kg") || 0;
  const waterL = numField(fd, "water_l") || 0;
  const tempRaw = str(fd, "temp_c");
  const temp = tempRaw ? numField(fd, "temp_c") : null;
  const weightRaw = str(fd, "avg_weight_g");
  const weight = weightRaw ? numField(fd, "avg_weight_g") : null;
  const notes = str(fd, "notes").slice(0, 500);
  const feedType = str(fd, "feed_type").slice(0, 60);

  const errors: Record<string, string> = {};
  if (!isValidIso(date)) errors.date = "تاریخ معتبر نیست.";
  if (mortality < 0 || culls < 0) errors.mortality = "تلفات نمی‌تواند منفی باشد.";
  if (mortality > 100000 || culls > 100000) errors.mortality = "عدد وارد‌شده غیرمنطقی است.";
  if (feedKg > 500000) errors.feed_kg = "مقدار دان غیرمنطقی است.";
  if (waterL > 2000000) errors.water_l = "مقدار آب غیرمنطقی است.";
  if (feedKg < 0) errors.feed_kg = "مقدار دان نمی‌تواند منفی باشد.";
  if (waterL < 0) errors.water_l = "مقدار آب نمی‌تواند منفی باشد.";
  if (temp !== null && (Number.isNaN(temp) || temp < -10 || temp > 50)) errors.temp_c = "دمای سالن باید بین ۱۰- تا ۵۰ درجه باشد.";
  if (weight !== null && (Number.isNaN(weight) || weight < 20 || weight > 6000)) errors.avg_weight_g = "وزن باید بین ۲۰ تا ۶۰۰۰ گرم باشد.";
  if (date < cycle.placement_date) errors.date = "تاریخ نمی‌تواند قبل از جوجه‌ریزی باشد.";
  if (date > todayIso()) errors.date = "ثبت تاریخ آینده مجاز نیست.";

  const logs = getLogs(cycleId).filter((l) => l.date !== date);
  const previousLost = logs.reduce((s, l) => s + l.mortality + l.culls, 0);
  const prevLive = cycle.initial_count - previousLost;
  if (mortality + culls > prevLive) errors.mortality = `تلفات از تعداد زنده (${prevLive} قطعه) بیشتر است.`;
  if (Object.keys(errors).length) return fail("ثبت انجام نشد؛ مقادیر را بررسی کنید.", errors);

  const db = getDb();
  const existed = Boolean(
    db.prepare("SELECT 1 FROM daily_logs WHERE cycle_id = ? AND date = ?").get(cycleId, date),
  );
  // ثبت و ویرایش با یک دستور اتمیک (بدون شرط مسابقه)
  db.prepare(
    `INSERT INTO daily_logs (cycle_id, date, mortality, culls, feed_kg, water_l, temp_c, avg_weight_g, feed_type, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(cycle_id, date) DO UPDATE SET
       mortality = excluded.mortality,
       culls = excluded.culls,
       feed_kg = excluded.feed_kg,
       water_l = excluded.water_l,
       temp_c = excluded.temp_c,
       avg_weight_g = excluded.avg_weight_g,
       feed_type = excluded.feed_type,
       notes = excluded.notes`,
  ).run(cycleId, date, mortality, culls, feedKg, waterL, temp, weight, feedType || null, notes || null);
  refresh();
  return ok(existed ? "آمار این روز به‌روزرسانی شد." : "آمار روزانه با موفقیت ثبت شد.");
}

export async function deleteDailyLogAction(id: number) {
  getDb().prepare("DELETE FROM daily_logs WHERE id = ?").run(id);
  refresh();
}

/* ---------------------------------- هزینه ---------------------------------- */

export async function saveCostAction(_prev: ActionState | null, fd: FormData): Promise<ActionState> {
  const cycleId = Number(fd.get("cycle_id"));
  const cycle = getCycle(cycleId);
  if (!cycle) return fail("دوره یافت نشد.");
  const date = str(fd, "date");
  const category = str(fd, "category") || "other";
  const description = str(fd, "description").slice(0, 160);
  const amount = numField(fd, "amount");
  const quantityRaw = str(fd, "quantity");
  const quantity = quantityRaw ? numField(fd, "quantity") : null;
  const unit = str(fd, "unit") || null;
  const vendor = str(fd, "vendor") || null;

  const errors: Record<string, string> = {};
  if (!isValidIso(date)) errors.date = "تاریخ معتبر نیست.";
  if (!description) errors.description = "شرح هزینه را وارد کنید.";
  if (!amount || amount <= 0) errors.amount = "مبلغ باید بزرگ‌تر از صفر باشد.";
  if (amount > 1e13) errors.amount = "مبلغ وارد‌شده غیرمنطقی است.";
  if (date > todayIso()) errors.date = "ثبت تاریخ آینده مجاز نیست.";
  if (date < cycle.placement_date) errors.date = "تاریخ هزینه نمی‌تواند پیش از جوجه‌ریزی باشد.";
  if (quantity !== null && (Number.isNaN(quantity) || quantity < 0)) errors.quantity = "مقدار معتبر نیست.";
  if (quantity !== null && quantity > 1e7) errors.quantity = "مقدار وارد‌شده غیرمنطقی است.";
  if (Object.keys(errors).length) return fail("هزینه ثبت نشد.", errors);

  getDb()
    .prepare(
      `INSERT INTO costs (cycle_id, date, category, description, amount, quantity, unit, vendor)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(cycleId, date, category, description, Math.round(amount), quantity, unit, vendor);
  refresh();
  return ok("هزینه ثبت شد.");
}

export async function deleteCostAction(id: number) {
  getDb().prepare("DELETE FROM costs WHERE id = ?").run(id);
  refresh();
}

/* ---------------------------------- فروش ---------------------------------- */

export async function saveSaleAction(_prev: ActionState | null, fd: FormData): Promise<ActionState> {
  const cycleId = Number(fd.get("cycle_id"));
  const cycle = getCycle(cycleId);
  if (!cycle) return fail("دوره یافت نشد.");
  const date = str(fd, "date");
  const count = numField(fd, "count");
  const weightKg = numField(fd, "weight_kg");
  const price = numField(fd, "price_per_kg");
  const deductions = numField(fd, "deductions") || 0;
  const buyer = str(fd, "buyer").slice(0, 80) || null;
  const notes = str(fd, "notes").slice(0, 300) || null;

  const errors: Record<string, string> = {};
  if (!isValidIso(date)) errors.date = "تاریخ معتبر نیست.";
  if (!count || count < 1) errors.count = "تعداد قطعه فروش را وارد کنید.";
  if (!weightKg || weightKg <= 0) errors.weight_kg = "وزن کل محموله (کیلوگرم) را وارد کنید.";
  if (!price || price <= 0) errors.price_per_kg = "قیمت هر کیلوگرم را وارد کنید.";
  if (price > 1e8) errors.price_per_kg = "قیمت وارد‌شده غیرمنطقی است.";
  if (deductions < 0) errors.deductions = "کسورات نمی‌تواند منفی باشد.";
  if (weightKg > 2e6) errors.weight_kg = "وزن وارد‌شده غیرمنطقی است.";
  if (date > todayIso()) errors.date = "ثبت تاریخ آینده مجاز نیست.";
  if (date < cycle.placement_date) errors.date = "تاریخ فروش نمی‌تواند پیش از جوجه‌ریزی باشد.";
  if (Object.keys(errors).length) return fail("فروش ثبت نشد.", errors);

  const db = getDb();
  const sold = db.prepare("SELECT COALESCE(SUM(count),0) AS c FROM sales WHERE cycle_id = ?").get(cycleId) as { c: number };
  const lost = getLogs(cycleId).reduce((s, l) => s + l.mortality + l.culls, 0);
  const live = cycle.initial_count - lost - sold.c;
  if (count > live) errors.count = `تعداد فروش بیشتر از قطعه زنده موجود (${live}) است.`;
  if (Object.keys(errors).length) return fail("فروش ثبت نشد.", errors);

  db.prepare(
    `INSERT INTO sales (cycle_id, date, count, weight_kg, price_per_kg, deductions, buyer, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(cycleId, date, Math.round(count), weightKg, price, deductions, buyer, notes);
  refresh();
  return ok("فروش ثبت شد.");
}

export async function deleteSaleAction(id: number) {
  getDb().prepare("DELETE FROM sales WHERE id = ?").run(id);
  refresh();
}

/* ---------------------------------- تنظیمات ---------------------------------- */

export async function saveSettingsAction(_prev: ActionState | null, fd: FormData): Promise<ActionState> {
  const farmName = str(fd, "farm_name");
  const marketPrice = numField(fd, "market_price");
  const feedPrice = numField(fd, "feed_price");
  const targetWeight = numField(fd, "target_weight_g");
  const targetAge = numField(fd, "target_age_days");
  const defaultBreed = str(fd, "default_breed");

  const errors: Record<string, string> = {};
  if (!farmName) errors.farm_name = "نام مزرعه را وارد کنید.";
  if (!marketPrice || marketPrice <= 0) errors.market_price = "قیمت بازار معتبر نیست.";
  if (!feedPrice || feedPrice <= 0) errors.feed_price = "قیمت دان معتبر نیست.";
  if (!targetWeight || targetWeight < 1000 || targetWeight > 5000) errors.target_weight_g = "وزن هدف معتبر نیست.";
  if (!targetAge || targetAge < 21 || targetAge > 70) errors.target_age_days = "سن هدف معتبر نیست.";
  if (Object.keys(errors).length) return fail("تنظیمات ذخیره نشد.", errors);

  saveSettings({
    farm_name: farmName,
    market_price: Math.round(marketPrice),
    feed_price: Math.round(feedPrice),
    target_weight_g: Math.round(targetWeight),
    target_age_days: Math.round(targetAge),
    default_breed: defaultBreed || "راس ۳۰۸",
  });
  refresh();
  return ok("تنظیمات ذخیره شد.");
}

export async function resetDemoAction() {
  resetDemoData();
  refresh();
  redirect("/?reset=1");
}

export async function clearDataAction() {
  clearAllData();
  refresh();
  redirect("/?cleared=1");
}
