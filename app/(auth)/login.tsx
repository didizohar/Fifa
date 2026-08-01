import { useState } from "react";
import { Link } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { Button } from "../../src/components/Button";
import { Screen } from "../../src/components/Screen";
import { TextField } from "../../src/components/TextField";
import { signInWithEmail } from "../../src/lib/auth";
import { useTranslation } from "../../src/lib/i18n";
import { colors, spacing, typography } from "../../src/theme";

export default function LoginScreen() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLogin = async () => {
    if (isSubmitting) return;
    if (!email.trim() || !password) {
      setError(t("auth.missingFields"));
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await signInWithEmail(email.trim(), password);
      // AuthProvider's onAuthStateChange picks up the new session and the
      // root layout redirects automatically -- no manual navigation here.
    } catch (e) {
      // Supabase's own message here is already user-safe (e.g. "Invalid
      // login credentials") -- it never reveals whether the email exists.
      setError(e instanceof Error && e.message ? e.message : t("auth.loginFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Screen avoidKeyboard>
      <View style={styles.header}>
        <Text style={styles.logo}>⚽️</Text>
        <Text style={styles.title}>FC Rival</Text>
        <Text style={styles.subtitle}>{t("auth.loginSubtitle")}</Text>
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
          placeholder={t("auth.passwordPlaceholder")}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="password"
          returnKeyType="go"
          onSubmitEditing={handleLogin}
          error={error}
        />
        <Link href="/(auth)/forgot-password" style={styles.forgotLink}>
          <Text style={styles.linkAccent}>{t("auth.forgotPassword")}</Text>
        </Link>
        <Button label={t("auth.signIn")} onPress={handleLogin} loading={isSubmitting} disabled={isSubmitting} />
      </View>
      <Link href="/(auth)/signup" style={styles.link}>
        <Text style={styles.linkText}>
          {t("auth.noAccountPrompt")}
          <Text style={styles.linkAccent}>{t("auth.signUp")}</Text>
        </Text>
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
  logo: {
    fontSize: 48,
    marginBottom: spacing.sm,
  },
  title: {
    ...typography.display,
  },
  subtitle: {
    ...typography.caption,
  },
  form: {
    gap: spacing.lg,
  },
  forgotLink: {
    alignSelf: "flex-end",
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
