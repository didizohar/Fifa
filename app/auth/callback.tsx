import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Button } from "../../src/components/Button";
import { Screen } from "../../src/components/Screen";
import { supabase } from "../../src/lib/supabase";
import { useTranslation } from "../../src/lib/i18n";
import { colors, spacing, typography } from "../../src/theme";

type ExchangeState = "exchanging" | "invalid";

/**
 * Reached via the signup email-confirmation deep link
 * (`fcrival://auth/callback?code=...`). `detectSessionInUrl` is off (see
 * src/lib/supabase.ts), so -- same as reset-password.tsx's recovery-code
 * exchange -- the code is exchanged for a session manually here rather than
 * relying on the SDK to pick it up from the URL automatically.
 *
 * Unlike password recovery, a successful signup confirmation needs no
 * extra step from the user: once the session is set, AuthProvider's
 * onAuthStateChange listener picks it up and the root navigator's own
 * session/group guards take it from there (a fresh signup has no group yet,
 * so it lands in onboarding). This screen isn't part of that guarded set
 * (same as group/create, group/join), so it replaces itself with "/" once
 * the exchange resolves, handing off to that guard-based routing instead of
 * staying on screen underneath it.
 */
export default function AuthCallbackScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string }>();
  const [exchangeState, setExchangeState] = useState<ExchangeState>("exchanging");
  const hasStartedExchange = useRef(false);

  useEffect(() => {
    if (hasStartedExchange.current) return;
    hasStartedExchange.current = true;

    const code = typeof params.code === "string" ? params.code : null;
    if (!code) {
      setExchangeState("invalid");
      return;
    }

    supabase.auth
      .exchangeCodeForSession(code)
      .then(({ error }) => {
        if (error) {
          setExchangeState("invalid");
          return;
        }
        router.replace("/");
      })
      .catch(() => setExchangeState("invalid"));
  }, [params.code, router]);

  if (exchangeState === "invalid") {
    return (
      <Screen avoidKeyboard>
        <View style={styles.centered}>
          <Text style={styles.logo}>⚠️</Text>
          <Text style={styles.title}>{t("auth.confirmLinkInvalidTitle")}</Text>
          <Text style={styles.subtitle}>{t("auth.confirmLinkInvalidMessage")}</Text>
          <Button label={t("auth.confirmLinkInvalidAction")} onPress={() => router.replace("/(auth)/login")} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen avoidKeyboard>
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  logo: {
    fontSize: 48,
    marginBottom: spacing.sm,
  },
  title: {
    ...typography.title,
    textAlign: "center",
  },
  subtitle: {
    ...typography.caption,
    textAlign: "center",
  },
});
