import React from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors, font, radius, severityColor, spacing } from "../theme";
import { Card, EmptyState, Label, Pill, PrimaryButton, Row, Title } from "../components/ui";
import type { LocalFlock } from "../storage/db";

export interface ReminderView {
  id: string;
  kind: string;
  severity?: string;
  title: string;
  detail?: string | null;
  due?: string | null;
  daysLeft?: number | null;
  flockName?: string | null;
}

const KIND_LABEL: Record<string, string> = {
  vaccination: "واکسن",
  medication: "دارو",
  withdrawal: "پرهیز دارویی",
  alert: "هشدار",
  log: "ثبت روزانه",
  milestone: "بارگیری",
};

export function HomeScreen({
  flocks,
  flock,
  reminders,
  online,
  offlineLabel,
  onQuickLog,
  onRefresh,
  refreshing,
  onChangeFlock,
}: {
  flocks: LocalFlock[];
  flock: LocalFlock | null;
  reminders: ReminderView[];
  online: boolean;
  offlineLabel: string;
  onQuickLog: () => void;
  onRefresh: () => void;
  refreshing: boolean;
  onChangeFlock: (id: string) => void;
}) {
  const critical = reminders.filter((r) => r.severity === "critical");
  const soon = reminders.filter((r) => r.severity !== "critical");

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Card>
        <Row style={{ justifyContent: "space-between" }}>
          <Title>امروز</Title>
          <Pill text={online ? "متصل" : "آفلاین"} tone={online ? "green" : "amber"} />
        </Row>
        <Text style={styles.sync}>{offlineLabel}</Text>
        <PrimaryButton title="ثبت سریع دان و تلفات" big onPress={onQuickLog} />
      </Card>

      <Card>
        <Label>گله فعال</Label>
        <Row style={{ flexWrap: "wrap", gap: spacing.sm }}>
          {flocks.length === 0 ? <EmptyState text="گله‌ای ثبت نشده است." /> : null}
          {flocks.map((item) => (
            <Text
              key={item.id}
              onPress={() => onChangeFlock(item.id)}
              style={[styles.flockChip, item.id === flock?.id && styles.flockChipActive]}
            >
              {item.name}
            </Text>
          ))}
        </Row>
        {flock ? (
          <Text style={styles.flockMeta}>
            {flock.hall_name ? `${flock.hall_name} · ` : ""}
            {flock.breed ?? ""} · {flock.initial_count ?? 0} قطعه
          </Text>
        ) : null}
      </Card>

      {critical.length > 0 && (
        <Card style={{ borderColor: colors.redSoft, backgroundColor: colors.redSoft }}>
          <Title>هشدار فوری</Title>
          {critical.map((r) => (
            <View key={r.id} style={styles.alertRow}>
              <Text style={styles.alertTitle}>{r.title}</Text>
              {r.detail ? <Text style={styles.alertDetail}>{r.detail}</Text> : null}
            </View>
          ))}
        </Card>
      )}

      <Card>
        <Title>یادآورها</Title>
        {soon.length === 0 && critical.length === 0 ? <EmptyState text="کاری برای امروز نیست." /> : null}
        {soon.map((r) => {
          const tone = severityColor(r.severity);
          return (
            <View key={r.id} style={[styles.reminder, { borderRightColor: tone.fg }]}>
              <Row style={{ justifyContent: "space-between" }}>
                <Text style={styles.reminderTitle}>{r.title}</Text>
                <Pill text={KIND_LABEL[r.kind] ?? r.kind} tone={r.severity === "warning" ? "amber" : "blue"} />
              </Row>
              {r.detail ? <Text style={styles.reminderDetail}>{r.detail}</Text> : null}
              {r.daysLeft != null ? (
                <Text style={styles.reminderMeta}>
                  {r.daysLeft === 0 ? "همین امروز" : `${r.daysLeft} روز دیگر`}
                  {r.flockName ? ` · ${r.flockName}` : ""}
                </Text>
              ) : null}
            </View>
          );
        })}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  sync: { color: colors.muted, fontSize: font.caption, marginBottom: spacing.md },
  flockChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.bg,
    color: colors.ink,
    overflow: "hidden",
    fontSize: font.label,
  },
  flockChipActive: { backgroundColor: colors.greenSoft, color: colors.green, fontWeight: "700" },
  flockMeta: { color: colors.muted, fontSize: font.caption, marginTop: spacing.sm },
  alertRow: { paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: "#f3d3cf" },
  alertTitle: { color: colors.red, fontWeight: "700", fontSize: font.body },
  alertDetail: { color: "#7a2b23", fontSize: font.caption, marginTop: 2 },
  reminder: {
    borderRightWidth: 4,
    paddingRight: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  reminderTitle: { fontSize: font.body, color: colors.ink, fontWeight: "600" },
  reminderDetail: { fontSize: font.caption, color: colors.muted, marginTop: 2 },
  reminderMeta: { fontSize: 12, color: colors.muted, marginTop: 4 },
});
