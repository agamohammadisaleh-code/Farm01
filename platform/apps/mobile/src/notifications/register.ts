/* نوتیفیکیشن‌های محلی: واکسن‌ها، دوره پرهیز دارو، ثبت جاافتاده و هشدارها.

   تصمیم: اعلان‌ها **محلی** زمان‌بندی می‌شوند، نه با سرور. دلیل عملی است:
   مرغدار در سالن اینترنت ندارد و اگر اعلان وابسته به شبکه باشد، واکسن
   فردا را هم از دست می‌دهد. سرور فقط فهرست یادآورها را می‌دهد؛ زمان‌بندی
   روی گوشی با `@farm/domain/planNotifications` انجام می‌شود.
*/

import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";
import { planNotifications, type PlannedNotification } from "@farm/domain";
import { api } from "../api/client";
import { getValue, listReminders, replaceReminders, setValue } from "../storage/db";

const CHANNEL_ID = "farm-alerts";

/** نمایش اعلان حتی وقتی اپ باز است (کاربر باید ببیند) */
export function configureHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export async function ensurePermissions(): Promise<boolean> {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: "هشدارهای گله",
      importance: Notifications.AndroidImportance.HIGH,
      sound: "default",
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  if (!Device.isDevice) {
    // شبیه‌ساز معمولاً اعلان نمی‌دهد؛ ولی نباید اپ را بشکنیم
    return false;
  }

  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) return true;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

/** همه اعلان‌های زمان‌بندی‌شده قبلی پاک می‌شوند تا تکراری روی هم انبار نشود */
export async function cancelAll(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

export async function scheduleAll(planned: PlannedNotification[]): Promise<number> {
  await cancelAll();
  let scheduled = 0;

  for (const item of planned) {
    const date = new Date(item.at);
    if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) continue;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: item.title,
        body: item.body || "برای جزئیات اپ را باز کنید",
        data: { deepLink: item.deepLink ?? null, kind: item.kind, severity: item.severity },
        sound: item.severity === "critical" ? "default" : undefined,
      },
      // تاریخ مطلق: اعلان حتی اگر اپ بسته باشد توسط سیستم‌عامل نمایش داده می‌شود
      trigger: { date, channelId: CHANNEL_ID },
    });
    scheduled += 1;
  }

  setValue("lastScheduleAt", new Date().toISOString());
  return scheduled;
}

/**
 * دریافت یادآورها از سرور (اگر شبکه بود) و سپس زمان‌بندی از داده محلی.
 * اگر آفلاین باشیم، همان یادآورهای ذخیره‌شده قبلی دوباره زمان‌بندی می‌شوند؛
 * یعنی اپ بدون شبکه هم یادآور واکسن فردا را دارد.
 */
export async function refreshAndSchedule(): Promise<{ scheduled: number; offline: boolean }> {
  let offline = false;
  try {
    const data = await api.get<{ reminders: any[] }>("/reminders?horizonDays=14");
    replaceReminders(data.reminders ?? []);
  } catch {
    offline = true;
  }

  const cached = listReminders();
  const now = new Date().toISOString();

  // زمان "اکنون" برای تصمیم سکوت شبانه؛ در گوشی به وقت کاربر است
  const planned = planNotifications(
    cached.map((r) => ({
      id: r.id,
      kind: r.kind,
      severity: r.severity ?? undefined,
      title: r.title,
      detail: r.detail ?? undefined,
      due: r.due ?? undefined,
      daysLeft: r.days_left ?? undefined,
      flockId: r.flock_id ?? undefined,
      flockName: r.flock_name ?? undefined,
      href: r.href ?? undefined,
    })),
    { now, horizonDays: 14, limit: 40 },
  );

  const scheduled = await scheduleAll(planned);
  setValue("lastPlannedCount", String(planned.length));
  return { scheduled, offline };
}

/** آخرین زمان‌بندی برای نمایش در تنظیمات */
export function lastScheduleInfo(): { at: string | null; count: number } {
  return {
    at: getValue("lastScheduleAt"),
    count: Number(getValue("lastPlannedCount") ?? 0),
  };
}
