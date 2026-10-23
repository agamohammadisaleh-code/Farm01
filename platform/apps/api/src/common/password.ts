import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";

/**
 * تنها جایی که گذرواژه هش می‌شود.
 *
 * پیش‌تر عدد هزینه (۱۱) در دو فایل تکرار شده بود؛ اگر یکی به‌روز می‌شد و
 * دیگری نه، حساب‌های تازه ضعیف‌تر از حساب‌های قدیمی می‌شدند. حالا همه
 * مسیرها (ثبت‌نام، افزودن عضو، تغییر گذرواژه) از همین تابع می‌گذرند.
 *
 * هزینه ۱۱ ≈ ۲۵۰ میلی‌ثانیه روی سخت‌افزار امروز: کندتر از این، تجربه ورود
 * را آزار می‌دهد؛ سریع‌تر، حمله دیکشنری را ارزان می‌کند.
 */
export const BCRYPT_ROUNDS = 11;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export function verifyPassword(plain: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(plain, passwordHash);
}

let dummy: Promise<string> | null = null;

/**
 * هش ساختگی با همان هزینه bcrypt، برای یکسان‌کردن زمان پاسخ ورود.
 *
 * اگر ایمیل ناموجود باشد و بی‌درنگ خطا برگردانیم، زمان پاسخ به مهاجم
 * می‌گوید کدام ایمیل در سامانه هست (user enumeration). تنبل ساخته می‌شود
 * تا هزینه راه‌اندازی بالا نرود.
 */
export function dummyPasswordHash(): Promise<string> {
  dummy ??= hashPassword(randomUUID());
  return dummy;
}
