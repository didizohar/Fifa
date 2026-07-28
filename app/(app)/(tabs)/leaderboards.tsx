import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { LayoutAnimation, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Avatar } from "../../../src/components/Avatar";
import { Card } from "../../../src/components/Card";
import { Chevron } from "../../../src/components/Chevron";
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
import { useTranslation } from "../../../src/lib/i18n";
import type { MatchSummary } from "../../../src/lib/matches";
import { computeMonthlyReport } from "../../../src/lib/monthlyReport";
import { formatMonthlyReport } from "../../../src/lib/monthlyReportFormat";
import type { PlayerProfile } from "../../../src/lib/types/database";
import {
  computeBestDoublesPairs,
  computeCleanSheetsLeaderboard,
  computeFewestConcededLeaderboard,
  computeGoalDifferenceLeaderboard,
  computeGoalsScoredLeaderboard,
  computeLongestLossStreakLeaderboard,
  computeLongestStreakLeaderboard,
  computeMonthlyLeaderboard,
  computeMostMatchesLeaderboard,
  computeNotYetQualified,
  computeWinRateLeaderboard,
  WIN_RATE_MIN_PLAYED,
  type LeaderboardRow,
} from "../../../src/lib/stats";
import { colors, radius, spacing, typography } from "../../../src/theme";

type Category =
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

const CATEGORY_DEFS: { id: Category; labelKey: string; emptyMessageKey: string }[] = [
  { id: "winRate", labelKey: "leaderboards.categoryWinRate", emptyMessageKey: "leaderboards.emptyWinRate" },
  { id: "mostMatches", labelKey: "leaderboards.categoryMostMatches", emptyMessageKey: "leaderboards.emptyMostMatches" },
  { id: "winStreak", labelKey: "leaderboards.categoryWinStreak", emptyMessageKey: "leaderboards.emptyWinStreak" },
  { id: "lossStreak", labelKey: "leaderboards.categoryLossStreak", emptyMessageKey: "leaderboards.emptyLossStreak" },
  { id: "goalsScored", labelKey: "leaderboards.categoryGoalsScored", emptyMessageKey: "leaderboards.emptyGoalsScored" },
  { id: "goalsConceded", labelKey: "leaderboards.categoryGoalsConceded", emptyMessageKey: "leaderboards.emptyGoalsConceded" },
  { id: "goalDifference", labelKey: "leaderboards.categoryGoalDifference", emptyMessageKey: "leaderboards.emptyGoalDifference" },
  { id: "cleanSheets", labelKey: "leaderboards.categoryCleanSheets", emptyMessageKey: "leaderboards.emptyCleanSheets" },
  { id: "doublesPairs", labelKey: "leaderboards.categoryDoublesPairs", emptyMessageKey: "leaderboards.emptyDoublesPairs" },
  { id: "monthly", labelKey: "leaderboards.categoryMonthly", emptyMessageKey: "leaderboards.emptyMonthly" },
];

const MATCH_TYPE_FILTER_DEFS: { id: MatchTypeFilter; labelKey: string }[] = [
  { id: "overall", labelKey: "leaderboards.filterOverall" },
  { id: "singles", labelKey: "leaderboards.filterSingles" },
  { id: "doubles", labelKey: "leaderboards.filterDoubles" },
];

// Stable references for the "query hasn't resolved yet" fallback -- `data ?? []`
// would otherwise allocate a fresh empty array every render while loading,
// which cascades into rows recomputing every render too. Same pattern as
// EMPTY_MATCHES in the player profile screen.
const EMPTY_PLAYERS: PlayerProfile[] = [];
const EMPTY_MATCHES: MatchSummary[] = [];

