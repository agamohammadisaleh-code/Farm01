/* اپ موبایل مرغ‌یار — Offline-First.

   ترتیب کار در شروع:
   ۱. اگر توکن ذخیره‌شده هست، پروفایل از حافظه محلی خوانده می‌شود (نه شبکه)
      تا اپ در سالن بدون اینترنت هم باز شود.
   ۲. گله‌ها و یادآورها از SQLite نمایش داده می‌شوند.
   ۳. در پس‌زمینه: همگام‌سازی صف + دریافت تغییرات + زمان‌بندی اعلان‌ها.

   نقش کاربر از همان ماتریس دسترسی سرور (`@farm/domain`) می‌آید، پس دکمه‌ای
   که نمایش داده می‌شود همان چیزی است که سرور می‌پذیرد.
*/

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, AppState, Pressable, SafeAreaView, StatusBar, StyleSheet, Text, View } from "react-native";
import { I18nManager } from "react-native";
import { syncStatusLabel, type Role } from "@farm/domain";
import { colors, font, spacing, T } from "./src/theme";
import { LoginScreen } from "./src/screens/LoginScreen";
import { HomeScreen, type ReminderView } from "./src/screens/HomeScreen";
import { QuickLogScreen } from "./src/screens/QuickLogScreen";
import { QueueScreen } from "./src/screens/QueueScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { clearTokens, getToken, me, type SessionUser } from "./src/api/client";
import { currentQueue, pullChanges, queueSummary, resetQueueMemory, syncNow } from "./src/sync/engine";
import { getJson, listFlocks, listReminders, openDb, resetLocalData, setJson, type LocalFlock } from "./src/storage/db";
import { configureHandler, ensurePermissions, lastScheduleInfo, refreshAndSchedule } from "./src/notifications/register";
import { revive, removeOperation } from "@farm/domain";
import { saveQueue } from "./src/storage/db";

// RTL سراسری؛ در Expo باید پیش از رندر ست شود
I18nManager.allowRTL(true);
I18nManager.forceRTL(true);
configureHandler();

type Tab = "home" | "quick" | "queue" | "settings";

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: "home", label: "خانه", icon: "🏠" },
  { key: "quick", label: "ثبت", icon: "➕" },
  { key: "queue", label: "صف", icon: "🔄" },
  { key: "settings", label: "تنظیمات", icon: "⚙️" },
];

