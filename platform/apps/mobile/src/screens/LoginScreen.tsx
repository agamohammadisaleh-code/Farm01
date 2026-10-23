import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { colors, font, radius, spacing, T } from "../theme";
import { Card, Label, PrimaryButton, Title } from "../components/ui";
import { login, type SessionUser } from "../api/client";

export function LoginScreen({ onLoggedIn }: { onLoggedIn: (user: SessionUser) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const user = await login(email.trim(), password);
      onLoggedIn(user);
    } catch (e) {
      setError(e instanceof Error ? e.message : "ورود ناموفق بود.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.hero}>
          <Text style={styles.logo}>🐔</Text>
          <Title>{T.appName}</Title>
          <Text style={styles.sub}>مدیریت گله گوشتی — آفلاین و سریع</Text>
        </View>

        <Card>
          <Label>{T.email}</Label>
          <TextInput
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            textAlign="left"
            style={styles.input}
            placeholder="owner@farm.ir"
          />
          <Label>{T.password}</Label>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textAlign="left"
            style={styles.input}
            placeholder="••••••••"
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <PrimaryButton title={T.login} big onPress={submit} loading={busy} disabled={!email || !password} />
        </Card>

        <Text style={styles.hint}>
          پس از نخستین ورود، داده‌ها محلی ذخیره می‌شوند و اپ بدون اینترنت هم قابل استفاده است.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, justifyContent: "center", flexGrow: 1 },
  hero: { alignItems: "center", marginBottom: spacing.lg },
  logo: { fontSize: 56 },
  sub: { color: colors.muted, fontSize: font.label, marginTop: spacing.xs },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    height: 52,
    fontSize: font.body,
    marginBottom: spacing.md,
    backgroundColor: colors.white,
  },
  error: { color: colors.red, fontSize: font.label, marginBottom: spacing.sm },
  hint: { color: colors.muted, fontSize: font.caption, textAlign: "center", marginTop: spacing.md },
});
