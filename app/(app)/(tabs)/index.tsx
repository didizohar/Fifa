import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import type { ComponentProps, ReactNode } from "react";
import { useMemo } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { ActionButton } from "../../../src/components/ActionButton";
import { AnimatedNumber } from "../../../src/components/AnimatedNumber";
import { Avatar } from "../../../src/components/Avatar";
import { Badge, rankBadgeTone } from "../../../src/components/Badge";
import { BarChart } from "../../../src/components/BarChart";
import { Card } from "../../../src/components/Card";
import { EmptyState } from "../../../src/components/EmptyState";
import { ErrorState } from "../../../src/components/ErrorState";
import { FadeIn } from "../../../src/components/FadeIn";
import { FormStrip } from "../../../src/components/FormStrip";
import { MatchRow } from "../../../src/components/MatchRow";
import { RankingRow } from "../../../src/components/RankingRow";
import { Screen } from "../../../src/components/Screen";
import { SkeletonList } from "../../../src/components/Skeleton";
import { StatTile } from "../../../src/components/StatTile";
import { useAuth } from "../../../src/hooks/useAuth";
import { useGroup } from "../../../src/hooks/useGroup";
import { useGroupMatchHistory } from "../../../src/hooks/useMatches";
import { usePlayers } from "../../../src/hooks/usePlayers";
import { type DiscoveryItemType, selectHomeHighlights } from "../../../src/lib/discovery";
import { useTranslation } from "../../../src/lib/i18n";
import { selectInsightOfTheDay } from "../../../src/lib/leagueInsights";
import { computeLeagueSummary, computeMatchesPerWeek } from "../../../src/lib/leagueStats";
import { matchSideLabel, formatRelativeDate } from "../../../src/lib/format";
import {
  computeFormTrend,
  computeLastNStats,
  computePlayerStats,
  computeStreaks,
  computeWinRateLeaderboard,
  computeWinRateRank,
  WIN_RATE_MIN_PLAYED,
} from "../../../src/lib/stats";
import type { MatchSummary } from "../../../src/lib/matches";
import type { PlayerProfile } from "../../../src/lib/types/database";
import { colors, radius, spacing, typography } from "../../../src/theme";

const RANKINGS_PREVIEW = 5;
const MATCHES_PREVIEW = 5;
const TRENDING_PREVIEW = 5;
const HIGHLIGHTS_COUNT = 4;
const ACTIVITY_WEEKS = 8;

const DISCOVERY_ICON: Record<DiscoveryItemType, string> = { fact: "💡", insight: "📈", record: "🏆", memory: "📅" };

// Stable fallback references so `data ?? []` doesn't allocate a fresh empty
// array every render while a query is loading -- otherwise every memoized
// computation below (including the discovery engine) recomputes on every
// render instead of only when the data actually changes (see leaderboards.tsx).
const EMPTY_PLAYERS: PlayerProfile[] = [];
const EMPTY_MATCHES: MatchSummary[] = [];

