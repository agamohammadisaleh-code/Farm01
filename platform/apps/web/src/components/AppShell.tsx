import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../auth";
import { navItemsFor } from "../lib/nav";
import { jalaliLong, todayIso } from "../lib/format";
import { ROLE_LABELS } from "@farm/domain";

/**
 * پوسته برنامه: سربرگ، ناوبری و خروج.
 *
 * ناوبری ساده و کم‌گزینه است (حداکثر دو تب). برای کارگر سالن این مهم‌ترین
 * تصمیم طراحی است: هر گزینه اضافه یعنی آموزش بیشتر و خطای بیشتر.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, farm, role, logout } = useAuth();
  const location = useLocation();
  const items = navItemsFor(role);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-2xl" aria-hidden>
              🐔
            </span>
            <div>
              <p className="text-lg font-extrabold leading-5 text-brand-700">مرغ‌یار</p>
              <p className="text-xs text-muted">{farm?.name ?? "—"}</p>
            </div>
          </div>

          <nav className="order-3 flex w-full gap-2 md:order-none md:w-auto" aria-label="ناوبری اصلی">
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  `flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl px-4 text-base font-bold transition md:flex-none ${
                    isActive ? "bg-brand-500 text-white" : "bg-paper text-ink hover:bg-brand-50"
                  }`
                }
                title={item.hint}
              >
                <span aria-hidden>{item.icon}</span>
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="mr-auto flex items-center gap-3">
            <div className="hidden text-left sm:block">
              <p className="text-sm font-bold text-ink">{user?.name}</p>
              <p className="text-xs text-muted">{role ? ROLE_LABELS[role] : ""}</p>
            </div>
            <button type="button" className="btn-ghost !min-h-[42px] !px-4 !text-sm" onClick={logout}>
              خروج
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-4">
        <p className="mb-4 text-sm text-muted">
          امروز: <span className="font-bold text-ink">{jalaliLong(todayIso())}</span>
          <span className="mx-2 text-line">|</span>
          {location.pathname === "/" ? "ثبت روزانه و کارهای امروز" : "شاخص‌ها و روند گله"}
        </p>
        <main id="main">{children}</main>
      </div>
    </div>
  );
}
