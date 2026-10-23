import test from "node:test";
import assert from "node:assert/strict";
import {
  toJalali,
  toGregorian,
  jalaliToIso,
  isoToJalali,
  jalaliMonthLength,
  isoDaysBetween,
  addDaysIso,
  formatJalali,
  faDigits,
} from "../src/jalali";

test("تبدیل میلادی به شمسی برای تاریخ‌های شناخته‌شده", () => {
  assert.deepEqual(toJalali(2026, 10, 23), { jy: 1405, jm: 8, jd: 1 });
  assert.deepEqual(toJalali(2025, 3, 20), { jy: 1403, jm: 12, jd: 30 });
  assert.deepEqual(toJalali(2025, 3, 21), { jy: 1404, jm: 1, jd: 1 });
  assert.deepEqual(toJalali(2026, 3, 21), { jy: 1405, jm: 1, jd: 1 });
});

test("رفت و برگشت تاریخ برای ۸ سال متوالی بدون خطا", () => {
  let iso = "2023-01-01";
  for (let i = 0; i < 3000; i++) {
    const j = isoToJalali(iso);
    assert.equal(jalaliToIso(j.jy, j.jm, j.jd), iso, `round trip failed for ${iso}`);
    iso = addDaysIso(iso, 1);
  }
});

test("طول ماه‌های شمسی و سال کبیسه", () => {
  assert.equal(jalaliMonthLength(1403, 12), 30); // ۱۴۰۳ کبیسه
  assert.equal(jalaliMonthLength(1404, 12), 29);
  for (let m = 1; m <= 6; m++) assert.equal(jalaliMonthLength(1404, m), 31);
  for (let m = 7; m <= 11; m++) assert.equal(jalaliMonthLength(1404, m), 30);
});

test("فاصله روزها و قالب‌بندی", () => {
  assert.equal(isoDaysBetween("2026-01-01", "2026-01-31"), 30);
  assert.equal(isoDaysBetween("2025-03-20", "2025-03-21"), 1);
  assert.equal(formatJalali("2026-10-23"), "۱۴۰۵/۰۸/۰۱");
  assert.equal(faDigits("172.5"), "۱۷۲٫۵");
});

test("تبدیل شمسی به میلادی", () => {
  assert.deepEqual(toGregorian(1404, 1, 1), { gy: 2025, gm: 3, gd: 21 });
  assert.deepEqual(toGregorian(1405, 8, 1), { gy: 2026, gm: 10, gd: 23 });
});