export default function HomeScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { user } = useAuth();
  const { currentGroup } = useGroup();
  const groupId = currentGroup?.id ?? null;

  const players = usePlayers(groupId);
  const fullHistory = useGroupMatchHistory(groupId);

  const isLoading = players.isLoading || fullHistory.isLoading;
  const isError = players.isError || fullHistory.isError;
  const isRefetching = players.isRefetching || fullHistory.isRefetching;

  const roster = players.data ?? EMPTY_PLAYERS;
  // useGroupMatchHistory is already sorted played_at desc, same order fetchRecentMatches
  // would use -- deriving the preview from it instead of a second capped query avoids an
  // entirely redundant network round-trip for data we're already fetching in full.
  const allMatches = fullHistory.data ?? EMPTY_MATCHES;
  const recentMatches = allMatches.slice(0, MATCHES_PREVIEW);
  const latestMatch = allMatches[0] ?? null;
  const myPlayer = roster.find((p) => p.linked_user_id === user?.id) ?? null;

  const myStreak = useMemo(() => (myPlayer ? computeStreaks(myPlayer.id, allMatches) : null), [myPlayer, allMatches]);
  const myForm = useMemo(() => (myPlayer ? computeLastNStats(myPlayer.id, allMatches, 5) : null), [myPlayer, allMatches]);
  const myStats = useMemo(() => (myPlayer ? computePlayerStats(myPlayer.id, allMatches) : null), [myPlayer, allMatches]);
  const myRank = useMemo(() => (myPlayer ? computeWinRateRank(myPlayer.id, roster, allMatches) : null), [myPlayer, roster, allMatches]);
  const winRateLeaders = useMemo(() => computeWinRateLeaderboard(roster, allMatches), [roster, allMatches]);
  const leagueSummary = useMemo(() => computeLeagueSummary(roster, allMatches), [roster, allMatches]);
  const weeklyActivity = useMemo(
    () => computeMatchesPerWeek(allMatches, new Date(), ACTIVITY_WEEKS),
    // "now" is intentionally the only non-listed input -- week buckets only need to shift when a new
    // calendar week starts, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allMatches],
  );

  const trendingPlayers = useMemo(() => {
    return roster
      .map((player) => ({ player, formTrend: computeFormTrend(player.id, allMatches) }))
      .filter((r): r is typeof r & { formTrend: { trend: "improving" | "declining"; recentWinRate: number; previousWinRate: number } } => r.formTrend.trend === "improving" || r.formTrend.trend === "declining")
      .map((r) => ({
        player: r.player,
        trend: r.formTrend.trend,
        delta: r.formTrend.recentWinRate - r.formTrend.previousWinRate,
        recentWinRate: r.formTrend.recentWinRate,
      }))
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, TRENDING_PREVIEW);
  }, [roster, allMatches]);

  const insightOfTheDay = useMemo(
    () => selectInsightOfTheDay(roster, allMatches, new Date()),
    // Same day-stable rationale as highlights below -- only rotates once per calendar day.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [roster, allMatches],
  );

  const highlights = useMemo(() => {
    if (!myPlayer) return [];
    return selectHomeHighlights(myPlayer.id, roster, allMatches, new Date(), HIGHLIGHTS_COUNT);
    // "now" is intentionally the only non-listed input -- highlights only need to rotate day to day, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myPlayer, roster, allMatches]);

  const handleRefresh = () => {
    players.refetch();
    fullHistory.refetch();
  };

  return (
    <Screen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl tintColor={colors.accent} refreshing={isRefetching} onRefresh={handleRefresh} />}
      >
        <FadeIn>
        <LinearGradient colors={[colors.surfaceElevated, colors.surface]} style={styles.hero}>
          {myPlayer ? (
            <>
              <View style={styles.heroTop}>
                <Avatar uri={myPlayer.avatar_url} name={myPlayer.display_name} color={myPlayer.custom_color} size={56} />
                <View style={styles.heroInfo}>
                  <Text style={styles.heroGreeting}>{currentGroup?.name}</Text>
                  <Text style={styles.heroName}>{t("home.greeting", { name: myPlayer.display_name })}</Text>
                </View>
                <Badge label={myRank ? `#${myRank.position} of ${myRank.of}` : "Not yet qualified"} tone={rankBadgeTone(myRank?.position ?? null)} />
              </View>
              <View style={styles.heroStatsRow}>
                <View style={styles.heroStat}>
                  <Text style={styles.heroEyebrow}>{t("home.winRate")}</Text>
                  <View style={styles.heroValueRow}>
                    <AnimatedNumber
                      value={myStats?.winRate !== null && myStats?.winRate !== undefined ? Math.round(myStats.winRate * 100) : 0}
                      style={styles.heroValue}
                    />
                    <Text style={styles.heroValue}>%</Text>
                  </View>
                </View>
                <View style={styles.heroStat}>
                  <Text style={styles.heroEyebrow}>{t("home.streak")}</Text>
                  <Text style={styles.heroValue}>
                    {myStreak && myStreak.currentStreak.count > 0
                      ? `${myStreak.currentStreak.count} ${myStreak.currentStreak.result}`
                      : "—"}
                  </Text>
                </View>
                {myForm ? (
                  <View style={styles.heroStat}>
                    <Text style={styles.heroEyebrow}>{t("home.recentForm")}</Text>
                    <FormStrip results={myForm.form.map((f) => f.result)} />
                  </View>
                ) : null}
              </View>
            </>
          ) : (
            <View>
              <Text style={styles.greeting}>{currentGroup?.name}</Text>
              <Text style={styles.subtitle}>{t("home.dashboard")}</Text>
            </View>
          )}
        </LinearGradient>
        </FadeIn>

        {highlights.length > 0 ? (
          <FadeIn>
            <View style={styles.highlightsSection}>
              <Text style={styles.highlightsTitle}>{t("home.didYouKnow")}</Text>
              {highlights.map((item) => (
                <View key={item.id} style={styles.highlightCardRow}>
                  <Text style={styles.highlightIcon}>{DISCOVERY_ICON[item.type]}</Text>
                  <Text style={styles.highlightText}>{item.text}</Text>
                </View>
              ))}
            </View>
          </FadeIn>
        ) : null}

        <View style={styles.quickActions}>
          <ActionButton icon="add-circle" label={t("home.quickActionRecord")} onPress={() => router.push("/record-match")} />
          <ActionButton icon="shuffle" label={t("home.quickActionDraw")} onPress={() => router.push("/draw")} />
          <ActionButton icon="people" label={t("home.quickActionPlayers")} onPress={() => router.push("/players")} />
          <ActionButton icon="trophy" label={t("home.quickActionLeaderboards")} onPress={() => router.push("/leaderboards")} />
          <ActionButton icon="shield-checkmark" label={t("home.quickActionLeagueManagement")} onPress={() => router.push("/league-management")} />
        </View>

        {isLoading ? (
          <SkeletonList count={4} />
        ) : isError ? (
          <ErrorState message="Couldn't load your dashboard. Check your connection and try again." onRetry={handleRefresh} />
        ) : (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t("home.leagueSummary")}</Text>
              <View style={styles.statTileRow}>
                <StatTile label={t("home.statMatchesPlayed")} value={leagueSummary.matchesPlayed} />
                <StatTile label={t("home.statGoals")} value={leagueSummary.totalGoals} />
                <StatTile label={t("home.statPlayers")} value={leagueSummary.playersCount} />
                <StatTile label={t("home.statCurrentLeader")} value={leagueSummary.currentLeader?.playerName ?? t("home.noLeaderYet")} />
              </View>
            </View>

            {latestMatch ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t("home.latestMatch")}</Text>
                <MatchRow
                  matchType={latestMatch.match_type}
                  isPenalties={latestMatch.is_penalties}
                  playedAtLabel={formatRelativeDate(latestMatch.played_at)}
                  side1={{
                    label: matchSideLabel(latestMatch.sides[0].players.map((p) => p.display_name)),
                    clubName: latestMatch.sides[0].club?.name ?? "Unknown club",
                    score: latestMatch.sides[0].score,
                    result: latestMatch.sides[0].result,
                  }}
                  side2={{
                    label: matchSideLabel(latestMatch.sides[1].players.map((p) => p.display_name)),
                    clubName: latestMatch.sides[1].club?.name ?? "Unknown club",
                    score: latestMatch.sides[1].score,
                    result: latestMatch.sides[1].result,
                  }}
                  onPress={() => router.push(`/match/${latestMatch.id}`)}
                />
              </View>
            ) : null}

            <Section
              title={t("home.trendingPlayers")}
              seeAllLabel={t("home.seeAll")}
              onSeeAll={() => router.push("/leaderboards")}
              isEmpty={trendingPlayers.length === 0}
              emptyProps={{ icon: "📈", title: t("home.notEnoughTrendData") }}
            >
              {trendingPlayers.map((row, index) => (
                <RankingRow
                  key={row.player.id}
                  rank={index + 1}
                  name={row.player.display_name}
                  avatarUrl={row.player.avatar_url}
                  color={row.player.custom_color}
                  value={`${Math.round(row.recentWinRate * 100)}%`}
                  detail={row.trend === "improving" ? t("home.rising") : t("home.falling")}
                  movement={Math.round(row.delta * 100)}
                  onPress={() => router.push(`/player/${row.player.id}`)}
                />
              ))}
            </Section>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t("home.insightOfTheDay")}</Text>
              <Card compact style={styles.insightCard}>
                <Text style={styles.insightIcon}>💡</Text>
                <Text style={styles.insightText}>{insightOfTheDay?.text ?? t("home.noInsightYet")}</Text>
              </Card>
            </View>

            <Section
              title={t("home.topPlayers")}
              seeAllLabel={t("home.seeAll")}
              onSeeAll={() => router.push("/leaderboards")}
              isEmpty={winRateLeaders.length === 0}
              emptyProps={
                roster.length === 0
                  ? {
                      icon: "🏆",
                      title: t("home.noRankingsTitle"),
                      message: t("home.noRankingsMessage"),
                      actionLabel: t("common.addPlayer"),
                      onAction: () => router.push("/player/new"),
                    }
                  : {
                      icon: "🏆",
                      title: t("home.notEnoughMatchesTitle"),
                      message: t("home.notEnoughMatchesMessage", { count: String(WIN_RATE_MIN_PLAYED) }),
                      actionLabel: t("home.recordAMatch"),
                      onAction: () => router.push("/record-match"),
                    }
              }
            >
              {winRateLeaders.slice(0, RANKINGS_PREVIEW).map((row, index) => (
                <RankingRow
                  key={row.playerId}
                  rank={index + 1}
                  name={row.playerName}
                  avatarUrl={row.avatarUrl}
                  color={row.color}
                  value={row.valueLabel}
                  detail={row.detail}
                  onPress={() => router.push(`/player/${row.playerId}`)}
                />
              ))}
            </Section>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t("home.activity")}</Text>
              <Card compact style={styles.activityCard}>
                <Text style={styles.activityCaption}>{t("home.matchesPerWeek")}</Text>
                <BarChart rows={weeklyActivity.map((w) => ({ label: w.weekLabel, value: w.count, valueLabel: String(w.count) }))} />
              </Card>
            </View>

            <Section
              title={t("home.recentMatches")}
              seeAllLabel={t("home.seeAll")}
              onSeeAll={() => router.push("/history")}
              isEmpty={recentMatches.length === 0}
              emptyProps={{
                icon: "⚽️",
                title: t("home.noMatchesTitle"),
                message: t("home.noMatchesMessage"),
                actionLabel: t("common.recordMatch"),
                onAction: () => router.push("/record-match"),
              }}
            >
              {recentMatches.map((match) => {
                const [s1, s2] = match.sides;
                return (
                  <MatchRow
                    key={match.id}
                    matchType={match.match_type}
                    isPenalties={match.is_penalties}
                    playedAtLabel={formatRelativeDate(match.played_at)}
                    side1={{
                      label: matchSideLabel(s1.players.map((p) => p.display_name)),
                      clubName: s1.club?.name ?? "Unknown club",
                      score: s1.score,
                      result: s1.result,
                    }}
                    side2={{
                      label: matchSideLabel(s2.players.map((p) => p.display_name)),
                      clubName: s2.club?.name ?? "Unknown club",
                      score: s2.score,
                      result: s2.result,
                    }}
                    onPress={() => router.push(`/match/${match.id}`)}
                  />
                );
              })}
            </Section>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function Section({
  title,
  seeAllLabel,
  onSeeAll,
  isEmpty,
  emptyProps,
  children,
}: {
  title: string;
  seeAllLabel: string;
  onSeeAll: () => void;
  isEmpty: boolean;
  emptyProps: ComponentProps<typeof EmptyState>;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {!isEmpty ? (
          <Text style={styles.seeAll} onPress={onSeeAll}>
            {seeAllLabel}
          </Text>
        ) : null}
      </View>
      {isEmpty ? <EmptyState {...emptyProps} /> : <View style={styles.sectionList}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.lg,
    paddingVertical: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  hero: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing.lg,
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  heroInfo: {
    flex: 1,
    gap: 2,
  },
  heroGreeting: {
    ...typography.caption,
  },
  heroName: {
    ...typography.title,
  },
  heroStatsRow: {
    flexDirection: "row",
    gap: spacing.xl,
    marginTop: spacing.lg,
  },
  heroStat: {
    gap: spacing.xs,
  },
  heroEyebrow: {
    ...typography.eyebrow,
  },
  heroValue: {
    ...typography.display,
    fontSize: 24,
  },
  heroValueRow: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  greeting: {
    ...typography.title,
  },
  subtitle: {
    ...typography.caption,
  },
  highlightsSection: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surface,
  },
  highlightsTitle: {
    ...typography.heading,
  },
  highlightCardRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  highlightIcon: {
    fontSize: 18,
    lineHeight: 20,
  },
  highlightText: {
    ...typography.body,
    flex: 1,
    flexShrink: 1,
  },
  quickActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  statTileRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  insightCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  insightIcon: {
    fontSize: 18,
    lineHeight: 20,
  },
  insightText: {
    ...typography.body,
    flex: 1,
    flexShrink: 1,
  },
  activityCard: {
    gap: spacing.sm,
  },
  activityCaption: {
    ...typography.small,
    color: colors.textSecondary,
  },
  section: {
    gap: spacing.sm,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionTitle: {
    ...typography.heading,
  },
  seeAll: {
    ...typography.caption,
    color: colors.accent,
    fontWeight: "600",
  },
  sectionList: {
    gap: spacing.sm,
  },
});
