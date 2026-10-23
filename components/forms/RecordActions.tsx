"use client";

import { Trash2, Lock, Unlock, XCircle } from "lucide-react";
import {
  archiveCycleAction,
  deleteCostAction,
  deleteDailyLogAction,
  deleteSaleAction,
  deleteCycleAction,
  reopenCycleAction,
} from "@/app/actions";
import ConfirmAction from "@/components/ui/ConfirmAction";
import { todayIso } from "@/lib/jalali";

export function DeleteRecord({ kind, id }: { kind: "log" | "cost" | "sale"; id: number }) {
  const labels = {
    log: "این ثبت روزانه حذف شود؟",
    cost: "این هزینه حذف شود؟",
    sale: "این فروش حذف شود؟",
  };
  const fn = kind === "log" ? deleteDailyLogAction : kind === "cost" ? deleteCostAction : deleteSaleAction;
  return (
    <ConfirmAction
      title={labels[kind]}
      description="پس از حذف، همه محاسبات (هزینه، درآمد، ضریب تبدیل و پیش‌بینی) دوباره انجام می‌شود. این عملیات قابل بازگشت نیست."
      confirmLabel="حذف"
      onConfirm={async () => {
        await fn(id);
      }}
      trigger={
        <button className="btn btn-icon btn-sm" title="حذف" aria-label="حذف">
          <Trash2 size={14} />
        </button>
      }
    />
  );
}

export function CycleStateButton({ cycleId, status }: { cycleId: number; status: "active" | "closed" }) {
  if (status === "active") {
    return (
      <ConfirmAction
        danger={false}
        title="بستن دوره پرورش"
        description="با بستن دوره، وضعیت آن به «بسته‌شده» تغییر می‌کند و در گزارش عملکرد نهایی قرار می‌گیرد. می‌توانید بعداً آن را باز کنید."
        confirmLabel="بستن دوره"
        onConfirm={async () => {
          await archiveCycleAction(cycleId, todayIso());
        }}
        trigger={
          <button className="btn btn-outline btn-sm">
            <Lock size={14} />
            بستن دوره
          </button>
        }
      />
    );
  }
  return (
    <ConfirmAction
      danger={false}
      title="بازگشایی دوره"
      description="دوره به وضعیت فعال بازمی‌گردد و می‌توانید ثبت‌های جدید اضافه کنید."
      confirmLabel="بازگشایی"
      onConfirm={async () => {
        await reopenCycleAction(cycleId);
      }}
      trigger={
        <button className="btn btn-outline btn-sm">
          <Unlock size={14} />
          بازگشایی دوره
        </button>
      }
    />
  );
}

export function DeleteCycleButton({ cycleId }: { cycleId: number }) {
  return (
    <ConfirmAction
      title="حذف کامل دوره"
      description="همه ثبت‌های روزانه، هزینه‌ها و فروش‌های این دوره حذف می‌شود. برای نگهداری سابقه، بهتر است دوره را فقط ببندید."
      confirmLabel="حذف دوره"
      onConfirm={async () => {
        await deleteCycleAction(cycleId);
      }}
      trigger={
        <button className="btn btn-danger btn-sm">
          <XCircle size={14} />
          حذف دوره
        </button>
      }
    />
  );
}
