import React from "react";
import { ScrollView, StyleSheet, Text } from "react-native";
import { permissionsOf, ROLE_LABELS, type Role } from "@farm/domain";
import { colors, font, spacing } from "../theme";
import { Card, Label, Pill, PrimaryButton, Row, Title } from "../components/ui";

const PERMISSION_LABEL: Record<string, string> = {
  "flock:read": "دیدن گله‌ها",
  "flock:write": "ساخت و ویرایش گله",
  "flock:delete": "حذف گله",
  "log:read": "دیدن ثبت روزانه",
  "log:write": "ثبت روزانه و وزن",
  "cost:read": "دیدن هزینه‌ها",
  "cost:write": "ثبت هزینه",
  "sale:read": "دیدن فروش",
  "sale:write": "ثبت فروش",
  "settings:read": "دیدن تنظیمات",
  "settings:write": "تغییر تنظیمات",
  "member:manage": "مدیریت اعضا",
};

export function SettingsScreen({
  user,
  online,
  lastSchedule,
  onLogout,
  onResyncNotifications,
}: {
  user: { name: string; email: string; role: Role };
  online: boolean;
  lastSchedule: { at: string | null; count: number };
  onLogout: () => void;
  onResyncNotifications: () => void;
}) {
  const perms = permissionsOf(user.role);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Card>
        <Title>{user.name}</Title>
        <Text style={styles.meta}>{user.email}</Text>
        <Row style={{ marginTop: spacing.sm }}>
          <Pill text={ROLE_LABELS[user.role] ?? user.role} />
          <Pill text={online ? "متصل" : "آفلاین"} tone={online ? "green" : "amber"} />
        </Row>
      </Card>

      <Card>
        <Label>دسترسی‌های نقش شما</Label>
        {perms.map((p) => (
          <Text key={p} style={styles.perm}>
            • {PERMISSION_LABEL[p] ?? p}
          </Text>
        ))}
        <Text style={styles.note}>
          این فهرست از همان ماتریس دسترسی سرور می‌آید؛ اگر دکمه‌ای را نمی‌بینید، سرور هم آن را نمی‌پذیرد.
        </Text>
      </Card>

      <Card>
        <Title>نوتیفیکیشن‌ها</Title>
        <Text style={styles.meta}>
          {lastSchedule.count > 0
            ? `${lastSchedule.count} یادآور زمان‌بندی شده است.`
            : "هنوز یادآوری زمان‌بندی نشده است."}
        </Text>
        {lastSchedule.at ? <Text style={styles.meta}>آخرین به‌روزرسانی: {lastSchedule.at.slice(0, 16).replace("T", " ")}</Text> : null}
        <PrimaryButton title="به‌روزرسانی یادآورها" tone="ghost" onPress={onResyncNotifications} />
      </Card>

      <PrimaryButton title="خروج از حساب" tone="red" onPress={onLogout} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  meta: { color: colors.muted, fontSize: font.caption, marginBottom: spacing.xs },
  perm: { fontSize: font.body, color: colors.ink, paddingVertical: 3 },
  note: { color: colors.muted, fontSize: 12, marginTop: spacing.sm, lineHeight: 18 },
});
