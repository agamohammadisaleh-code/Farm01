import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import { getSettings } from "@/lib/db";
import { getCycles } from "@/lib/metrics";

/** پوسته داشبورد وب (دسکتاپ) */
export default function DesktopLayout({ children }: { children: React.ReactNode }) {
  const settings = getSettings();
  const cycles = getCycles();
  const activeCount = cycles.filter((c) => c.status === "active").length;

  return (
    <div className="app-shell">
      <Sidebar farmName={settings.farm_name} activeCount={activeCount} />
      <div className="main-col">
        <Topbar farmName={settings.farm_name} />
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
