import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assistantExamples,
  expandNumberWords,
  normalizePersian,
  parseAssistantText,
  parsePersianDate,
} from "../src/index";

const TODAY = "2026-10-23";
const parse = (text: string) => parseAssistantText(text, { today: TODAY });

/* ------------------------------ یکسان‌سازی ------------------------------ */

test("ارقام و حروف فارسی یکسان‌سازی می‌شوند", () => {
  assert.equal(normalizePersian("۱۲۳ ٠٤٥"), "123 045");
  assert.equal(normalizePersian("كارگر"), "کارگر");
  assert.equal(normalizePersian("مي‌خواهم"), "می خواهم");
});

test("عدد نوشتاری به رقم تبدیل می‌شود", () => {
  assert.equal(expandNumberWords("دویست و پنجاه لیتر"), "250 لیتر");
  assert.equal(expandNumberWords("یک هزار و دویست گرم"), "1200 گرم");
  assert.equal(expandNumberWords("سه میلیون تومان"), "3000000 تومان");
  // مقیاس تنها نباید عدد بسازد
  assert.equal(expandNumberWords("چند میلیون خرج کردی"), "چند میلیون خرج کردی");
});

/* -------------------------------- تاریخ‌ها -------------------------------- */

test("تاریخ نسبی و شمسی درست خوانده می‌شود", () => {
  assert.equal(parsePersianDate("امروز ۵ تلفات", TODAY)?.iso, "2026-10-23");
  assert.equal(parsePersianDate("دیروز", TODAY)?.iso, "2026-10-22");
  assert.equal(parsePersianDate("پریروز", TODAY)?.iso, "2026-10-21");
  assert.equal(parsePersianDate("۳ روز پیش", TODAY)?.iso, "2026-10-20");
  assert.equal(parsePersianDate("۱۴۰۵/۰۸/۰۲", TODAY)?.iso, "2026-10-24");
  // ۲ آبان ۱۴۰۵
  assert.equal(parsePersianDate("۲ آبان", TODAY)?.iso, "2026-10-24");
});

/* ------------------------------ نیّت ثبت روزانه ------------------------------ */

test("جمله کامل ثبت روزانه: تلفات، دان و آب", () => {
  const r = parse("امروز ۱۲ تا تلف شد و ۹۰ کیلو دان خورد و آبش ۱۸۰ لیتر بود");
  assert.equal(r.intent, "log_daily");
  assert.equal(r.entities.mortality, 12);
  assert.equal(r.entities.feedKg, 90);
  assert.equal(r.entities.waterLiter, 180);
  assert.equal(r.entities.date, TODAY);
  assert.equal(r.missing.length, 0);
  assert.equal(r.requiresConfirm, true);
  assert.match(r.reply, /۱۲ قطعه/);
  assert.match(r.reply, /تأیید/);
  assert.ok(r.confidence >= 0.7);
});

test("عدد نوشتاری و تاریخ دیروز در ثبت روزانه", () => {
  const r = parse("دیروز دویست و پنجاه لیتر آب و صد کیلو دان");
  assert.equal(r.intent, "log_daily");
  assert.equal(r.entities.waterLiter, 250);
  assert.equal(r.entities.feedKg, 100);
  assert.equal(r.entities.date, "2026-10-22");
  assert.equal(r.entities.dateLabel, "دیروز");
});

test("دما تنها، هم ثبت می‌شود", () => {
  const r = parse("دمای سالن ۲۷ درجه بود");
  assert.equal(r.intent, "log_daily");
  assert.equal(r.entities.avgTemp, 27);
});

test("حذف از تلفات جدا خوانده می‌شود", () => {
  const r = parse("۱۰ تا تلف شد و ۵ تا حذف کردیم");
  assert.equal(r.intent, "log_daily");
  assert.equal(r.entities.mortality, 10);
  assert.equal(r.entities.cull, 5);
});

/* --------------------------------- فروش --------------------------------- */

test("فروش با وزن، قیمت کیلویی و خریدار", () => {
  const r = parse("دیروز ۱۵۰۰ کیلو به کشتارگاه فروختم کیلویی ۹۸ هزار تومان");
  assert.equal(r.intent, "add_sale");
  assert.equal(r.entities.totalWeightKg, 1500);
  assert.equal(r.entities.pricePerKg, 980_000); // ۹۸ هزار تومان = ۹۸۰٬۰۰۰ ریال
  assert.equal(r.entities.buyer, "کشتارگاه");
  assert.equal(r.entities.date, "2026-10-22");
  assert.match(r.reply, /کشتارگاه/);
});

