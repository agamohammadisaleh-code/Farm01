import test from "node:test";
import assert from "node:assert/strict";
import { parseNumber, num, compactToman, pct, signedPct } from "../src/format";

test("تحلیل اعداد فارسی، عربی و جداکننده‌ها", () => {
  assert.equal(parseNumber("۱۲۳۴"), 1234);
  assert.equal(parseNumber("۱۲٫۵"), 12.5);
  assert.equal(parseNumber("1,250,000"), 1250000);
  assert.equal(parseNumber("۲ ۵۰۰"), 2500);
  assert.ok(Number.isNaN(parseNumber("")));
  assert.ok(Number.isNaN(parseNumber(null)));
});

test("قالب‌بندی مبالغ خلاصه", () => {
  assert.match(compactToman(1_250_000_000), /میلیارد/);
  assert.match(compactToman(2_500_000), /میلیون/);
  assert.match(compactToman(4_500), /هزار/);
  assert.equal(compactToman(null), "—");
});

test("درصد و اعداد", () => {
  assert.match(pct(3.456), /۳٫۵٪/);
  assert.match(signedPct(-12.5), /−۱۲٫۵٪/);
  assert.match(signedPct(8.2), /\+۸٫۲٪/);
  assert.equal(num(null), "—");
});
