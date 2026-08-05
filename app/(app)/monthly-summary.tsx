import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Card } from "../../src/components/Card";
import { Chevron } from "../../src/components/Chevron";
import { Screen } from "../../src/components/Screen";
import { SkeletonList } from "../../src/components/Skeleton";
import { TrendCard } from "../../src/components/TrendCard";
import { useGroup } from "../../src/hooks/useGroup";
import { useGroupMatchHistory } from "../../src/hooks/useMatches";
import { usePlayers } from "../../src/hooks/usePlayers";
import { useWinnersStaySessionHistory } from "../../src/hooks/useWinnersStaySessionHistory";
import { useTranslation } from "../../src/lib/i18n";
import { describeMetricChange } from "../../src/lib/metricPresentation";
import { computeMonthlySummary } from "../../src/lib/monthlySummary";
import { colors, radius, spacing, typography } from "../../src/theme";

function formatSignedPercent(value: number | null): string {
  if (value === null) return "—";
  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

export default function MonthlySummaryScreen() {
  const { t, locale } = useTranslation();
  const { currentGroupId } = useGroup();
  const players = usePlayers(currentGroupId);
  const matchHistory = useGroupMatchHistory(currentGroupId);
  const { history: sessionHistory } = useWinnersStaySessionHistory(currentGroupId);
  const [monthOffset, setMonthOffset] = useState(0);

  const roster = players.data ?? [];
  const allMatches = matchHistory.data ?? [];
  const isFutureMonth = monthOffset >= 0;

  const target = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + monthOffset);
    return d;
  }, [monthOffset]);

  const summary = useMemo(
    () => computeMonthlySummary(roster, allMatches, sessionHistory.map((h) => h.endedAt), target.getFullYear(), target.getMonth()),
    [roster, allMatches, sessionHistory, target],
  );

  const monthLabel = useMemo(() => new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(target), [locale, target]);

  const isLoading = players.isLoading || matchHistory.isLoading;

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>{t("monthlySummary.title")}</Text>
      </View>

      <View style={styles.monthNav}>
        <Pressable onPress={() => setMonthOffset((m) => m - 1)} accessibilityRole="button" accessibilityLabel={t("monthlySummary.previousMonth")}>
          <Chevron direction="back" size={20} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.monthLabel}>{monthLabel}</Text>
        <Pressable
          onPress={() => !isFutureMonth && setMonthOffset((m) => m + 1)}
          disabled={isFutureMonth}
          accessibilityRole="button"
          accessibilityLabel={t("monthlySummary.nextMonth")}
        >
          <Chevron direction="forward" size={20} color={isFutureMonth ? colors.textMuted : colors.textPrimary} />
        </Pressable>
      </View>

      {isLoading ? (
        <SkeletonList count={5} />
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {summary.matchesPlayed.current === 0 ? (
            <Card>
              <Text style={styles.emptyTitle}>{t("monthlySummary.noDataTitle")}</Text>
              <Text style={styles.emptyMessage}>{t("monthlySummary.noDataMessage")}</Text>
            </Card>
          ) : null}

          <View style={styles.metricsGrid}>
            <View style={styles.metricsGridItem}>
              <TrendCard
                icon="⚽️"
                title={t("monthlySummary.matchesPlayed")}
                valueLabel={String(summary.matchesPlayed.current)}
                change={describeMetricChange(summary.matchesPlayed.current, summary.matchesPlayed.previous)}
                changeLabel={formatSignedPercent(summary.matchesPlayed.percentChange)}
                explanation={t("monthlySummary.comparedToPreviousMonth")}
                noComparisonLabel={t("monthlySummary.noPreviousMonthData")}
              />
            </View>
            <View style={styles.metricsGridItem}>
              <TrendCard
                icon="🥅"
                title={t("monthlySummary.totalGoals")}
                valueLabel={String(summary.totalGoals.current)}
                change={describeMetricChange(summary.totalGoals.current, summary.totalGoals.previous)}
                changeLabel={formatSignedPercent(summary.totalGoals.percentChange)}
                explanation={t("monthlySummary.comparedToPreviousMonth")}
                noComparisonLabel={t("monthlySummary.noPreviousMonthData")}
              />
            </View>
            <View style={styles.metricsGridItem}>
              <TrendCard
                icon="📊"
                title={t("monthlySummary.averageGoalsPerMatch")}
                valueLabel={summary.averageGoalsPerMatch.current.toFixed(1)}
                change={summary.averageGoalsPerMatch.previous === null ? null : describeMetricChange(summary.averageGoalsPerMatch.current, summary.averageGoalsPerMatch.previous)}
                changeLabel={formatSignedPercent(summary.averageGoalsPerMatch.percentChange)}
                explanation={t("monthlySummary.comparedToPreviousMonth")}
                noComparisonLabel={t("monthlySummary.noPreviousMonthData")}
              />
            </View>
            <View style={styles.metricsGridItem}>
              <TrendCard
                icon="🔁"
                title={t("monthlySummary.sessionsCompleted")}
                valueLabel={String(summary.sessionsCompleted.current)}
                change={describeMetricChange(summary.sessionsCompleted.current, summary.sessionsCompleted.previous)}
                changeLabel={formatSignedPercent(summary.sessionsCompleted.percentChange)}
                explanation={t("monthlySummary.comparedToPreviousMonth")}
                noComparisonLabel={t("monthlySummary.noPreviousMonthData")}
              />
            </View>
          </View>

          <AwardCard
            icon="👑"
            title={t("monthlySummary.playerMostWins")}
            value={summary.report.playerOfMonthName ? `${summary.report.playerOfMonthName}` : null}
            noDataLabel={t("monthlySummary.noAwardYet")}
          />
          <AwardCard
            icon="📈"
            title={t("monthlySummary.highestWinRate")}
            value={summary.highestEligibleWinRate ? `${summary.highestEligibleWinRate.playerName} (${Math.round(summary.highestEligibleWinRate.winRate * 100)}%)` : null}
            noDataLabel={t("monthlySummary.noAwardYet")}
          />
          <AwardCard
            icon="⚽️"
            title={t("monthlySummary.topScorer")}
            value={summary.report.topScorerName ? `${summary.report.topScorerName} (${summary.report.topScorerGoals})` : null}
            noDataLabel={t("monthlySummary.noAwardYet")}
          />
          <AwardCard
            icon="🚀"
            title={t("monthlySummary.mostImproved")}
            value={summary.report.awards.find((a) => a.id === "most-improved")?.holderName ?? null}
            noDataLabel={t("monthlySummary.noAwardYet")}
          />
          <AwardCard
            icon="🔥"
            title={t("monthlySummary.highestScoringMatch")}
            value={summary.highestScoringMatch ? `${summary.highestScoringMatch.holderName} · ${t(summary.highestScoringMatch.valueLabelKey, summary.highestScoringMatch.valueLabelParams)}` : null}
            noDataLabel={t("monthlySummary.noAwardYet")}
          />
          <AwardCard
            icon="🤝"
            title={t("monthlySummary.bestPair")}
            value={summary.report.awards.find((a) => a.id === "best-partnership")?.holderName ?? null}
            noDataLabel={t("monthlySummary.noAwardYet")}
          />
          <AwardCard
            icon="🛡️"
            title={t("monthlySummary.mostSelectedClub")}
            value={summary.mostSelectedClub ? `${summary.mostSelectedClub.clubName} (${summary.mostSelectedClub.matchesPlayed})` : null}
            noDataLabel={t("monthlySummary.noAwardYet")}
          />
        </ScrollView>
      )}
    </Screen>
  );
}

function AwardCard({ icon, title, value, noDataLabel }: { icon: string; title: string; value: string | null; noDataLabel: string }) {
  return (
    <Card style={styles.awardCard}>
      <View style={styles.awardHeader}>
        <Text style={styles.awardIcon}>{icon}</Text>
        <Text style={styles.awardTitle}>{title}</Text>
      </View>
      <Text style={value ? styles.awardValue : styles.awardEmpty}>{value ?? noDataLabel}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  title: {
    ...typography.title,
  },
  monthNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.lg,
    paddingBottom: spacing.md,
  },
  monthLabel: {
    ...typography.heading,
    minWidth: 160,
    textAlign: "center",
  },
  content: {
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  emptyTitle: {
    ...typography.bodyStrong,
  },
  emptyMessage: {
    ...typography.small,
    color: colors.textSecondary,
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  metricsGridItem: {
    width: "47%",
    flexGrow: 1,
  },
  awardCard: {
    gap: spacing.xs,
  },
  awardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  awardIcon: {
    fontSize: 16,
  },
  awardTitle: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  awardValue: {
    ...typography.bodyStrong,
  },
  awardEmpty: {
    ...typography.body,
    color: colors.textMuted,
  },
});
