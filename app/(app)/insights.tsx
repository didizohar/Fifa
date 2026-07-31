import { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Card } from "../../src/components/Card";
import { EmptyState } from "../../src/components/EmptyState";
import { Screen } from "../../src/components/Screen";
import { SkeletonList } from "../../src/components/Skeleton";
import { useGroup } from "../../src/hooks/useGroup";
import { useGroupMatchHistory } from "../../src/hooks/useMatches";
import { usePlayers } from "../../src/hooks/usePlayers";
import { useTranslation } from "../../src/lib/i18n";
import { computeInsightsSummary } from "../../src/lib/insightsSummary";
import { colors, spacing, typography } from "../../src/theme";

export default function InsightsScreen() {
  const { t } = useTranslation();
  const { currentGroupId } = useGroup();
  const players = usePlayers(currentGroupId);
  const matchHistory = useGroupMatchHistory(currentGroupId);

  const roster = players.data ?? [];
  const allMatches = matchHistory.data ?? [];
  const summary = useMemo(() => computeInsightsSummary(roster, allMatches), [roster, allMatches]);

  const isLoading = players.isLoading || matchHistory.isLoading;

  const cards = [
    { icon: "🔥", title: t("insightsScreen.bestFormTitle"), why: t("insightsScreen.bestFormWhy"), value: summary.bestForm?.playerName ?? null },
    { icon: "📉", title: t("insightsScreen.worstFormTitle"), why: t("insightsScreen.worstFormWhy"), value: summary.worstForm?.playerName ?? null },
    { icon: "👑", title: t("insightsScreen.playerOfMonthTitle"), why: t("insightsScreen.playerOfMonthWhy"), value: summary.playerOfMonth?.playerName ?? null },
    { icon: "⚽", title: t("insightsScreen.topScorerTitle"), why: t("insightsScreen.topScorerWhy"), value: summary.topScorer ? `${summary.topScorer.playerName} (${summary.topScorer.value})` : null },
    { icon: "🧱", title: t("insightsScreen.bestDefenseTitle"), why: t("insightsScreen.bestDefenseWhy"), value: summary.bestDefense ? `${summary.bestDefense.playerName} (${summary.bestDefense.value})` : null },
    { icon: "💥", title: t("insightsScreen.biggestVictoryTitle"), why: t("insightsScreen.biggestVictoryWhy"), value: summary.biggestVictory ? `${summary.biggestVictory.holderName} · ${summary.biggestVictory.valueLabel}` : null },
    {
      icon: "🤝",
      title: t("insightsScreen.mostFrequentRivalryTitle"),
      why: t("insightsScreen.mostFrequentRivalryWhy"),
      value: summary.mostFrequentRivalry ? `${summary.mostFrequentRivalry.playerAName} & ${summary.mostFrequentRivalry.playerBName} (${summary.mostFrequentRivalry.matchesPlayed})` : null,
    },
    { icon: "🏆", title: t("insightsScreen.longestWinStreakTitle"), why: t("insightsScreen.longestWinStreakWhy"), value: summary.longestWinStreak ? `${summary.longestWinStreak.holderName} · ${summary.longestWinStreak.valueLabel}` : null },
    { icon: "❄️", title: t("insightsScreen.longestLossStreakTitle"), why: t("insightsScreen.longestLossStreakWhy"), value: summary.longestLossStreak ? `${summary.longestLossStreak.holderName} · ${summary.longestLossStreak.valueLabel}` : null },
    { icon: "📈", title: t("insightsScreen.mostImprovedTitle"), why: t("insightsScreen.mostImprovedWhy"), value: summary.mostImprovedPlayer?.playerName ?? null },
  ];

  const hasAnyData = cards.some((c) => c.value !== null);

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>{t("insightsScreen.title")}</Text>
        <Text style={styles.subtitle}>{t("insightsScreen.subtitle")}</Text>
      </View>

      {isLoading ? (
        <SkeletonList count={5} />
      ) : !hasAnyData ? (
        <EmptyState icon="💡" title={t("insightsScreen.emptyTitle")} message={t("insightsScreen.emptyMessage")} />
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {cards
            .filter((c) => c.value !== null)
            .map((c) => (
              <Card key={c.title} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.icon}>{c.icon}</Text>
                  <Text style={styles.cardTitle}>{c.title}</Text>
                </View>
                <Text style={styles.cardValue}>{c.value}</Text>
                <Text style={styles.cardWhy}>{c.why}</Text>
              </Card>
            ))}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.xs,
  },
  title: {
    ...typography.title,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  content: {
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  card: {
    gap: spacing.xs,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  icon: {
    fontSize: 18,
  },
  cardTitle: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: "700",
  },
  cardValue: {
    ...typography.heading,
  },
  cardWhy: {
    ...typography.small,
    color: colors.textSecondary,
  },
});
