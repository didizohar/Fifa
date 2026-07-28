import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { Button } from "../../src/components/Button";
import { Screen } from "../../src/components/Screen";
import { useTranslation } from "../../src/lib/i18n";
import { colors, spacing, typography } from "../../src/theme";

export default function OnboardingScreen() {
  const router = useRouter();
  const { t } = useTranslation();

  return (
    <Screen>
      <View style={styles.container}>
        <Text style={styles.logo}>⚽️</Text>
        <Text style={styles.title}>{t("group.onboardingTitle")}</Text>
        <Text style={styles.subtitle}>{t("group.onboardingSubtitle")}</Text>
        <View style={styles.actions}>
          <Button label={t("group.createGroupAction")} onPress={() => router.push("/group/create")} />
          <Button label={t("group.joinGroupAction")} variant="secondary" onPress={() => router.push("/group/join")} />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  logo: {
    fontSize: 56,
    marginBottom: spacing.sm,
  },
  title: {
    ...typography.title,
    textAlign: "center",
  },
  subtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: "center",
    marginBottom: spacing.xl,
  },
  actions: {
    width: "100%",
    gap: spacing.md,
  },
});