export default function App() {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [tab, setTab] = useState<Tab>("home");
  const [flocks, setFlocks] = useState<LocalFlock[]>([]);
  const [flockId, setFlockId] = useState<string | null>(null);
  const [reminders, setReminders] = useState<ReminderView[]>([]);
  const [summary, setSummary] = useState(() => queueSummary());
  const [online, setOnline] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [schedule, setSchedule] = useState(() => lastScheduleInfo());

  const userRef = useRef<SessionUser | null>(null);
  userRef.current = user;

  const reloadLocal = useCallback(() => {
    const rows = listFlocks();
    setFlocks(rows);
    setFlockId((current) => current ?? rows[0]?.id ?? null);
    setReminders(listReminders() as ReminderView[]);
    setSummary(queueSummary());
  }, []);

  /** بوت: اول محلی، بعد شبکه */
  useEffect(() => {
    (async () => {
      openDb();
      const cachedUser = getJson<SessionUser | null>("cachedUser", null);
      const token = await getToken();

      if (token && cachedUser) {
        setUser(cachedUser);
        reloadLocal();
        setBooting(false);
        // تازه‌سازی آرام در پس‌زمینه؛ اگر آفلاین باشیم هیچ اتفاقی نمی‌افتد
        void me()
          .then((fresh) => {
            setUser(fresh);
            setJson("cachedUser", fresh);
          })
          .catch(() => undefined);
      } else {
        setBooting(false);
      }
    })();
  }, [reloadLocal]);

  const runSync = useCallback(
    async (silent = false) => {
      if (!userRef.current) return;
      setSyncing(true);
      try {
        const result = await syncNow();
        setOnline(!result.offline);
        setSummary(result.summary);
        resetQueueMemory();
        reloadLocal();
        if (!silent) {
          setToast(
            result.offline
              ? "اینترنت نیست — ثبت‌ها در گوشی نگه داشته شدند."
              : result.applied > 0
                ? `${result.applied} ثبت ارسال شد.`
                : result.failed > 0
                  ? `${result.failed} ثبت رد شد؛ جزئیات در تب «صف».`
                  : "همه‌چیز همگام است.",
          );
        }
      } catch (error) {
        setOnline(false);
        if (!silent) setToast(error instanceof Error ? error.message : "همگام‌سازی ناموفق بود.");
      } finally {
        setSyncing(false);
      }
    },
    [reloadLocal],
  );

  /** بعد از ورود: دریافت کامل، سپس زمان‌بندی اعلان */
  useEffect(() => {
    if (!user) return;
    (async () => {
      await ensurePermissions();
      try {
        await pullChanges();
        setOnline(true);
      } catch {
        setOnline(false);
      }
      reloadLocal();
      await runSync(true);
      try {
        await refreshAndSchedule();
        setSchedule(lastScheduleInfo());
      } catch {
        /* اعلان شکست بخورد، اپ نباید بشکند */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  /** همگام‌سازی دوره‌ای و هنگام بازگشت به اپ */
  useEffect(() => {
    if (!user) return;
    const timer = setInterval(() => void runSync(true), 60_000);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void runSync(true);
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, runSync]);

  const activeFlock = useMemo(() => flocks.find((f) => f.id === flockId) ?? null, [flocks, flockId]);

  const statusText = useMemo(() => {
    const failed = summary.failed;
    return syncStatusLabel(summary.pending, failed, online);
  }, [summary, online]);

  const onLoggedIn = async (next: SessionUser) => {
    setJson("cachedUser", next);
    setUser(next);
    reloadLocal();
  };

  const onLogout = async () => {
    await clearTokens();
    resetLocalData();
    resetQueueMemory();
    setUser(null);
    setFlocks([]);
    setReminders([]);
    setSummary(queueSummary());
    setTab("home");
  };

  const retryOperation = (clientId: string) => {
    saveQueue(revive(currentQueue(), clientId));
    resetQueueMemory();
    setSummary(queueSummary());
    void runSync();
  };

  const discardOperation = (clientId: string) => {
    Alert.alert("حذف از صف", "این ثبت ارسال نشود و از صف حذف شود؟", [
      { text: "انصراف", style: "cancel" },
      {
        text: "حذف",
        style: "destructive",
        onPress: () => {
          saveQueue(removeOperation(currentQueue(), clientId));
          resetQueueMemory();
          setSummary(queueSummary());
        },
      },
    ]);
  };

  const manualSync = async () => {
    setRefreshing(true);
    await runSync();
    setRefreshing(false);
  };

  if (booting) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.splash}>
          <Text style={styles.splashLogo}>🐔</Text>
          <Text style={styles.splashText}>{T.appName}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="dark-content" />
        <LoginScreen onLoggedIn={onLoggedIn} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{T.appName}</Text>
        <Text style={styles.headerStatus}>{statusText}</Text>
      </View>

      <View style={{ flex: 1 }}>
        {tab === "home" && (
          <HomeScreen
            flocks={flocks}
            flock={activeFlock}
            reminders={reminders}
            online={online}
            offlineLabel={statusText}
            onQuickLog={() => setTab("quick")}
            onRefresh={manualSync}
            refreshing={refreshing}
            onChangeFlock={setFlockId}
          />
        )}

        {tab === "quick" && (
          <QuickLogScreen
            flock={activeFlock}
            role={user.role as Role}
            onSaved={(message) => {
              setToast(message);
              reloadLocal();
              void runSync(true);
              setTab("home");
            }}
          />
        )}

        {tab === "queue" && (
          <QueueScreen
            queue={currentQueue()}
            syncing={syncing}
            onSync={() => void runSync()}
            onRetry={retryOperation}
            onDiscard={discardOperation}
          />
        )}

        {tab === "settings" && (
          <SettingsScreen
            user={user}
            online={online}
            lastSchedule={schedule}
            onLogout={onLogout}
            onResyncNotifications={async () => {
              const result = await refreshAndSchedule();
              setSchedule(lastScheduleInfo());
              setToast(
                result.offline
                  ? "آفلاین — اعلان‌ها از آخرین داده محلی زمان‌بندی شدند."
                  : `${result.scheduled} یادآور زمان‌بندی شد.`,
              );
            }}
          />
        )}
      </View>

      {toast ? (
        <Pressable onPress={() => setToast(null)} style={styles.toast}>
          <Text style={styles.toastText}>{toast}</Text>
        </Pressable>
      ) : null}

      <View style={styles.tabBar}>
        {TABS.map((item) => {
          const active = tab === item.key;
          const badge = item.key === "queue" ? summary.pending + summary.failed : 0;
          return (
            <Pressable
              key={item.key}
              accessibilityRole="tab"
              accessibilityLabel={`${item.label}${badge ? ` — ${badge} در انتظار` : ""}`}
              onPress={() => setTab(item.key)}
              style={styles.tab}
            >
              <Text style={[styles.tabIcon, active && { opacity: 1 }]}>{item.icon}</Text>
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{item.label}</Text>
              {badge > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{badge}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  splash: { flex: 1, alignItems: "center", justifyContent: "center" },
  splashLogo: { fontSize: 64 },
  splashText: { fontSize: font.h1, fontWeight: "800", color: colors.green, marginTop: spacing.sm },
  header: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  headerTitle: { fontSize: font.h2, fontWeight: "800", color: colors.green },
  headerStatus: { fontSize: 12, color: colors.muted },
  tabBar: {
    flexDirection: "row-reverse",
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingBottom: spacing.xs,
  },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: spacing.sm, minHeight: 60 },
  tabIcon: { fontSize: 22, opacity: 0.55 },
  tabLabel: { fontSize: 12, color: colors.muted, marginTop: 2 },
  tabLabelActive: { color: colors.green, fontWeight: "700" },
  badge: {
    position: "absolute",
    top: 4,
    right: 18,
    backgroundColor: colors.red,
    borderRadius: 999,
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  badgeText: { color: colors.white, fontSize: 11, fontWeight: "700" },
  toast: {
    position: "absolute",
    bottom: 80,
    left: spacing.lg,
    right: spacing.lg,
    backgroundColor: colors.ink,
    borderRadius: 12,
    padding: spacing.md,
  },
  toastText: { color: colors.white, fontSize: font.label, textAlign: "center" },
});
