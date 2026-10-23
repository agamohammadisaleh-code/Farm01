/* ماتریس دسترسی نقش‌ها — منبع واحد برای API، وب و موبایل.

   چرا در بسته دامنه؟ چون موبایل آفلاین است: اگر ماتریس فقط در سرور باشد،
   اپ نمی‌تواند بدون شبکه بفهمد دکمه «ثبت هزینه» را برای کارگر نشان بدهد یا
   نه. دو نسخه نگه‌داشتن هم یعنی دیر یا زود واگرایی و یک آسیب‌پذیری.

   اصل: کارگر و دامپزشک به داده مالی (هزینه/فروش) دسترسی نمی‌نویسند و
   نمی‌خوانند، چون در عمل این اطلاعات در اختیار مالک است. دامپزشک ثبت
   روزانه دارد (تلفات، دما، دارو) ولی نه هزینه.
*/

import type { Role } from "./types";

export const PERMISSIONS = {
  "flock:read": ["owner", "manager", "worker", "vet"],
  "flock:write": ["owner", "manager"],
  "flock:delete": ["owner"],
  "log:read": ["owner", "manager", "worker", "vet"],
  "log:write": ["owner", "manager", "worker", "vet"],
  "cost:read": ["owner", "manager"],
  "cost:write": ["owner", "manager"],
  "sale:read": ["owner", "manager"],
  "sale:write": ["owner", "manager"],
  "settings:read": ["owner", "manager", "worker", "vet"],
  "settings:write": ["owner", "manager"],
  "member:manage": ["owner"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

/** همه مجوزهای یک نقش — برای ساخت منوی موبایل بدون فراخوانی شبکه */
export function permissionsOf(role: Role | null | undefined): Permission[] {
  if (!role) return [];
  return (Object.keys(PERMISSIONS) as Permission[]).filter((p) => can(role, p));
}

/**
 * نقش‌هایی که می‌توانند از دستیار فارسی استفاده کنند.
 * ثبت روزانه و وزن‌گیری برای همه، اما «ثبت هزینه/فروش» با جمله فارسی هم
 * باید تابع همان ماتریس باشد — دستیار راه دور زدن RBAC نیست.
 */
export function canUseAssistantAction(role: Role | null | undefined, action: "log" | "weight" | "expense" | "sale"): boolean {
  switch (action) {
    case "log":
      return can(role, "log:write");
    case "weight":
      return can(role, "log:write");
    case "expense":
      return can(role, "cost:write");
    case "sale":
      return can(role, "sale:write");
    default:
      return false;
  }
}
