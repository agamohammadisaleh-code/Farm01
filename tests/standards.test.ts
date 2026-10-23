import test from "node:test";
import assert from "node:assert/strict";
import { STANDARDS, standardAt, standardAt as at, feedPhaseForDay } from "../lib/standards";

test("وزن و دان تجمعی استاندارد صعودی است", () => {
  for (let d = 2; d < STANDARDS.length; d++) {
    assert.ok(STANDARDS[d].weightG > STANDARDS[d - 1].weightG, `weight not increasing at day ${d + 1}`);
    assert.ok(STANDARDS[d].cumFeedG > STANDARDS[d - 1].cumFeedG, `feed not increasing at day ${d + 1}`);
  }
});

test("مقادیر کلیدی استاندارد در محدوده مرجع صنعت", () => {
  assert.ok(Math.abs(at(7).weightG - 185) < 10);
  assert.ok(Math.abs(at(21).weightG - 940) < 25);
  assert.ok(Math.abs(at(42).weightG - 2880) < 80);
  assert.ok(at(42).fcr > 1.5 && at(42).fcr < 1.8);
});

test("مصرف روزانه استاندارد هموار و بدون پرش منفی است", () => {
  for (let d = 2; d <= 49; d++) {
    const daily = at(d).cumFeedG - at(d - 1).cumFeedG;
    assert.ok(daily > 0, `negative daily feed at ${d}`);
    const prev = d > 2 ? at(d - 1).cumFeedG - at(d - 2).cumFeedG : daily;
    assert.ok(daily - prev < 30, `feed jump too large at day ${d}: ${prev} -> ${daily}`);
  }
});

test("مرحله دان بر اساس سن", () => {
  assert.equal(feedPhaseForDay(1), "دان آغازین");
  assert.equal(feedPhaseForDay(15), "دان رشد");
  assert.equal(feedPhaseForDay(40), "دان پایانی");
});

test("ورودی خارج از بازه به مرزها محدود می‌شود", () => {
  assert.equal(standardAt(0).day, 1);
  assert.equal(standardAt(999).day, 49);
});
