import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ageAtWeight,
  breedAt,
  breedOptions,
  breedStandardByKey,
  breedWeightAt,
  BREEDS,
  resolveBreed,
  standardWeightG,
} from "../src/index";

test("نژاد پیش‌فرض همان راس ۳۰۸ و هم‌تراز مرجع استاندارد است", () => {
  const { breed, matched } = resolveBreed(null);
  assert.equal(breed.key, "ross308");
  assert.equal(matched, true);
  assert.equal(breedWeightAt(null, 42), standardWeightG(42));
});

test("نژادهای شناخته‌شده منحنی متفاوت دارند", () => {
  assert.equal(breedWeightAt("راس ۳۰۸", 42), 2880);
  assert.equal(breedWeightAt("کاب ۵۰۰", 42), 2820);
  assert.equal(breedWeightAt("هابارد", 42), 2800);
  assert.equal(breedWeightAt("آربور ایکرز", 42), 2855);
});

test("نام نژاد با شکل‌های مختلف نوشتاری شناخته می‌شود", () => {
  for (const name of ["کاب", "cobb 500", "Cobb 500", "کاب۵۰۰", "کاب 500"]) {
    assert.equal(resolveBreed(name).breed.key, "cobb500", `«${name}» شناخته نشد`);
  }
  // ارقام فارسی در نام
  assert.equal(resolveBreed("راس ۳۰۸").breed.key, "ross308");
});

test("نژاد ناشناخته بی‌صدا جایگزین نمی‌شود", () => {
  const res = resolveBreed("نژاد خیالی مزرعه");
  assert.equal(res.matched, false);
  assert.equal(res.breed.key, "ross308");
  assert.match(res.note, /پیش‌فرض/);
});

test("منحنی روزانه هر نژاد صعودی، با مصرف دان و FCR معقول است", () => {
  for (const breed of BREEDS) {
    const list = Array.from({ length: 49 }, (_, i) => breedAt(breed.nameFa, i + 1));
    assert.equal(list.length, 49);
    for (let i = 1; i < list.length; i++) {
      assert.ok(list[i].weightG > list[i - 1].weightG, `${breed.key} وزن غیرصعودی در روز ${i + 1}`);
      assert.ok(list[i].cumFeedG > list[i - 1].cumFeedG, `${breed.key} دان غیرصعودی در روز ${i + 1}`);
      assert.ok(list[i].dailyFeedG >= 0);
    }
    // FCR پایان دوره در بازه واقعی گوشتی است
    const fcr42 = list[41].fcr;
    assert.ok(fcr42 > 1.4 && fcr42 < 2.0, `${breed.key}: FCR روز ۴۲ = ${fcr42}`);
  }
});

test("سن رسیدن به وزن هدف روی منحنی نژاد محاسبه می‌شود", () => {
  const ross = ageAtWeight("راس ۳۰۸", 2500);
  const cobb = ageAtWeight("کاب ۵۰۰", 2500);
  assert.ok(ross.reached && cobb.reached);
  assert.ok(cobb.day >= ross.day, "کاب نباید زودتر از راس به وزن هدف برسد");

  // وزن هدف بالاتر از سقف منحنی: صادقانه reached=false
  const impossible = ageAtWeight("راس ۳۰۸", 9000);
  assert.equal(impossible.reached, false);
  assert.equal(impossible.day, 49);
});

test("فهرست نژادها برای فرم کلاینت آماده است", () => {
  const options = breedOptions();
  assert.equal(options.length, BREEDS.length);
  assert.ok(options.some((o) => o.key === "cobb500" && o.label === "کاب ۵۰۰"));
  assert.equal(breedStandardByKey("cobb500")?.nameFa, "کاب ۵۰۰");
});
