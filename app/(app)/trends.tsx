import { useCallback, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { AppChipGroup, type ChipOption } from "../../src/components/AppChipGroup";
import { EmptyState } from "../../src/components/EmptyState";
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
import type { MatchSummary } from "../../src/lib/matches";
import type { PlayerProfile } from "../../src/lib/types/database";
import { colors, radius, spacing, typography } from "../../src/theme";

// Stable references so `data ?? []` doesn't allocate a fresh empty array on
// every render while a query has no data yet -- see index.tsx for the same
// pattern and rationale.
const EMPTY_PLAYERS: PlayerProfile[] = [];
const EMPTY_MATCHES: MatchSummary[] = [];

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

  // Memoized (not built fresh from METRIC_OPTIONS/ANALYTICS_RANGE_OPTIONS
  // every render) so AppChipGroup's own React.memo -- a shallow prop
  // comparison -- has a stable `options` reference to compare against.
  const metricOptions = useMemo<ChipOption<TrendMetricKey>[]>(
    () => METRIC_OPTIONS.map((opt) => ({ id: opt.value, label: t(opt.labelKey) })),
    [t],
  );
  const rangeOptions = useMemo<ChipOption<AnalyticsRange>[]>(
    () => ANALYTICS_RANGE_OPTIONS.map((opt) => ({ id: opt.value, label: t(opt.labelKey) })),
    [t],
  );

  const roster = players.data ?? EMPTY_PLAYERS;
  const allMatches = matchHistory.data ?? EMPTY_MATCHES;
  const pickablePlayers = useMemo(() => roster.map(toPickablePlayer), [roster]);

  const selectedPlayers = useMemo(() => roster.filter((p) => selectedPlayerIds.includes(p.id)), [roster, selectedPlayerIds]);
  const effectivePlayers = selectedPlayers.length > 0 ? selectedPlayers : roster;

  const series = useMemo(
    () => calculateTrendSeriesForPlayers(metric, effectivePlayers, allMatches, range),
    [metric, effectivePlayers, allMatches, range],
  );

  // Deliberately not players.isLoading/matchHistory.isLoading:
  // TanStack Query v5 defines isLoading as `isPending && isFetching`, so a
  // *disabled* query (usePlayers/useGroupMatchHistory both gate on
  // `enabled: !!groupId`) reports isLoading:false while it still has no
  // data at all -- e.g. the brief window right after this screen mounts
  // but before GroupProvider's own async hydration has resolved
  // currentGroupId. That false-negative rendered this screen's "loaded"
  // branch with empty players/matches (title + chips, nothing useful
  // below) until some unrelated state change forced a fresh render after
  // the real data had already arrived. Checking for "no data and no error
  // yet" instead keeps the skeleton up for the entire window where we
  // genuinely don't have anything to show, regardless of the query's
  // internal fetching/enabled state.
  const isLoading = (!players.data && !players.isError) || (!matchHistory.data && !matchHistory.isError);

  // Both useCallback'd so PlayerPicker and (more importantly) every
  // TimelineChart below -- each renders one Pressable per data point, up to
  // 30 per player -- can actually skip re-rendering when unrelated state
  // changes. Previously these were fresh inline closures every render,
  // which silently defeated PlayerPicker's memo and made TimelineChart
  // un-memoizable even after wrapping it in React.memo.
  const togglePlayer = useCallback((id: string) => {
    setSelectedPlayerIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);
  const formatValue = useCallback((value: number) => formatMetricValue(metric, value), [metric]);

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>{t("trendsScreen.title")}</Text>
        <Text style={styles.subtitle}>{t("trendsScreen.subtitle")}</Text>
      </View>

      <AppChipGroup
        mode="single"
        options={metricOptions}
        value={metric}
        onChange={setMetric}
        accessibilityLabel={t("trendsScreen.metricFilterLabel")}
        style={styles.chipRow}
      />

      <AppChipGroup
        mode="single"
        options={rangeOptions}
        value={range}
        onChange={setRange}
        accessibilityLabel={t("trendsScreen.rangeFilterLabel")}
        style={styles.chipRow}
      />

      {isLoading ? (
        <SkeletonList count={3} />
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.selectLabel}>{t("trendsScreen.selectPlayers")}</Text>
          <PlayerPicker players={pickablePlayers} selectedIds={selectedPlayerIds} onToggle={togglePlayer} maxSelected={pickablePlayers.length} />

          {series.length === 0 ? (
            <EmptyState icon="📈" title={t("trendsScreen.emptyTitle")} message={t("trendsScreen.emptyMessage")} />
          ) : (
            series.map((s) => (
              <View key={s.playerId} style={styles.seriesCard}>
                <Text style={styles.seriesName}>{s.playerName}</Text>
                <TimelineChart
                  points={s.points}
                  formatValue={formatValue}
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
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surface,
  },
  seriesName: {
    ...typography.bodyStrong,
  },
});
