import { Navigate, Route, Routes } from "react-router-dom";
import { can } from "@farm/domain";
import { useAuth } from "./auth";
import { AppShell } from "./components/AppShell";
import { Loading, NoAccess } from "./components/ui";
import { LoginPage } from "./pages/LoginPage";
import { TodayPage } from "./pages/TodayPage";
import { DashboardPage } from "./pages/DashboardPage";

/**
 * مسیرها:
 *   /           صفحه «امروز» (همه نقش‌ها، چون ثبت روزانه کار همه است)
 *   /dashboard  داشبورد مدیریتی (فقط نقش‌هایی که `cost:read` دارند)
 * گاردها عمداً ساده‌اند: فقط لایه نمایش را محدود می‌کنند؛ اجازه واقعی در سرور است.
 */
export function App() {
  const { status, role } = useAuth();

  if (status === "loading") {
    return (
      <div className="grid min-h-screen place-items-center">
        <Loading label="در حال بررسی نشست…" />
      </div>
    );
  }

  if (status === "anonymous") return <LoginPage />;

  return (
    <AppShell>
      <Routes>
        <Route
          path="/"
          element={can(role, "log:read") ? <TodayPage /> : <NoAccess message="نقش شما اجازه دیدن ثبت روزانه ندارد." />}
        />
        <Route
          path="/dashboard"
          element={
            can(role, "cost:read") ? (
              <DashboardPage />
            ) : (
              <NoAccess message="داشبورد مالی فقط برای مالک و مدیر است. صفحه «امروز» برای ثبت روزانه باز است." />
            )
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}
