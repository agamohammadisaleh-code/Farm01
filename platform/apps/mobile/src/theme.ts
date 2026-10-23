/* پوسته بصری اپ — فارسی، راست‌به‌چپ، با اعداد درشت و دکمه‌های بزرگ برای
   استفاده با یک دست و دستکش در سالن. اندازه‌ها عمداً بزرگ‌اند: کوچک‌ترین
   دکمه ۵۶ نقطه است، چون هدف لمسی کوچک روی گوشی خیس یا با دستکش کار نمی‌کند. */

export const colors = {
  bg: "#f5f7f5",
  card: "#ffffff",
  ink: "#16302a",
  muted: "#6b7f78",
  line: "#e2e9e6",
  green: "#1e8a5f",
  greenSoft: "#e6f4ee",
  amber: "#b06a00",
  amberSoft: "#fdf1dc",
  red: "#b3382e",
  redSoft: "#fbe9e7",
  blue: "#2c6e9b",
  blueSoft: "#eaf2fa",
  white: "#ffffff",
};

export const radius = { sm: 10, md: 14, lg: 20, pill: 999 };

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };

export const font = {
  /** اندازه‌ها با ارقام فارسی خوانا باشند؛ هیچ متنی زیر ۱۳ نباشد */
  h1: 26,
  h2: 20,
  body: 16,
  label: 14,
  caption: 13,
  /** عددهای فرم ثبت سریع: باید از فاصله دیدہ شوند */
  number: 40,
};

export const touch = {
  /** حداقل اندازه هدف لمسی */
  min: 56,
  primary: 68,
};

export function severityColor(severity?: string): { fg: string; bg: string } {
  if (severity === "critical") return { fg: colors.red, bg: colors.redSoft };
  if (severity === "warning") return { fg: colors.amber, bg: colors.amberSoft };
  return { fg: colors.blue, bg: colors.blueSoft };
}

export const T = {
  // برچسب‌های مشترک، تا متن فارسی در یک جا نگه‌داری شود
  appName: "مرغ‌یار",
  quickLog: "ثبت سریع",
  mortality: "تلفات",
  feed: "دان (کیلوگرم)",
  water: "آب (لیتر)",
  temp: "دما (درجه)",
  save: "ثبت",
  saveOffline: "ثبت و ارسال بعدی",
  today: "امروز",
  yesterday: "دیروز",
  sync: "همگام‌سازی",
  pending: "در صف",
  failed: "ناموفق",
  retry: "تلاش دوباره",
  discard: "حذف",
  logout: "خروج",
  login: "ورود",
  email: "ایمیل",
  password: "گذرواژه",
  noAccess: "نقش شما اجازه این کار را ندارد",
};
