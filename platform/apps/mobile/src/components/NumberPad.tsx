import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, font, radius, spacing, touch } from "../theme";

const KEYS = ["۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹", "٫", "۰", "⌫"];

/**
 * صفحه‌کلید عددی خودمان.
 * چرا نه کیبورد سیستم؟ چون در سالن با دستکش، کیبورد کوچک سیستم خطا می‌زند و
 * دکمه‌های بزرگ‌تر با یک دست (شست) قابل استفاده‌اند. اعداد هم فارسی‌اند.
 */
export function NumberPad({ onKey }: { onKey: (key: string) => void }) {
  return (
    <View style={styles.pad}>
      {KEYS.map((key) => (
        <Pressable
          key={key}
          accessibilityRole="button"
          accessibilityLabel={key === "⌫" ? "پاک کردن" : `عدد ${key}`}
          onPress={() => onKey(key)}
          style={({ pressed }) => [styles.key, pressed && { backgroundColor: colors.greenSoft }]}
        >
          <Text style={styles.keyText}>{key}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  pad: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  key: {
    width: "31%",
    height: touch.primary,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  keyText: { fontSize: font.h1, color: colors.ink, fontWeight: "700" },
});