test("فروش با تن و تومان ساده", () => {
  const r = parse("دو تن فروختم کیلویی ۱۰۰ هزار تومان");
  assert.equal(r.intent, "add_sale");
  assert.equal(r.entities.totalWeightKg, 2000);
  assert.equal(r.entities.pricePerKg, 1_000_000);
});

test("فروش بدون قیمت، سؤال می‌پرسد نه ثبت", () => {
  const r = parse("امروز ۵۰۰ کیلو فروختم");
  assert.equal(r.intent, "add_sale");
  assert.ok(r.missing.includes("pricePerKg"));
  assert.equal(r.requiresConfirm, true);
  assert.match(r.reply, /قیمت هر کیلو/);
});

/* --------------------------------- هزینه --------------------------------- */

test("خرید دان: مبلغ، دسته و نوع دان", () => {
  const r = parse("۴ میلیون تومان دان آغازین خریدم");
  assert.equal(r.intent, "add_expense");
  assert.equal(r.entities.amountRial, 40_000_000);
  assert.equal(r.entities.category, "feed");
  assert.equal(r.entities.feedType, "دان آغازین");
});

test("هزینه دارو با مبلغ ریالی", () => {
  const r = parse("۸۵۰ هزار تومان دارو خریدم");
  assert.equal(r.intent, "add_expense");
  assert.equal(r.entities.category, "medication");
  assert.equal(r.entities.amountRial, 8_500_000);
});

test("هزینه بدون مبلغ، سؤال می‌پرسد", () => {
  const r = parse("امروز برای کارگر هزینه کردم");
  assert.equal(r.intent, "add_expense");
  assert.ok(r.missing.includes("amountRial"));
  assert.match(r.reply, /مبلغ/);
});

/* -------------------------------- وزن‌گیری -------------------------------- */

test("وزن‌گیری با گرم و تعداد نمونه", () => {
  const r = parse("میانگین وزن ۱۲۰۰ گرم از ۵۰ نمونه");
  assert.equal(r.intent, "add_weight");
  assert.equal(r.entities.weightGr, 1200);
  assert.equal(r.entities.sampleCount, 50);
  assert.match(r.reply, /۱۲۰۰ گرم/);
});

test("وزن با کیلوگرم به گرم تبدیل می‌شود", () => {
  const r = parse("وزن گله ۱٫۴ کیلو شد");
  assert.equal(r.intent, "add_weight");
  assert.equal(r.entities.weightGr, 1400);
});

/* --------------------------------- پرسش‌ها --------------------------------- */

test("پرسش‌ها ثبت نمی‌شوند و تأیید نمی‌خواهند", () => {
  const water = parse("مصرف آب این هفته چطور بوده؟");
  assert.equal(water.intent, "query_water");
  assert.equal(water.requiresConfirm, false);

  const feed = parse("چقدر دان خورده؟");
  assert.equal(feed.intent, "query_feed");
  assert.equal(feed.requiresConfirm, false);

  const loading = parse("کی بارگیری کنم؟");
  assert.equal(loading.intent, "query_loading");

  const deaths = parse("چند تا تلفات داشتم؟");
  assert.equal(deaths.intent, "query_metrics");
  assert.equal(deaths.requiresConfirm, false);
});

test("سلام و جمله نامفهوم", () => {
  assert.equal(parse("سلام").intent, "help");
  const unknown = parse("بلبل زبانی");
  assert.equal(unknown.intent, "unknown");
  assert.equal(unknown.requiresConfirm, false);
  assert.match(unknown.reply, /نمونه/);
});

/* --------------------------------- گله --------------------------------- */

test("نام گله از جمله تشخیص داده می‌شود", () => {
  const r = parseAssistantText("گله پاییزه ۸ تا تلف شد", {
    today: TODAY,
    flocks: [
      { id: "f-1", name: "گله پاییزه" },
      { id: "f-2", name: "گله بهاره" },
    ],
  });
  assert.equal(r.entities.flockHint, "f-1");
});

test("نمونه‌جمله‌های راهنما همه با موفقیت تفسیر می‌شوند", () => {
  for (const example of assistantExamples()) {
    const r = parseAssistantText(example.text, { today: TODAY });
    assert.equal(r.intent, example.intent, `«${example.text}» → ${r.intent}`);
    assert.ok(r.reply.length > 5);
  }
});
