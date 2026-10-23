import { SetMetadata } from "@nestjs/common";
import { PERMISSIONS, can, type Permission, type Role } from "@farm/domain";

export const ROLES_KEY = "roles";
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/* ماتریس دسترسی در `@farm/domain` است تا موبایل هم آفلاین همان را بداند؛
   این‌جا فقط دوباره صادر می‌شود تا امضای قبلی برای بقیه ماژول‌ها بماند. */
export { PERMISSIONS, can };
export type { Permission };
