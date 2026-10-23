import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { stuckOperations, type QueueState } from "@farm/domain";
import { colors, font, radius, spacing } from "../theme";
import { Card, EmptyState, Pill, PrimaryButton, Row, Title } from "../components/ui";

const TYPE_LABEL: Record<string, string> = {
  "log.save": "ثبت روزانه",
  "expense.create": "هزینه",
  "sale.create": "فروش",
  "weight.create": "وزن‌گیری",
};

export function QueueScreen({
  queue,
  onSync,
  onRetry,
  onDiscard,
  syncing,
}: {
  queue: QueueState;
  onSync: () => void;
  onRetry: (clientId: string) => void;
  onDiscard: (clientId: string) => void;
  syncing: boolean;
}) {
  const stuck = stuckOperations(queue);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Card>
        <Row style={{ justifyContent: "space-between" }}>
          <Title>صف ارسال</Title>
          <Pill text={`${queue.operations.length} مورد`} tone={queue.operations.length ? "amber" : "green"} />
        </Row>
        <Text style={styles.hint}>
          ثبت‌ها ابتدا در گوشی ذخیره می‌شوند. تا وقتی اینترنت نباشد اینجا می‌مانند و با اولین اتصال خودکار ارسال
          می‌شوند.
        </Text>
        <PrimaryButton
          title="همین حالا ارسال کن"
          onPress={onSync}
          loading={syncing}
          disabled={queue.operations.length === 0}
          big
        />
      </Card>

      {stuck.length > 0 && (
        <Card style={{ borderColor: colors.redSoft, backgroundColor: colors.redSoft }}>
          <Title>نیاز به تصمیم شما</Title>
          <Text style={styles.hint}>
            این موارد چند بار رد شده‌اند؛ خودکار دوباره فرستاده نمی‌شوند تا سرور را با داده نامعتبر پر نکنند.
          </Text>
        </Card>
      )}

      <Card>
        {queue.operations.length === 0 ? <EmptyState text="صف خالی است — همه‌چیز ارسال شده." /> : null}
        {queue.operations.map((op) => {
          const isStuck = op.status === "failed" && op.attempts >= 5;
          const payload = op.payload as { date?: string };
          return (
            <View key={op.clientId} style={styles.item}>
              <Row style={{ justifyContent: "space-between" }}>
                <Text style={styles.itemTitle}>
                  {TYPE_LABEL[op.type] ?? op.type}
                  {payload.date ? ` — ${payload.date}` : ""}
                </Text>
                <Pill
                  text={isStuck ? "ناموفق" : op.status === "syncing" ? "در حال ارسال" : "در صف"}
                  tone={isStuck ? "red" : op.status === "syncing" ? "blue" : "amber"}
                />
              </Row>
              {op.lastError ? <Text style={styles.error}>{op.lastError}</Text> : null}
              {isStuck ? (
                <Row style={{ marginTop: spacing.sm }}>
                  <PrimaryButton title="تلاش دوباره" tone="ghost" onPress={() => onRetry(op.clientId)} />
                  <PrimaryButton title="حذف" tone="red" onPress={() => onDiscard(op.clientId)} />
                </Row>
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
  hint: { color: colors.muted, fontSize: font.caption, marginBottom: spacing.md, lineHeight: 20 },
  item: { borderTopWidth: 1, borderTopColor: colors.line, paddingVertical: spacing.md },
  itemTitle: { fontSize: font.body, color: colors.ink, fontWeight: "600" },
  error: { fontSize: font.caption, color: colors.red, marginTop: spacing.xs },
});
