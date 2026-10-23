import { describe, expect, it } from "vitest";
import { fa, jalali, jalaliLong, percent, perKg, toNumber, toman, weightText } from "./format";

describe("قالب‌بندی فارسی", () => {
  it("اعداد را با ارقام فارسی و جداکننده هزارگان می‌دهد", () => {
    expect(fa(1234)).toBe("۱٬۲۳۴");
    expect(fa(1.58, 2)).toBe("۱٫۵۸");
    expect(fa(null)).toBe("—");
  });

  it("درصد و تومان و قیمت هر کیلو", () => {
    expect(percent(1.9)).toBe("۱٫۹٪");
    expect(toman(98000)).toBe("۹۸٬۰۰۰ تومان");
    expect(perKg(79407)).toBe("۷۹٬۴۰۷ تومان/کیلو");
  });

  it("وزن زیر یک کیلو را گرم و بالای آن را کیلوگرم نشان می‌دهد", () => {
    expect(weightText(850)).toBe("۸۵۰ گرم");
    expect(weightText(2450)).toBe("۲٫۴۵ کیلوگرم");
    expect(weightText(0)).toBe("۰ گرم");
    expect(weightText(null)).toBe("—");
  });

  it("تاریخ شمسی می‌سازد", () => {
    expect(jalali("2026-10-23")).toBe("۱۴۰۵/۰۸/۰۱");
    expect(jalaliLong("2026-10-23")).toMatch(/آبان ۱۴۰۵/);
    expect(jalali(null)).toBe("—");
  });

  it("ورودی فارسی کاربر را به عدد تبدیل می‌کند", () => {
    expect(toNumber("۱۸۰")).toBe(180);
    expect(toNumber("۲٬۴۰۰")).toBe(2400);
    expect(toNumber("1.5")).toBe(1.5);
    expect(toNumber("")).toBeNull();
    expect(toNumber("abc")).toBeNull();
  });
});
