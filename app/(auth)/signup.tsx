import { Link } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Button } from "../../src/components/Button";
import { Screen } from "../../src/components/Screen";
import { TextField } from "../../src/components/TextField";
import { signUpWithEmail } from "../../src/lib/auth";
import { authDeepLink } from "../../src/lib/deepLink";
import { useTranslation } from "../../src/lib/i18n";
import { colors, spacing, typography } from "../../src/theme";

export default function SignupScreen() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);

  const handleSignup = async () => {
    if (isSubmitting) return;
    if (!email.trim() || password.length < 6) {
      setError(t("auth.passwordTooShort"));
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await signUpWithEmail(email.trim(), password, authDeepLink("auth/callback"));
      if (!result.hasSession) {
        // Email confirmation is required on this project -- no session yet.
        setNeedsConfirmation(true);
      }
      // If a session came back, AuthProvider's listener redirects automatically.
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : t("auth.signupFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (needsConfirmation) {
    return (
      <Screen avoidKeyboard>
        <View style={styles.confirmContainer}>
          <Text style={styles.logo}>📬</Text>
          <Text style={styles.title}>{t("auth.checkEmailTitle")}</Text>
          <Text style={styles.subtitle}>{t("auth.checkEmailMessage", { email: email.trim() })}</Text>
          <Link href="/(auth)/login" style={styles.link}>
            <Text style={styles.linkText}>
              <Text style={styles.linkAccent}>{t("auth.backToSignIn")}</Text>
            </Text>
          </Link>
        </View>
      </Screen>
    );
  }

  return (
    <Screen avoidKeyboard>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.logo}>⚽️</Text>
          <Text style={styles.title}>{t("auth.signupTitle")}</Text>
          <Text style={styles.subtitle}>{t("auth.signupSubtitle")}</Text>
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
            returnKeyType="next"
          />
          <TextField
            label={t("auth.passwordLabel")}
            placeholder={t("auth.passwordPlaceholderNew")}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password-new"
            returnKeyType="go"
            onSubmitEditing={handleSignup}
            error={error}
          />
          <Button label={t("auth.signUp")} onPress={handleSignup} loading={isSubmitting} disabled={isSubmitting} />
        </View>
        <Link href="/(auth)/login" style={styles.link}>
          <Text style={styles.linkText}>
            {t("auth.haveAccountPrompt")}
            <Text style={styles.linkAccent}>{t("auth.signIn")}</Text>
          </Text>
        </Link>
      </ScrollView>
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
  linkText: {
    ...typography.caption,
  },
  linkAccent: {
    color: colors.accent,
    fontWeight: "700",
  },
});
