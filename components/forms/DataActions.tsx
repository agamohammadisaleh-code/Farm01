"use client";

import { DatabaseBackup, Trash2 } from "lucide-react";
import { clearDataAction, resetDemoAction } from "@/app/actions";
import ConfirmAction from "@/components/ui/ConfirmAction";

export default function DataActions() {
  return (
    <div className="row wrap" style={{ gap: 10 }}>
      <ConfirmAction
        danger={false}
        title="بازنشانی داده‌های نمونه"
        description="همه داده‌های فعلی حذف و سه دوره نمونه (دو فعال، یک بسته) دوباره ساخته می‌شود. این کار برای آشنایی با سامانه مناسب است."
        confirmLabel="بازنشانی داده نمونه"
        onConfirm={async () => {
          await resetDemoAction();
        }}
        trigger={
          <button className="btn btn-outline">
            <DatabaseBackup size={15} />
            بارگذاری داده‌های نمونه
          </button>
        }
      />
      <ConfirmAction
        title="پاک‌کردن کامل داده‌ها"
        description="تمام دوره‌ها، ثبت‌های روزانه، هزینه‌ها و فروش‌ها برای همیشه حذف می‌شوند. این عملیات قابل بازگشت نیست."
        confirmLabel="حذف کامل داده‌ها"
        onConfirm={async () => {
          await clearDataAction();
        }}
        trigger={
          <button className="btn btn-danger">
            <Trash2 size={15} />
            پاک‌کردن همه داده‌ها
          </button>
        }
      />
    </div>
  );
}
