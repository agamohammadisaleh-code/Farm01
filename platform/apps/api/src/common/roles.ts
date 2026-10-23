import { SetMetadata } from "@nestjs/common";
import type { Role } from "@farm/domain";

export const ROLES_KEY = "roles";
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/**
 * ماتریس دسترسی نقش‌ها.
 *
 * اصل: کارگر و دامپزشک نباید به داده مالی (هزینه/فروش) دسترسی بنویسند، چون
 * در عمل این اطلاعات در اختیار مالک است و افشای آن باعث اختلاف می‌شود.
 * خواندن هزینه برای دامپزشک هم بسته است؛ فقط شاخص‌های زیستی می‌بیند.
 */
export const PERMISSIONS = {
  "flock:read": ["owner", "manager", "worker", "vet"],
  "flock:write": ["owner", "manager"],
  "flock:delete": ["owner"],
  "log:read": ["owner", "manager", "worker", "vet"],
  // دامپزشک هم ثبت روزانه می‌کند (تلفات، دارو، دمای سالن) ولی به هزینه و فروش دسترسی ندارد
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

export function can(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}
