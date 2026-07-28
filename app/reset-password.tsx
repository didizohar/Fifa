import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Button } from "../src/components/Button";
import { Screen } from "../src/components/Screen";
import { TextField } from "../src/components/TextField";
import { useAuth } from "../src/hooks/useAuth";
import { exchangeRecoveryCode, updatePassword } from "../src/lib/auth";
import { validateNewPassword } from "../src/lib/authValidation";
import { useTranslation } from "../src/lib/i18n";
import { colors, spacing, typography } from "../src/theme";

type ExchangeState = "exchanging" | "ready" | "invalid";

/**
 * Reached only via the password-reset deep link (`fcrival://reset-password?code=...`).
 * `detectSessionInUrl` is off (see `src/lib/supabase.ts`), so the recovery
 * code from the link is exchanged for a session manually here, and the root
 * navigator's `isPasswordRecovery` guard keeps the user on this screen --
 * even though that exchange leaves them with a real, non-null session --
 * until a new password is set.
 */
export default function ResetPasswordScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { markPasswordRecovery, clearPasswordRecovery } = useAuth();
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

    exchangeRecoveryCode(code)
      .then(() => {
        markPasswordRecovery();
        setExchangeState("ready");
      })
      .catch(() => setExchangeState("invalid"));
  }, [params.code, markPasswordRecovery]);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDone, setIsDone] = useState(false);

  const handleSubmit = async () => {
    if (isSubmitting) return;
    const validationError = validateNewPassword(password, confirmPassword);
    if (validationError === "tooShort") {
      setError(t("auth.newPasswordTooShort"));
      return;
    }
    if (validationError === "mismatch") {
      setError(t("auth.passwordMismatch"));
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await updatePassword(password);
      setIsDone(true);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : t("auth.genericError"));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (exchangeState === "exchanging") {
    return (
      <Screen>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </Screen>
    );
  }

  if (exchangeState === "invalid") {
    return (
      <Screen>
        <View style={styles.centered}>
          <Text style={styles.logo}>⚠️</Text>
          <Text style={styles.title}>{t("auth.resetLinkInvalidTitle")}</Text>
          <Text style={styles.subtitle}>{t("auth.resetLinkInvalidMessage")}</Text>
          <Button label={t("auth.resetLinkInvalidAction")} onPress={() => router.replace("/(auth)/forgot-password")} />
        </View>
      </Screen>
    );
  }

  if (isDone) {
    return (
      <Screen>
        <View style={styles.centered}>
          <Text style={styles.logo}>✅</Text>
          <Text style={styles.subtitle}>{t("auth.resetPasswordSuccessMessage")}</Text>
          <Button label={t("common.done")} onPress={clearPasswordRecovery} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>{t("auth.resetPasswordTitle")}</Text>
        <Text style={styles.subtitle}>{t("auth.resetPasswordSubtitle")}</Text>
      </View>
      <View style={styles.form}>
        <TextField
          label={t("auth.newPasswordLabel")}
          placeholder={t("auth.passwordPlaceholderNew")}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="password-new"
          returnKeyType="next"
        />
        <TextField
          label={t("auth.confirmNewPasswordLabel")}
          placeholder={t("auth.confirmPasswordPlaceholder")}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          autoComplete="password-new"
          returnKeyType="go"
          onSubmitEditing={handleSubmit}
          error={error}
        />
        <Button label={t("auth.resetPasswordButton")} onPress={handleSubmit} loading={isSubmitting} disabled={isSubmitting} />
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
  header: {
    marginTop: spacing.xxl,
    marginBottom: spacing.xxl,
    alignItems: "center",
    gap: spacing.xs,
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
  form: {
    gap: spacing.lg,
  },
});
