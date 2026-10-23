/**
 * اعلان نوع برای بسته‌هایی که تایپ رسمی ندارند.
 * `arabic-persian-reshaper` فقط تبدیل شکل حروف را انجام می‌دهد و API کوچکی دارد.
 */
declare module "arabic-persian-reshaper" {
  export const PersianShaper: {
    convertArabic(text: string): string;
    convertArabicBack(text: string): string;
  };
  export const ArabicShaper: {
    convertArabic(text: string): string;
    convertArabicBack(text: string): string;
  };
}
