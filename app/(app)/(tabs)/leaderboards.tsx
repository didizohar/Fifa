import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { LayoutAnimation, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Avatar } from "../../../src/components/Avatar";
import { Card } from "../../../src/components/Card";
import { EmptyState } from "../../../src/components/EmptyState";
import { ErrorState } from "../../../src/components/ErrorState";
import { ExportButton } from "../../../src/components/ExportButton";
import { FadeIn } from "../../../src/components/FadeIn";
import { Podium } from "../../../src/components/Podium";
import { RankingRow } from "../../../src/components/RankingRow";
import { Screen } from "../../../src/components/Screen";
import { SegmentedControl } from "../../../src/components/SegmentedControl";
import { SkeletonList } from "../../../src/components/Skeleton";
import { useAuth } from "../../../src/hooks/useAuth";
import { useGroup } from "../../../src/hooks/useGroup";
import { useGroupMatchHistory } from "../../../src/hooks/useMatches";
import { usePlayers } from "../../../src/hooks/usePlayers";
import { leaderboardToCsv } from "../../../src/lib/csv";
import type { MatchSummary } from "../../../src/lib/matches";
import {
  computeBestDoublesPairs,
  computeCleanSheetsLeaderboard,
  computeEloLeaderboard,
  computeFewestConcededLeaderboard,
  computeGoalDifferenceLeaderboard,
  computeGoalsScoredLeaderboard,
  computeLongestLossStreakLeaderboard,
  computeLongestStreakLeaderboard,
  computeMonthlyLeaderboard,
  computeMostMatchesLeaderboard,
  computeWinRateLeaderboard,
  type LeaderboardRow,
} from "../../../src/lib/stats";
import { colors, radius, spacing, typography } from "../../../src/theme";

type Category =
  | "elo"
  | "winRate"
  | "mostMatches"
  | "winStreak"
  | "lossStreak"
  | "goalsScored"
  | "goalsConceded"
  | "goalDifference"
  | "cleanSheets"
  | "doublesPairs"
  | "monthly";

type MatchTypeFilter = "overall" | "singles" | "doubles";

const CATEGORIES: { id: Category; label: string; emptyMessage: string }[] = [
  { id: "elo", label: "Elo", emptyMessage: "Add players to start tracking Elo ratings." },
  { id: "winRate", label: "Win %", emptyMessage: "Players need a few matches played before a win rate is meaningful." },
  { id: "mostMatches", label: "Most Matches", emptyMessage: "Record a match to see who's most active." },
  { id: "winStreak", label: "Win Streak", emptyMessage: "No active win streaks yet -- win a couple in a row to show up here." },
  { id: "lossStreak", label: "Loss Streak", emptyMessage: "Nobody's on a losing streak yet." },
  { id: "goalsScored", label: "Goals Scored", emptyMessage: "Record a match to start tallying goals." },
  { id: "goalsConceded", label: "Goals Conceded", emptyMessage: "Needs a few matches played to rank defenses fairly." },
  { id: "goalDifference", label: "Goal Diff", emptyMessage: "Record a match to see goal difference." },
  { id: "cleanSheets", label: "Clean Sheets", emptyMessage: "No clean sheets recorded yet." },
  { id: "doublesPairs", label: "Doubles Pairs", emptyMessage: "Play a few doubles matches together to see this leaderboard." },
  { id: "monthly", label: "Monthly", emptyMessage: "No matches played in this month yet." },
];

const MATCH_TYPE_FILTERS: { id: MatchTypeFilter; label: string }[] = [
  { id: "overall", label: "Overall" },
  { id: "singles", label: "Singles" },
  { id: "doubles", label: "Doubles" },
];

const MONTH_LABEL = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });

export default function LeaderboardsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { currentGroup } = useGroup();
  const groupId = currentGroup?.id ?? null;

  const players = usePlayers(groupId);
  const matchHistory = useGroupMatchHistory(groupId);

  const [category, setCategory] = useState<Category>("elo");
  const [matchTypeFilter, setMatchTypeFilter] = useState<MatchTypeFilter>("overall");
  const [descending, setDescending] = useState(true);
  const [monthOffset, setMonthOffset] = useState(0);

  /** Animates the list reordering itself on a category/sort/filter switch instead of an abrupt jump. Separate from the per-row movement badges below, which flag an actual rank change within the same category since it was last shown. */
  const animateReorder = () => LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

  const roster = players.data ?? [];
  const matches = matchHistory.data ?? [];
  const myPlayerId = roster.find((p) => p.linked_user_id === user?.id)?.id ?? null;

  const filteredMatches: MatchSummary[] = useMemo(
    () => (matchTypeFilter === "overall" ? matches : matches.filter((m) => m.match_type === matchTypeFilter)),
    [matches, matchTypeFilter],
  );

  const monthTarget = useMemo(() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - monthOffset);
    return d;
  }, [monthOffset]);

  const rows: LeaderboardRow[] = useMemo(() => {
    switch (category) {
      case "elo":
        return computeEloLeaderboard(
          roster.map((p) => {
            const elo =
              matchTypeFilter === "singles"
                ? p.singles_elo
                : matchTypeFilter === "doubles"
                  ? p.doubles_elo
                  : Math.round((p.singles_elo + p.doubles_elo) / 2);
            return { id: p.id, displayName: p.display_name, avatarUrl: p.avatar_url, color: p.custom_color, elo };
          }),
        );
      case "winRate":
        return computeWinRateLeaderboard(roster, filteredMatches);
      case "mostMatches":
        return computeMostMatchesLeaderboard(roster, filteredMatches);
      case "winStreak":
        return computeLongestStreakLeaderboard(roster, filteredMatches);
      case "lossStreak":
        return computeLongestLossStreakLeaderboard(roster, filteredMatches);
      case "goalsScored":
        return computeGoalsScoredLeaderboard(roster, filteredMatches);
      case "goalsConceded":
        return computeFewestConcededLeaderboard(roster, filteredMatches);
      case "goalDifference":
        return computeGoalDifferenceLeaderboard(roster, filteredMatches);
      case "cleanSheets":
        return computeCleanSheetsLeaderboard(roster, filteredMatches);
      case "monthly":
        return computeMonthlyLeaderboard(roster, filteredMatches, monthTarget.getFullYear(), monthTarget.getMonth());
      case "doublesPairs":
        return [];
    }
  }, [category, roster, filteredMatches, matchTypeFilter, monthTarget]);

  /**
   * No historical rank-snapshot table exists, so "movement" can't reflect
   * real elapsed time -- instead, remember each category+filter's rank
   * order across renders (a match recorded, then a return to this screen;
   * pull-to-refresh; etc.) and flag a real change since last shown. Monthly
   * and doubles-pairs are excluded: month navigation changes the ranking
   * basis on every tap, so "movement" wouldn't mean anything there.
   */
  const previousRanksRef = useRef<Map<string, Map<string, number>>>(new Map());
  const [movement, setMovement] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    if (category === "monthly" || category === "doublesPairs") {
      setMovement(new Map());
      return;
    }
    const key = `${category}:${matchTypeFilter}`;
    const currentRanks = new Map(rows.map((row, index) => [row.playerId, index + 1]));
    const previousRanks = previousRanksRef.current.get(key);
    const deltas = new Map<string, number>();
    if (previousRanks) {
      for (const [playerId, position] of currentRanks) {
        const previousPosition = previousRanks.get(playerId);
        if (previousPosition !== undefined && previousPosition !== position) deltas.set(playerId, previousPosition - position);
      }
    }
    previousRanksRef.current.set(key, currentRanks);
    setMovement(deltas);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, matchTypeFilter, rows]);

  const doublesPairs = useMemo(() => (category === "doublesPairs" ? computeBestDoublesPairs(matches) : []), [category, matches]);

  const displayRows = descending ? rows : [...rows].reverse();
  const displayPairs = descending ? doublesPairs : [...doublesPairs].reverse();

  const isLoading = players.isLoading || matchHistory.isLoading;
  const isError = players.isError || matchHistory.isError;

  const handleRefresh = () => {
    players.refetch();
    matchHistory.refetch();
  };

  const isFutureMonth = monthOffset <= 0;
  const showMatchTypeFilter = category !== "doublesPairs";
  const activeCategory = CATEGORIES.find((c) => c.id === category)!;

  const getLeaderboardCsv = () => {
    if (category === "doublesPairs") {
      const pairRows: LeaderboardRow[] = displayPairs.map((pair) => ({
        playerId: pair.playerIds.join(":"),
        playerName: `${pair.playerNames[0]} & ${pair.playerNames[1]}`,
        avatarUrl: null,
        color: colors.accent,
        value: pair.winRate ?? 0,
        valueLabel: pair.winRate !== null ? `${Math.round(pair.winRate * 100)}%` : "-",
        detail: `${pair.wins}W-${pair.losses}L-${pair.draws}D`,
      }));
      return leaderboardToCsv(pairRows);
    }
    return leaderboardToCsv(displayRows);
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>Leaderboards</Text>
        <View style={styles.headerActions}>
          <ExportButton filename={`fc-rival-leaderboard-${category}.csv`} getCsv={getLeaderboardCsv} />
          <Pressable
            onPress={() => {
              animateReorder();
              setDescending((d) => !d);
            }}
            style={styles.sortButton}
            accessibilityRole="button"
            accessibilityLabel={descending ? "Sort ascending" : "Sort descending"}
          >
            <Ionicons name={descending ? "arrow-down" : "arrow-up"} size={16} color={colors.accent} />
            <Text style={styles.sortLabel}>{descending ? "Best first" : "Worst first"}</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {CATEGORIES.map((c) => (
          <Pressable
            key={c.id}
            onPress={() => {
              animateReorder();
              setCategory(c.id);
            }}
            style={[styles.chip, category === c.id && styles.chipActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: category === c.id }}
          >
            <Text style={[styles.chipLabel, category === c.id && styles.chipLabelActive]}>{c.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {showMatchTypeFilter ? (
        <View style={styles.subToggleRow}>
          <SegmentedControl
            options={MATCH_TYPE_FILTERS.map((f) => ({ value: f.id, label: f.label }))}
            value={matchTypeFilter}
            onChange={(v) => {
              animateReorder();
              setMatchTypeFilter(v);
            }}
          />
        </View>
      ) : null}

      {category === "monthly" ? (
        <View style={styles.monthNav}>
          <Pressable
            onPress={() => {
              animateReorder();
              setMonthOffset((m) => m + 1);
            }}
            accessibilityRole="button"
            accessibilityLabel="Previous month"
          >
            <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
          </Pressable>
          <Text style={styles.monthLabel}>{MONTH_LABEL.format(monthTarget)}</Text>
          <Pressable
            onPress={() => {
              if (isFutureMonth) return;
              animateReorder();
              setMonthOffset((m) => m - 1);
            }}
            disabled={isFutureMonth}
            accessibilityRole="button"
            accessibilityLabel="Next month"
          >
            <Ionicons name="chevron-forward" size={20} color={isFutureMonth ? colors.textMuted : colors.textPrimary} />
          </Pressable>
        </View>
      ) : null}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {isLoading ? (
          <SkeletonList count={5} />
        ) : isError ? (
          <ErrorState message="Couldn't load leaderboards." onRetry={handleRefresh} />
        ) : category === "doublesPairs" ? (
          displayPairs.length === 0 ? (
            <EmptyState icon="🤝" title="No doubles pairs yet" message={activeCategory.emptyMessage} />
          ) : (
            <View style={styles.list}>
              {displayPairs.map((pair, index) => (
                <Card key={pair.playerIds.join(":")} style={styles.pairCard} compact>
                  <Text style={styles.pairRank}>{index + 1}</Text>
                  <View style={styles.pairAvatars}>
                    <Avatar name={pair.playerNames[0]} size={32} />
                    <View style={styles.pairAvatarOverlap}>
                      <Avatar name={pair.playerNames[1]} size={32} />
                    </View>
                  </View>
                  <View style={styles.pairInfo}>
                    <Text style={styles.pairNames} numberOfLines={1}>
                      {pair.playerNames[0]} & {pair.playerNames[1]}
                    </Text>
                    <Text style={styles.pairRecord}>
                      {pair.wins}W-{pair.losses}L-{pair.draws}D
                    </Text>
                  </View>
                  <Text style={styles.pairWinRate}>{pair.winRate !== null ? `${Math.round(pair.winRate * 100)}%` : "–"}</Text>
                </Card>
              ))}
            </View>
          )
        ) : displayRows.length === 0 ? (
          <EmptyState icon="🏆" title="Not enough data yet" message={activeCategory.emptyMessage} />
        ) : (
          <>
            <FadeIn>
              <Podium
                entries={displayRows.slice(0, 3).map((row) => ({
                  playerId: row.playerId,
                  name: row.playerName,
                  avatarUrl: row.avatarUrl,
                  color: row.color,
                  valueLabel: row.valueLabel,
                }))}
                highlightedPlayerId={myPlayerId}
                onPressEntry={(playerId) => router.push(`/player/${playerId}`)}
              />
            </FadeIn>
            {displayRows.length > 3 ? (
              <View style={styles.list}>
                {displayRows.slice(3).map((row, index) => (
                  <RankingRow
                    key={row.playerId}
                    rank={index + 4}
                    name={row.playerName}
                    avatarUrl={row.avatarUrl}
                    color={row.color}
                    value={row.valueLabel}
                    detail={row.detail}
                    highlighted={row.playerId === myPlayerId}
                    movement={movement.get(row.playerId) ?? 0}
                    onPress={() => router.push(`/player/${row.playerId}`)}
                  />
                ))}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: spacing.sm,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  title: {
    ...typography.title,
  },
  sortButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sortLabel: {
    ...typography.small,
    color: colors.accent,
  },
  chipRow: {
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSubtle,
  },
  chipLabel: {
    ...typography.caption,
  },
  chipLabelActive: {
    color: colors.accent,
    fontWeight: "700",
  },
  subToggleRow: {
    paddingBottom: spacing.sm,
  },
  monthNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.lg,
    paddingBottom: spacing.sm,
  },
  monthLabel: {
    ...typography.bodyStrong,
    minWidth: 140,
    textAlign: "center",
  },
  content: {
    paddingBottom: spacing.xxl,
  },
  list: {
    gap: spacing.sm,
  },
  pairCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  pairRank: {
    ...typography.bodyStrong,
    color: colors.textSecondary,
    width: 20,
    textAlign: "center",
  },
  pairAvatars: {
    flexDirection: "row",
  },
  pairAvatarOverlap: {
    marginLeft: -12,
    borderWidth: 2,
    borderColor: colors.surface,
    borderRadius: radius.pill,
  },
  pairInfo: {
    flex: 1,
    gap: 2,
  },
  pairNames: {
    ...typography.bodyStrong,
  },
  pairRecord: {
    ...typography.small,
  },
  pairWinRate: {
    ...typography.heading,
    color: colors.accent,
  },
});