export default function LeaderboardsScreen() {
  const router = useRouter();
  const { t, locale } = useTranslation();
  const { user } = useAuth();
  const { currentGroup } = useGroup();
  const groupId = currentGroup?.id ?? null;

  const categories = useMemo(
    () => CATEGORY_DEFS.map((c) => ({ id: c.id, label: t(c.labelKey), emptyMessage: t(c.emptyMessageKey, { count: WIN_RATE_MIN_PLAYED }) })),
    [t],
  );
  const matchTypeFilters = useMemo(() => MATCH_TYPE_FILTER_DEFS.map((f) => ({ id: f.id, label: t(f.labelKey) })), [t]);

  const players = usePlayers(groupId);
  const matchHistory = useGroupMatchHistory(groupId);

  const [category, setCategory] = useState<Category>("winRate");
  const [matchTypeFilter, setMatchTypeFilter] = useState<MatchTypeFilter>("overall");
  const [descending, setDescending] = useState(true);
  const [monthOffset, setMonthOffset] = useState(0);

  /** Animates the list reordering itself on a category/sort/filter switch instead of an abrupt jump. Separate from the per-row movement badges below, which flag an actual rank change within the same category since it was last shown. */
  const animateReorder = () => LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

  const roster = players.data ?? EMPTY_PLAYERS;
  const matches = matchHistory.data ?? EMPTY_MATCHES;
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

  // Pure derivation: reads rows (this render) + previousRanksRef (last committed
  // render) and computes movement. No setState here, so this can never loop --
  // recomputing on an extra render is just a wasted (cheap) calculation, not a
  // scheduled re-render.
  const movement = useMemo(() => {
    if (category === "monthly" || category === "doublesPairs") return new Map<string, number>();

    const key = `${category}:${matchTypeFilter}`;
    const previousRanks = previousRanksRef.current.get(key);
    const deltas = new Map<string, number>();
    if (previousRanks) {
      rows.forEach((row, index) => {
        const position = index + 1;
        const previousPosition = previousRanks.get(row.playerId);
        if (previousPosition !== undefined && previousPosition !== position) deltas.set(row.playerId, previousPosition - position);
      });
    }
    return deltas;
  }, [category, matchTypeFilter, rows]);

  // Side effect only: records this render's ranks for next time. Mutating a ref
  // doesn't trigger a re-render, so this is safe even while rows is still settling.
  useEffect(() => {
    if (category === "monthly" || category === "doublesPairs") return;
    const key = `${category}:${matchTypeFilter}`;
    const currentRanks = new Map(rows.map((row, index) => [row.playerId, index + 1]));
    previousRanksRef.current.set(key, currentRanks);
  }, [category, matchTypeFilter, rows]);

  const doublesPairs = useMemo(() => (category === "doublesPairs" ? computeBestDoublesPairs(matches) : []), [category, matches]);
  const notYetQualified = useMemo(
    () => (category === "winRate" ? computeNotYetQualified(roster, filteredMatches) : []),
    [category, roster, filteredMatches],
  );
  const monthlyReport = useMemo(
    () => (category === "monthly" ? computeMonthlyReport(roster, matches, monthTarget.getFullYear(), monthTarget.getMonth()) : null),
    [category, roster, matches, monthTarget],
  );
  const formattedMonthlyReport = useMemo(
    () => (monthlyReport ? formatMonthlyReport(monthlyReport, t, locale) : null),
    [monthlyReport, t, locale],
  );

  const displayRows = useMemo(() => (descending ? rows : [...rows].reverse()), [rows, descending]);
  const displayPairs = useMemo(() => (descending ? doublesPairs : [...doublesPairs].reverse()), [doublesPairs, descending]);
  const podiumEntries = useMemo(
    () => displayRows.slice(0, 3).map((row) => ({ playerId: row.playerId, name: row.playerName, avatarUrl: row.avatarUrl, color: row.color, valueLabel: row.valueLabel })),
    [displayRows],
  );

  const isLoading = players.isLoading || matchHistory.isLoading;
  const isError = players.isError || matchHistory.isError;

  const handleRefresh = () => {
    players.refetch();
    matchHistory.refetch();
  };

  const isFutureMonth = monthOffset <= 0;
  const showMatchTypeFilter = category !== "doublesPairs";
  const activeCategory = categories.find((c) => c.id === category)!;

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
        <Text style={styles.title}>{t("leaderboards.title")}</Text>
        <View style={styles.headerActions}>
          <ExportButton filename={`fc-rival-leaderboard-${category}.csv`} getCsv={getLeaderboardCsv} />
          <Pressable
            onPress={() => {
              animateReorder();
              setDescending((d) => !d);
            }}
            style={styles.sortButton}
            accessibilityRole="button"
            accessibilityLabel={descending ? t("leaderboards.sortAscending") : t("leaderboards.sortDescending")}
          >
            <Ionicons name={descending ? "arrow-down" : "arrow-up"} size={16} color={colors.accent} />
            <Text style={styles.sortLabel}>{descending ? t("leaderboards.bestFirst") : t("leaderboards.worstFirst")}</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {categories.map((c) => (
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
            options={matchTypeFilters.map((f) => ({ value: f.id, label: f.label }))}
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
            accessibilityLabel={t("leaderboards.previousMonth")}
          >
            <Chevron direction="back" size={20} color={colors.textPrimary} />
          </Pressable>
          <Text style={styles.monthLabel}>{formattedMonthlyReport?.monthLabel}</Text>
          <Pressable
            onPress={() => {
              if (isFutureMonth) return;
              animateReorder();
              setMonthOffset((m) => m - 1);
            }}
            disabled={isFutureMonth}
            accessibilityRole="button"
            accessibilityLabel={t("leaderboards.nextMonth")}
          >
            <Chevron direction="forward" size={20} color={isFutureMonth ? colors.textMuted : colors.textPrimary} />
          </Pressable>
        </View>
      ) : null}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {formattedMonthlyReport && !isLoading && !isError ? (
          <Card style={styles.monthlyReportCard}>
            <Text style={styles.monthlyReportStory}>{formattedMonthlyReport.story}</Text>
            {formattedMonthlyReport.awards.length > 0 ? (
              <View style={styles.monthlyAwardsList}>
                {formattedMonthlyReport.awards.map((award) => (
                  <View key={award.id} style={styles.monthlyAwardRow}>
                    <Text style={styles.monthlyAwardLabel}>{award.label}</Text>
                    <Text style={styles.monthlyAwardValue} numberOfLines={1}>
                      {award.holderName} · {award.valueLabel}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </Card>
        ) : null}

        {isLoading ? (
          <SkeletonList count={5} />
        ) : isError ? (
          <ErrorState message={t("leaderboards.loadError")} onRetry={handleRefresh} />
        ) : category === "doublesPairs" ? (
          displayPairs.length === 0 ? (
            <EmptyState
              icon="🤝"
              title={t("leaderboards.noDoublesPairsTitle")}
              message={activeCategory.emptyMessage}
              actionLabel={t("home.recordAMatch")}
              onAction={() => router.push("/record-match")}
            />
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
            title={t("leaderboards.notEnoughDataTitle")}
            message={activeCategory.emptyMessage}
            actionLabel={t("home.recordAMatch")}
            onAction={() => router.push("/record-match")}
          />
        ) : (
          <>
            <FadeIn>
              <Podium entries={podiumEntries} highlightedPlayerId={myPlayerId} onPressEntry={(playerId) => router.push(`/player/${playerId}`)} />
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
            {category === "winRate" && notYetQualified.length > 0 ? (
              <View style={styles.notQualifiedSection}>
                <Text style={styles.notQualifiedTitle}>{t("leaderboards.notYetQualifiedTitle")}</Text>
                <Text style={styles.notQualifiedSubtitle}>{t("leaderboards.notYetQualifiedSubtitle", { count: WIN_RATE_MIN_PLAYED })}</Text>
                <View style={styles.list}>
                  {notYetQualified.map((row) => (
                    <Card key={row.playerId} compact style={styles.notQualifiedRow}>
                      <Avatar uri={row.avatarUrl} name={row.playerName} color={row.color} size={32} />
                      <Text style={styles.notQualifiedName} numberOfLines={1}>
                        {row.playerName}
                      </Text>
                      <Text style={styles.notQualifiedDetail}>
                        {t("leaderboards.playedToGo", { played: row.played, total: WIN_RATE_MIN_PLAYED, remaining: row.matchesRemaining })}
                      </Text>
                    </Card>
                  ))}
                </View>
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
    marginStart: -12,
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
  notQualifiedSection: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  notQualifiedTitle: {
    ...typography.heading,
  },
  notQualifiedSubtitle: {
    ...typography.small,
    marginBottom: spacing.xs,
  },
  notQualifiedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  notQualifiedName: {
    ...typography.body,
    flex: 1,
  },
  notQualifiedDetail: {
    ...typography.small,
  },
  monthlyReportCard: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  monthlyReportStory: {
    ...typography.body,
  },
  monthlyAwardsList: {
    gap: spacing.xs,
  },
  monthlyAwardRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  monthlyAwardLabel: {
    ...typography.small,
    color: colors.textSecondary,
  },
  monthlyAwardValue: {
    ...typography.small,
    fontWeight: "700",
    flexShrink: 1,
    // "auto" (not a hardcoded "right") aligns to the text's own detected
    // script direction, so this reads correctly in both English and Hebrew.
    textAlign: "auto",
  },
});
