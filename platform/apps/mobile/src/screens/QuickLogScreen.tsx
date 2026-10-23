import React, { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { can, type Role } from "@farm/domain";
import { colors, font, radius, spacing, T, touch } from "../theme";
import { Card, Label, Pill, PrimaryButton, Row, Title } from "../components/ui";
import { NumberPad } from "../components/NumberPad";
import { recordOffline } from "../sync/engine";
import { logsForDate, openDb, type LocalFlock } from "../storage/db";

type Field = "mortality" | "feedKg" | "waterLiter" | "avgTemp";

const FIELDS: { key: Field; label: string; icon: string; unit: string; tone: string }[] = [
  { key: "mortality", label: T.mortality, icon: "🐔", unit: "قطعه", tone: colors.red },
  { key: "feedKg", label: "دان", icon: "🌾", unit: "کیلوگرم", tone: colors.amber },
  { key: "waterLiter", label: "آب", icon: "💧", unit: "لیتر", tone: colors.blue },
  { key: "avgTemp", label: "دما", icon: "🌡️", unit: "درجه", tone: colors.green },
];

function faDate(offset: number): string {
  // تاریخ میلادی ISO همان چیزی است که API می‌خواهد؛ نمایش شمسی جای دیگری است
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

export function QuickLogScreen({
  flock,
  role,
  onSaved,
}: {
  flock: LocalFlock | null;
  role: Role;
  onSaved: (message: string) => void;
}) {
  const [dayOffset, setDayOffset] = useState(0);
  const [active, setActive] = useState<Field>("mortality");
  const [values, setValues] = useState<Record<Field, string>>({
    mortality: "",
    feedKg: "",
    waterLiter: "",
    avgTemp: "",
  });
  const [saving, setSaving] = useState(false);

  const date = faDate(dayOffset);
  const allowed = can(role, "log:write");

  const existing = useMemo(() => (flock ? logsForDate(flock.id, date) : null), [flock?.id, date, saving]);

  const setField = (field: Field, raw: string) => {
    setValues((prev) => ({ ...prev, [field]: raw }));
  };

  const onKey = (key: string) => {
    const current = values[active];
    if (key === "⌫") {
      // ارقام فارسی هم پاک شوند
      setField(active, current.slice(0, -1));
      return;
    }
    const next = key === "٫" ? (current.includes(".") ? current : `${current || "0"}.`) : `${current}${key}`;
    setField(active, next.slice(0, 6));
  };

  /** ورودی فارسی → عدد لاتین */
  const toNumber = (value: string): number => {
    const latin = value
      .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
      .replace(/٫/g, ".")
      .replace(/[^\d.]/g, "");
    const parsed = Number(latin);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const save = () => {
    if (!flock) return;
    setSaving(true);
    try {
      const payload = {
        date,
        mortality: Math.round(toNumber(values.mortality)),
        feedKg: toNumber(values.feedKg),
        waterLiter: toNumber(values.waterLiter),
        avgTemp: values.avgTemp ? toNumber(values.avgTemp) : undefined,
      };

      recordOffline({ type: "log.save", flockId: flock.id, payload });

      // پیش‌بینی محلی: اگر تلفات از تعداد زنده بیشتر باشد، همان‌جا هشدار بده
      const db = openDb();
      const previous = db.getFirstSync<{ mortality: number; cull: number }>(
        "SELECT mortality, cull FROM logs WHERE flock_id = ? AND date < ? ORDER BY date DESC LIMIT 1",
        [flock.id, date],
      );
      const live = Math.max(0, (flock.initial_count ?? 0) - (previous?.mortality ?? 0) - (previous?.cull ?? 0));

      setValues({ mortality: "", feedKg: "", waterLiter: "", avgTemp: "" });
      setDayOffset(0);
      onSaved(
        live > 0 && payload.mortality > live
          ? `ثبت شد و در صف ارسال است — توجه: تلفات (${payload.mortality}) از تعداد زنده (${live}) بیشتر است.`
          : "ثبت شد و در صف ارسال است. ✅",
      );
    } finally {
      setSaving(false);
    }
  };

  const summary = [
    values.mortality && `تلفات ${values.mortality}`,
    values.feedKg && `دان ${values.feedKg} کیلو`,
    values.waterLiter && `آب ${values.waterLiter} لیتر`,
    values.avgTemp && `دما ${values.avgTemp}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Card>
        <Row style={{ justifyContent: "space-between" }}>
          <Title>{T.quickLog}</Title>
          {flock && <Pill text={flock.name} />}
        </Row>
        <Row style={{ gap: spacing.sm }}>
          {[
            { offset: 0, label: T.today },
            { offset: -1, label: T.yesterday },
          ].map((item) => (
            <PrimaryButton
              key={item.offset}
              title={item.label}
              tone={dayOffset === item.offset ? "green" : "ghost"}
              onPress={() => setDayOffset(item.offset)}
            />
          ))}
        </Row>
        {existing ? (
          <Text style={styles.existing}>
            برای این روز قبلاً ثبت شده: تلفات {existing.mortality}، دان {existing.feed_kg} کیلو، آب{" "}
            {existing.water_liter} لیتر. ثبت جدید جایگزین می‌شود.
          </Text>
        ) : null}
      </Card>

      <View style={styles.grid}>
        {FIELDS.map((field) => {
          const isActive = active === field.key;
          return (
            <Text
              key={field.key}
              onPress={() => setActive(field.key)}
              accessibilityRole="button"
              accessibilityLabel={`${field.label} — انتخاب برای ورود`}
              style={[
                styles.tile,
                { borderColor: isActive ? field.tone : colors.line, borderWidth: isActive ? 2 : 1 },
              ]}
            >
              <Text style={styles.tileIcon}>{field.icon}</Text>
              <Text style={styles.tileLabel}>{field.label}</Text>
              <Text style={[styles.tileValue, { color: values[field.key] ? colors.ink : colors.muted }]}>
                {values[field.key] || `۰ ${field.unit}`}
              </Text>
            </Text>
          );
        })}
      </View>

      <Card>
        <Label>
          ورود عدد برای «{FIELDS.find((f) => f.key === active)?.label}» —{" "}
          {FIELDS.find((f) => f.key === active)?.unit}
        </Label>
        <NumberPad onKey={onKey} />
      </Card>

      {summary ? <Text style={styles.summary}>{summary}</Text> : null}

      <PrimaryButton
        title={T.save}
        big
        onPress={save}
        loading={saving}
        disabled={!allowed || !flock || summary.length === 0}
      />
      <Text style={styles.help}>
        {allowed
          ? "همین حالا در گوشی ذخیره می‌شود؛ ارسال به سرور خودکار انجام می‌شود — حتی اگر اینترنت نباشد."
          : T.noAccess}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  grid: { flexDirection: "row-reverse", flexWrap: "wrap", justifyContent: "space-between", marginBottom: spacing.md },
  tile: {
    width: "48%",
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    minHeight: touch.primary + 24,
    justifyContent: "space-between",
  },
  tileIcon: { fontSize: 26 },
  tileLabel: { fontSize: font.label, color: colors.muted, marginTop: spacing.xs },
  tileValue: { fontSize: font.h2, fontWeight: "800", marginTop: spacing.xs },
  summary: {
    fontSize: font.body,
    color: colors.ink,
    textAlign: "center",
    marginBottom: spacing.md,
    backgroundColor: colors.greenSoft,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
  },
  existing: { fontSize: font.caption, color: colors.amber, marginTop: spacing.sm },
  help: { fontSize: font.caption, color: colors.muted, textAlign: "center", marginTop: spacing.md },
});
