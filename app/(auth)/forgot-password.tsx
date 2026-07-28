import * as Linking from "expo-linking";
import { Link } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button } from "../../src/components/Button";
import { Screen } from "../../src/components/Screen";
import { TextField } from "../../src/components/TextField";
import { requestPasswordReset } from "../../src/lib/auth";
import { isValidEmail } from "../../src/lib/authValidation";
import { useTranslation } from "../../src/lib/i18n";
import { colors, spacing, typography } from "../../src/theme";

export default function ForgotPasswordScreen() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSent, setIsSent] = useState(false);

  const handleSubmit = async () => {
    if (isSubmitting) return;
    const trimmed = email.trim();
    if (!isValidEmail(trimmed)) {
      setError(t("auth.invalidEmail"));
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await requestPasswordReset(trimmed, Linking.createURL("reset-password"));
      setIsSent(true);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : t("auth.genericError"));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSent) {
    return (
      <Screen>
        <View style={styles.confirmContainer}>
          <Text style={styles.logo}>📬</Text>
          <Text style={styles.title}>{t("auth.resetRequestSuccessTitle")}</Text>
          <Text style={styles.subtitle}>{t("auth.resetRequestSuccessMessage", { email: email.trim() })}</Text>
          <Link href="/(auth)/login" style={styles.link}>
            <Text style={styles.linkAccent}>{t("auth.backToSignIn")}</Text>
          </Link>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.logo}>🔑</Text>
        <Text style={styles.title}>{t("auth.resetRequestTitle")}</Text>
        <Text style={styles.subtitle}>{t("auth.resetRequestSubtitle")}</Text>
      </View>
      <View style={styles.form}>
        <TextField
          label={t("auth.emailLabel")}
          placeholder={t("auth.emailPlaceholder")}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          returnKeyType="go"
          onSubmitEditing={handleSubmit}
          error={error}
        />
        <Button label={t("auth.resetRequestButton")} onPress={handleSubmit} loading={isSubmitting} disabled={isSubmitting} />
      </View>
      <Link href="/(auth)/login" style={styles.link}>
        <Text style={styles.linkAccent}>{t("auth.backToSignIn")}</Text>
      </Link>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    marginTop: spacing.xxl,
    marginBottom: spacing.xxl,
    alignItems: "center",
    gap: spacing.xs,
  },
  confirmContainer: {
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
  form: {
    gap: spacing.lg,
  },
  link: {
    marginTop: spacing.xl,
    alignSelf: "center",
  },
  linkAccent: {
    ...typography.caption,
    color: colors.accent,
    fontWeight: "700",
  },
});
