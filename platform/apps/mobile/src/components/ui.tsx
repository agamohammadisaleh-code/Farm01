import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { colors, font, radius, spacing, touch } from "../theme";

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Title({ children }: { children: React.ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

export function Label({ children }: { children: React.ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

export function Pill({ text, tone = "green" }: { text: string; tone?: "green" | "amber" | "red" | "blue" }) {
  const map = {
    green: { bg: colors.greenSoft, fg: colors.green },
    amber: { bg: colors.amberSoft, fg: colors.amber },
    red: { bg: colors.redSoft, fg: colors.red },
    blue: { bg: colors.blueSoft, fg: colors.blue },
  }[tone];
  return (
    <View style={[styles.pill, { backgroundColor: map.bg }]}>
      <Text style={[styles.pillText, { color: map.fg }]}>{text}</Text>
    </View>
  );
}

export function PrimaryButton({
  title,
  onPress,
  disabled,
  loading,
  tone = "green",
  big,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  tone?: "green" | "ghost" | "red";
  big?: boolean;
}) {
  const bg = tone === "green" ? colors.green : tone === "red" ? colors.redSoft : colors.greenSoft;
  const fg = tone === "green" ? colors.white : tone === "red" ? colors.red : colors.green;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, minHeight: big ? touch.primary : touch.min, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

export function Row({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

export function EmptyState({ text }: { text: string }) {
  return <Text style={styles.empty}>{text}</Text>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  title: { fontSize: font.h2, color: colors.ink, fontWeight: "700", marginBottom: spacing.sm },
  label: { fontSize: font.label, color: colors.muted, marginBottom: spacing.xs },
  pill: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, alignSelf: "flex-start" },
  pillText: { fontSize: 12, fontWeight: "700" },
  button: {
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  buttonText: { fontSize: font.body, fontWeight: "700" },
  row: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm },
  empty: { color: colors.muted, fontSize: font.body, textAlign: "center", paddingVertical: spacing.lg },
});
