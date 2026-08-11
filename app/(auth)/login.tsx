import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { Link, useRouter } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { Button } from "../../src/components/Button";
import { Screen } from "../../src/components/Screen";
import { TextField } from "../../src/components/TextField";
import { signInWithEmail } from "../../src/lib/auth";
import { useTranslation } from "../../src/lib/i18n";
import { useTheme } from "../../src/theme/ThemeContext";

export default function LoginScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, radius, spacing, typography } = useTheme();
  const styles = useAuthStyles(colors, radius, spacing, typography);
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
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.logoBadge}>
            <Ionicons name="football" size={40} color={colors.background} />
          </View>
          <Text style={styles.title}>
            <Text style={styles.titleCouch}>Couch</Text>
            <Text style={styles.titleLeague}>League</Text>
          </Text>
          <Text style={styles.tagline}>{t("auth.tagline")}</Text>
        </View>

        <View style={styles.welcomeBlock}>
          <Text style={styles.welcome}>{t("auth.welcomeBack")}</Text>
          <Text style={styles.subtitle}>{t("auth.loginSubtitle")}</Text>
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
            placeholder={t("auth.passwordPlaceholder")}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password"
            returnKeyType="go"
            onSubmitEditing={handleLogin}
            error={error}
          />
          <Button label={t("auth.signIn")} onPress={handleLogin} loading={isSubmitting} disabled={isSubmitting} />
          <Link href="/(auth)/forgot-password" style={styles.forgotLink}>
            <Text style={styles.linkAccent}>{t("auth.forgotPassword")}</Text>
          </Link>
        </View>

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>{t("common.or")}</Text>
          <View style={styles.dividerLine} />
        </View>

        <Button label={t("auth.createAccountAction")} variant="secondary" onPress={() => router.push("/(auth)/signup")} />

        <View style={styles.footerRow}>
          <Ionicons name="shield-checkmark-outline" size={14} color={colors.textMuted} />
          <Text style={styles.footerText}>{t("auth.securePrivateFooter")}</Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

export function useAuthStyles(colors: ReturnType<typeof useTheme>["colors"], radius: ReturnType<typeof useTheme>["radius"], spacing: ReturnType<typeof useTheme>["spacing"], typography: ReturnType<typeof useTheme>["typography"]) {
  return useMemo(
    () => ({
      header: { marginTop: spacing.xxl, alignItems: "center" as const, gap: spacing.xs },
      logoBadge: {
        width: 72,
        height: 72,
        borderRadius: 36,
        backgroundColor: colors.accent,
        alignItems: "center" as const,
        justifyContent: "center" as const,
        marginBottom: spacing.sm,
      },
      title: { ...typography.display, fontWeight: "800" as const },
      titleCouch: { color: colors.textPrimary },
      titleLeague: { color: colors.accent },
      tagline: { ...typography.caption, color: colors.accentOrange, fontWeight: "700" as const },
      welcomeBlock: { alignItems: "center" as const, gap: 2, marginTop: spacing.xxl, marginBottom: spacing.xl },
      welcome: { ...typography.title },
      subtitle: { ...typography.caption, color: colors.textSecondary },
      form: { gap: spacing.md },
      forgotLink: { alignSelf: "center" as const, marginTop: spacing.xs },
      dividerRow: { flexDirection: "row" as const, alignItems: "center" as const, gap: spacing.sm, marginVertical: spacing.lg },
      dividerLine: { flex: 1, height: 1, backgroundColor: colors.borderSubtle },
      dividerText: { ...typography.small, color: colors.textMuted },
      linkAccent: { color: colors.accent, fontWeight: "700" as const },
      footerRow: { flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "center" as const, gap: spacing.xs, marginTop: spacing.xl, marginBottom: spacing.lg },
      footerText: { ...typography.small, color: colors.textMuted },
    }),
    [colors, radius, spacing, typography],
  );
}
