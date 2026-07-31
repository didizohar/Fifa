import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { EmptyState } from "../../src/components/EmptyState";
import { FilterChip } from "../../src/components/FilterChip";
import { PlayerPicker } from "../../src/components/PlayerPicker";
import { Screen } from "../../src/components/Screen";
import { SkeletonList } from "../../src/components/Skeleton";
import { TimelineChart } from "../../src/components/TimelineChart";
import { useGroup } from "../../src/hooks/useGroup";
import { useGroupMatchHistory } from "../../src/hooks/useMatches";
import { usePlayers } from "../../src/hooks/usePlayers";
import { useTranslation } from "../../src/lib/i18n";
import { ANALYTICS_RANGE_OPTIONS } from "../../src/lib/playerAnalyticsView";
import { toPickablePlayer } from "../../src/lib/players";
import type { AnalyticsRange } from "../../src/lib/analytics/types";
import { calculateTrendSeriesForPlayers, type TrendMetricKey } from "../../src/lib/trends/trendSeries";
import { colors, spacing, typography } from "../../src/theme";

const METRIC_OPTIONS: { value: TrendMetricKey; labelKey: string }[] = [
  { value: "winRate", labelKey: "trendsScreen.metricWinRate" },
  { value: "wins", labelKey: "trendsScreen.metricWins" },
  { value: "goalsPerMatch", labelKey: "trendsScreen.metricGoalsPerMatch" },
  { value: "goalDifference", labelKey: "trendsScreen.metricGoalDifference" },
  { value: "matchesPlayed", labelKey: "trendsScreen.metricMatchesPlayed" },
  { value: "leaguePoints", labelKey: "trendsScreen.metricLeaguePoints" },
];

function formatMetricValue(metric: TrendMetricKey, value: number): string {
  if (metric === "winRate") return `${Math.round(value * 100)}%`;
  if (metric === "goalsPerMatch") return value.toFixed(1);
  return String(Math.round(value));
}

export default function TrendsScreen() {
  const { t } = useTranslation();
  const { currentGroupId } = useGroup();
  const players = usePlayers(currentGroupId);
  const matchHistory = useGroupMatchHistory(currentGroupId);

  const [metric, setMetric] = useState<TrendMetricKey>("winRate");
  const [range, setRange] = useState<AnalyticsRange>("30d");
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);

  const roster = players.data ?? [];
  const allMatches = matchHistory.data ?? [];
  const pickablePlayers = useMemo(() => roster.map(toPickablePlayer), [roster]);

  const selectedPlayers = useMemo(() => roster.filter((p) => selectedPlayerIds.includes(p.id)), [roster, selectedPlayerIds]);
  const effectivePlayers = selectedPlayers.length > 0 ? selectedPlayers : roster;

  const series = useMemo(
    () => calculateTrendSeriesForPlayers(metric, effectivePlayers, allMatches, range),
    [metric, effectivePlayers, allMatches, range],
  );

  const isLoading = players.isLoading || matchHistory.isLoading;

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>{t("trendsScreen.title")}</Text>
        <Text style={styles.subtitle}>{t("trendsScreen.subtitle")}</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {METRIC_OPTIONS.map((opt) => (
          <FilterChip key={opt.value} label={t(opt.labelKey)} active={metric === opt.value} onPress={() => setMetric(opt.value)} />
        ))}
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {ANALYTICS_RANGE_OPTIONS.map((opt) => (
          <FilterChip key={opt.value} label={t(opt.labelKey)} active={range === opt.value} onPress={() => setRange(opt.value)} />
        ))}
      </ScrollView>

      {isLoading ? (
        <SkeletonList count={3} />
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.selectLabel}>{t("trendsScreen.selectPlayers")}</Text>
          <PlayerPicker players={pickablePlayers} selectedIds={selectedPlayerIds} onToggle={(id) => setSelectedPlayerIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))} maxSelected={pickablePlayers.length} />

          {series.length === 0 ? (
            <EmptyState icon="📈" title={t("trendsScreen.emptyTitle")} message={t("trendsScreen.emptyMessage")} />
          ) : (
            series.map((s) => (
              <View key={s.playerId} style={styles.seriesCard}>
                <Text style={styles.seriesName}>{s.playerName}</Text>
                <TimelineChart
                  points={s.points}
                  formatValue={(v) => formatMetricValue(metric, v)}
                  emptyMessage={t("trendsScreen.noDataAvailable")}
                  noDataLabel="–"
                />
              </View>
            ))
          )}
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
  chipRow: {
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  content: {
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  selectLabel: {
    ...typography.caption,
    fontWeight: "700",
  },
  seriesCard: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surface,
  },
  seriesName: {
    ...typography.bodyStrong,
  },
});
