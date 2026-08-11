import { Ionicons } from "@expo/vector-icons";
import { Link } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Button } from "../../src/components/Button";
import { Screen } from "../../src/components/Screen";
import { TextField } from "../../src/components/TextField";
import { signUpWithEmail } from "../../src/lib/auth";
import { authDeepLink } from "../../src/lib/deepLink";
import { useTranslation } from "../../src/lib/i18n";
import { useTheme } from "../../src/theme/ThemeContext";
import { useAuthStyles } from "./login";

export default function SignupScreen() {
  const { t } = useTranslation();
  const { colors, radius, spacing, typography } = useTheme();
  const authStyles = useAuthStyles(colors, radius, spacing, typography);
  const styles = useSignupStyles(colors, spacing, typography);
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
          <View style={authStyles.logoBadge}>
            <Ionicons name="mail" size={36} color={colors.background} />
          </View>
          <Text style={styles.title}>{t("auth.checkEmailTitle")}</Text>
          <Text style={styles.subtitle}>{t("auth.checkEmailMessage", { email: email.trim() })}</Text>
          <Link href="/(auth)/login" style={styles.link}>
            <Text style={styles.linkText}>
              <Text style={authStyles.linkAccent}>{t("auth.backToSignIn")}</Text>
            </Text>
          </Link>
        </View>
      </Screen>
    );
  }

  return (
    <Screen avoidKeyboard>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={authStyles.header}>
          <View style={authStyles.logoBadge}>
            <Ionicons name="football" size={40} color={colors.background} />
          </View>
          <Text style={authStyles.title}>
            <Text style={authStyles.titleCouch}>Couch</Text>
            <Text style={authStyles.titleLeague}>League</Text>
          </Text>
          <Text style={authStyles.tagline}>{t("auth.tagline")}</Text>
        </View>

        <View style={styles.welcomeBlock}>
          <Text style={styles.title}>{t("auth.signupTitle")}</Text>
          <Text style={styles.subtitle}>{t("auth.signupSubtitle")}</Text>
        </View>

        <View style={styles.form}>
          <TextField
            icon="mail-outline"
            placeholder={t("auth.emailPlaceholder")}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            returnKeyType="next"
          />
          <TextField
            icon="lock-closed-outline"
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
            <Text style={authStyles.linkAccent}>{t("auth.signIn")}</Text>
          </Text>
        </Link>
      </ScrollView>
    </Screen>
  );
}

function useSignupStyles(colors: ReturnType<typeof useTheme>["colors"], spacing: ReturnType<typeof useTheme>["spacing"], typography: ReturnType<typeof useTheme>["typography"]) {
  return useMemo(
    () => ({
      confirmContainer: { flex: 1, alignItems: "center" as const, justifyContent: "center" as const, gap: spacing.sm, paddingHorizontal: spacing.lg },
      welcomeBlock: { alignItems: "center" as const, gap: 2, marginTop: spacing.xxl, marginBottom: spacing.xl },
      title: { ...typography.title, textAlign: "center" as const },
      subtitle: { ...typography.caption, textAlign: "center" as const, color: colors.textSecondary },
      form: { gap: spacing.md },
      link: { marginTop: spacing.xl, alignSelf: "center" as const },
      linkText: { ...typography.caption },
    }),
    [colors, spacing, typography],
  );
}
