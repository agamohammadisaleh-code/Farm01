/* منوی برنامه بر اساس نقش.

   منبع مجوز همان ماتریس `@farm/domain` است که سرور هم استفاده می‌کند. اگر
   دکمه‌ای اینجا دیده شود، سرور هم می‌پذیرد؛ اگر دیده نشود، سرور هم رد می‌کند.
   کارگر سالن فقط «امروز» را می‌بیند تا با کمترین آموزش کار کند. */

import { can, type Role } from "@farm/domain";

export interface NavItem {
  to: string;
  label: string;
  icon: string;
  /** توضیح یک‌خطی برای منو و آموزش */
  hint: string;
}

const ALL: (NavItem & { permission: "log:read" | "cost:read" | "flock:read" })[] = [
  { to: "/", label: "امروز", icon: "📝", hint: "ثبت دان، آب، تلفات و دیدن کارهای امروز", permission: "log:read" },
  { to: "/dashboard", label: "داشبورد", icon: "📊", hint: "شاخص‌ها و نمودارهای روند گله", permission: "cost:read" },
];

export function navItemsFor(role: Role | null | undefined): NavItem[] {
  return ALL.filter((item) => can(role, item.permission)).map(({ to, label, icon, hint }) => ({ to, label, icon, hint }));
}
