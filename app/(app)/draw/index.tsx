import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import type { ComponentProps } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Card } from "../../../src/components/Card";
import { Screen } from "../../../src/components/Screen";
import { useTranslation } from "../../../src/lib/i18n";
import { colors, iconSize, radius, spacing, typography } from "../../../src/theme";

interface DrawOption {
  icon: ComponentProps<typeof Ionicons>["name"];
  titleKey: "draw.randomPlayers" | "draw.createTeams" | "draw.drawClubs" | "draw.fullMatchup";
  subtitleKey: "draw.randomPlayersSubtitle" | "draw.createTeamsSubtitle" | "draw.drawClubsSubtitle" | "draw.fullMatchupSubtitle";
  route: "/draw/players" | "/draw/teams" | "/draw/clubs" | "/draw/matchup";
  enabled: boolean;
}

const OPTIONS: DrawOption[] = [
  { icon: "shuffle", titleKey: "draw.randomPlayers", subtitleKey: "draw.randomPlayersSubtitle", route: "/draw/players", enabled: true },
  { icon: "people", titleKey: "draw.createTeams", subtitleKey: "draw.createTeamsSubtitle", route: "/draw/teams", enabled: true },
  { icon: "shirt", titleKey: "draw.drawClubs", subtitleKey: "draw.drawClubsSubtitle", route: "/draw/clubs", enabled: true },
  { icon: "flash", titleKey: "draw.fullMatchup", subtitleKey: "draw.fullMatchupSubtitle", route: "/draw/matchup", enabled: true },
];

export default function DrawHubScreen() {
  const router = useRouter();
  const { t } = useTranslation();

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>{t("draw.title")}</Text>
        <Text style={styles.subtitle}>{t("draw.subtitle")}</Text>

        {OPTIONS.map((option) => (
          <Pressable
            key={option.route}
            onPress={() => option.enabled && router.push(option.route)}
            disabled={!option.enabled}
            accessibilityRole="button"
            accessibilityLabel={t(option.titleKey)}
            accessibilityState={{ disabled: !option.enabled }}
            style={({ pressed }) => [pressed && option.enabled && styles.cardPressed]}
          >
            <Card style={[styles.card, !option.enabled && styles.cardDisabled]}>
              <View style={styles.icon}>
                <Ionicons name={option.icon} size={iconSize.lg} color={colors.accent} />
              </View>
              <View style={styles.cardText}>
                <Text style={styles.cardTitle}>{t(option.titleKey)}</Text>
                <Text style={styles.cardSubtitle}>{t(option.subtitleKey)}</Text>
              </View>
              <Ionicons name="chevron-forward" size={iconSize.md} color={colors.textMuted} />
            </Card>
          </Pressable>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
    paddingVertical: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  title: {
    ...typography.title,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  cardPressed: {
    opacity: 0.85,
  },
  cardDisabled: {
    opacity: 0.45,
  },
  icon: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  cardText: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    ...typography.bodyStrong,
  },
  cardSubtitle: {
    ...typography.small,
    color: colors.textSecondary,
  },
});
