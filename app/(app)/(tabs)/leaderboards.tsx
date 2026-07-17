import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Avatar } from "../../../src/components/Avatar";
import { Card } from "../../../src/components/Card";
import { EmptyState } from "../../../src/components/EmptyState";
import { ErrorState } from "../../../src/components/ErrorState";
import { ExportButton } from "../../../src/components/ExportButton";
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

const CATEGORIES: { id: Category; label: string }[] = [
  { id: "elo", label: "Elo" },
  { id: "winRate", label: "Win %" },
  { id: "mostMatches", label: "Most Matches" },
  { id: "winStreak", label: "Win Streak" },
  { id: "lossStreak", label: "Loss Streak" },
  { id: "goalsScored", label: "Goals Scored" },
  { id: "goalsConceded", label: "Goals Conceded" },
  { id: "goalDifference", label: "Goal Diff" },
  { id: "cleanSheets", label: "Clean Sheets" },
  { id: "doublesPairs", label: "Doubles Pairs" },
  { id: "monthly", label: "Monthly" },
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
            onPress={() => setDescending((d) => !d)}
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
            onPress={() => setCategory(c.id)}
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
            onChange={setMatchTypeFilter}
          />
        </View>
      ) : null}

      {category === "monthly" ? (
        <View style={styles.monthNav}>
          <Pressable onPress={() => setMonthOffset((m) => m + 1)} accessibilityRole="button" accessibilityLabel="Previous month">
            <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
          </Pressable>
          <Text style={styles.monthLabel}>{MONTH_LABEL.format(monthTarget)}</Text>
          <Pressable
            onPress={() => !isFutureMonth && setMonthOffset((m) => m - 1)}
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
            <EmptyState icon="🤝" title="No doubles pairs yet" message="Play a few doubles matches together to see this leaderboard." />
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
          <EmptyState
            icon="🏆"
            title="Not enough data yet"
            message="Play more matches to populate this leaderboard. Some categories need a minimum number of matches to keep rankings fair."
          />
        ) : (
          <View style={styles.list}>
            {displayRows.map((row, index) => (
              <RankingRow
                key={row.playerId}
                rank={index + 1}
                name={row.playerName}
                avatarUrl={row.avatarUrl}
                color={row.color}
                value={row.valueLabel}
                detail={row.detail}
                highlighted={row.playerId === myPlayerId}
                onPress={() => router.push(`/player/${row.playerId}`)}
              />
            ))}
          </View>
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
