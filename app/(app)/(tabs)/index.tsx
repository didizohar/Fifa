import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import type { ComponentProps, ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { AnimatedNumber } from "../../../src/components/AnimatedNumber";
import { Avatar } from "../../../src/components/Avatar";
import { Badge, rankBadgeTone } from "../../../src/components/Badge";
import { Card } from "../../../src/components/Card";
import { EmptyState } from "../../../src/components/EmptyState";
import { ErrorState } from "../../../src/components/ErrorState";
import { FadeIn } from "../../../src/components/FadeIn";
import { FormStrip } from "../../../src/components/FormStrip";
import { LeagueTableCard, type LeagueTableCardPeriod } from "../../../src/components/LeagueTableCard";
import { MatchRow } from "../../../src/components/MatchRow";
import { QuickActionCard } from "../../../src/components/QuickActionCard";
import { QuickClubDrawCard } from "../../../src/components/QuickClubDrawCard";
import { QuickMatchCard } from "../../../src/components/QuickMatchCard";
import { RankingRow } from "../../../src/components/RankingRow";
import { Screen } from "../../../src/components/Screen";
import { SkeletonList } from "../../../src/components/Skeleton";
import { StatTile } from "../../../src/components/StatTile";
import { TrendBadge } from "../../../src/components/TrendBadge";
import { WinRateBreakdown } from "../../../src/components/WinRateBreakdown";
import { useAuth } from "../../../src/hooks/useAuth";
import { useFocusFrozenValue } from "../../../src/hooks/useFocusFrozenValue";
import { useGroup } from "../../../src/hooks/useGroup";
import { useLeagueTableCardPreference } from "../../../src/hooks/useLeagueTableCardPreference";
import { useGroupMatchHistory } from "../../../src/hooks/useMatches";
import { usePlayers } from "../../../src/hooks/usePlayers";
import { useSeasons } from "../../../src/hooks/useSeasons";
import { type DiscoveryItemType, selectHomeHighlights } from "../../../src/lib/discovery";
import { useTranslation } from "../../../src/lib/i18n";
import { computeIndividualStandings } from "../../../src/lib/leagueStandings";
import { selectInsightOfTheDay } from "../../../src/lib/leagueInsights";
import { computeLeagueSummary } from "../../../src/lib/leagueStats";
import { matchSideLabel, formatRelativeDate, formatStreakLabel } from "../../../src/lib/format";
import { describeMetricChange, metricChangeTone } from "../../../src/lib/metricPresentation";
import { computeLastNStats, computePlayerStats, computeStreaks, computeWinRateRank } from "../../../src/lib/stats";
import { explainActivity, explainConsistency, explainDirection, explainMomentum, type TrendExplanation } from "../../../src/lib/trends/explanations";
import { calculateLeagueTrendSummary } from "../../../src/lib/trends/leagueTrends";
import type { PlayerTrendMetrics } from "../../../src/lib/trends/types";
import type { MatchSummary } from "../../../src/lib/matches";
import type { PlayerProfile } from "../../../src/lib/types/database";
import type { ThemeColors } from "../../../src/theme/colors";
import { useTheme, type ThemeValue } from "../../../src/theme/ThemeContext";

const RECENT_ACTIVITY_COUNT = 3;

/** Same calendar day as `now`, in the device's local timezone -- the grounded, no-schema-change reading of "Tonight's Standings": there's no session_id FK linking matches to a Winners Stay session (session state is ephemeral JSONB, not a persisted grouping), so calendar-day is the closest honest proxy for "this evening's matches" the existing data model supports. */
function isSameLocalDay(isoA: string, isoB: Date): boolean {
  const a = new Date(isoA);
  return a.getFullYear() === isoB.getFullYear() && a.getMonth() === isoB.getMonth() && a.getDate() === isoB.getDate();
}

const TRENDING_PREVIEW = 3;
const HIGHLIGHTS_COUNT = 4;

const DISCOVERY_ICON: Record<DiscoveryItemType, string> = { fact: "💡", insight: "📈", record: "🏆", memory: "📅" };

// Stable fallback references so `data ?? []` doesn't allocate a fresh empty
// array every render while a query is loading -- otherwise every memoized
// computation below (including the discovery engine) recomputes on every
// render instead of only when the data actually changes (see leaderboards.tsx).
const EMPTY_PLAYERS: PlayerProfile[] = [];
const EMPTY_MATCHES: MatchSummary[] = [];

export default function HomeScreen() {
  const router = useRouter();
  // Stable reference shared by every LeagueTableCard row -- router itself
  // is a stable object from expo-router, so this callback identity never
  // changes, letting the memoized row component actually skip
  // re-rendering on unrelated state changes instead of every caller
  // inline-binding a fresh closure per row per render.
  const handlePressPlayer = useCallback((playerId: string) => router.push(`/player/${playerId}`), [router]);
  const { t } = useTranslation();
  const { colors, radius, spacing, typography } = useTheme();
  const styles = useDashboardStyles(colors, radius, spacing, typography);
  const { user } = useAuth();
  const { currentGroup } = useGroup();
  const groupId = currentGroup?.id ?? null;

  const players = usePlayers(groupId);
  const fullHistory = useGroupMatchHistory(groupId);
  const seasonsQuery = useSeasons(groupId);
  const activeSeason = (seasonsQuery.data ?? []).find((s) => s.is_active) ?? null;
  const { expanded: leagueTableExpanded, setExpanded: setLeagueTableExpanded } = useLeagueTableCardPreference(groupId);
  const [leagueTablePeriod, setLeagueTablePeriod] = useState<LeagueTableCardPeriod>("activeSeason");

  const isLoading = players.isLoading || fullHistory.isLoading;
  const isError = players.isError || fullHistory.isError;
  const isRefetching = players.isRefetching || fullHistory.isRefetching;

  // Frozen while this tab is buried under a pushed screen (Record Match,
  // Winners Stay, ...) -- (tabs) never unmounts just because something was
  // pushed on top of it, so without this, every match saved anywhere in the
  // app (which invalidates group match history) would re-run this whole
  // screen's trend/insight/discovery computations in the background, on
  // every save, competing with whatever the user is actually doing on the
  // visible screen. See useFocusFrozenValue for the full rationale.
  const roster = useFocusFrozenValue(players.data ?? EMPTY_PLAYERS);
  const allMatches = useFocusFrozenValue(fullHistory.data ?? EMPTY_MATCHES);
  const latestMatch = allMatches[0] ?? null;
  const myPlayer = roster.find((p) => p.linked_user_id === user?.id) ?? null;

  const myStreak = useMemo(() => (myPlayer ? computeStreaks(myPlayer.id, allMatches) : null), [myPlayer, allMatches]);
  const myForm = useMemo(() => (myPlayer ? computeLastNStats(myPlayer.id, allMatches, 5) : null), [myPlayer, allMatches]);
  const myStats = useMemo(() => (myPlayer ? computePlayerStats(myPlayer.id, allMatches) : null), [myPlayer, allMatches]);
  const myRank = useMemo(() => (myPlayer ? computeWinRateRank(myPlayer.id, roster, allMatches) : null), [myPlayer, roster, allMatches]);
  const leagueSummary = useMemo(() => computeLeagueSummary(roster, allMatches), [roster, allMatches]);

  // "Tonight's Standings" -- see isSameLocalDay's own comment for why
  // calendar-day (not a literal session grouping, which the data model has
  // no FK for) is what this is grounded in.
  const tonightsStandings = useMemo(() => {
    const now = new Date();
    const tonightsMatches = allMatches.filter((m) => isSameLocalDay(m.played_at, now));
    return computeIndividualStandings(roster, tonightsMatches).map((row) => ({
      ...row,
      form: computeLastNStats(row.id, tonightsMatches, 3).form.map((f) => f.result),
    }));
    // "now" intentionally not listed -- same day-stable rationale as insightOfTheDay/highlights below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roster, allMatches]);

  // Stage 7 M4 trends engine -- every dashboard trend card below reads
  // straight from this one memoized summary, never recalculating stats itself.
  const leagueTrendSummary = useMemo(
    () => calculateLeagueTrendSummary(roster, allMatches, new Date()),
    // "now" is intentionally the only non-listed input, same rationale as insightOfTheDay below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [roster, allMatches],
  );

  const trendCards = useMemo(() => {
    const rosterById = new Map(roster.map((p) => [p.id, p]));
    const configs: {
      key: string;
      titleKey: string;
      trend: PlayerTrendMetrics | null;
      score: number;
      explanation: TrendExplanation;
    }[] = [
      { key: "hot", titleKey: "trends.hotPlayerTitle", trend: leagueTrendSummary.hotPlayer, score: leagueTrendSummary.hotPlayer?.momentumScore ?? 0, explanation: leagueTrendSummary.hotPlayer ? explainMomentum(leagueTrendSummary.hotPlayer) : { key: "", params: {} } },
      {
        key: "rising",
        titleKey: "trends.risingPlayerTitle",
        trend: leagueTrendSummary.biggestImprovement,
        score: leagueTrendSummary.biggestImprovement?.improvementScore ?? 0,
        explanation: leagueTrendSummary.biggestImprovement ? explainDirection(leagueTrendSummary.biggestImprovement) : { key: "", params: {} },
      },
      {
        key: "falling",
        titleKey: "trends.fallingPlayerTitle",
        trend: leagueTrendSummary.biggestDecline,
        score: leagueTrendSummary.biggestDecline?.improvementScore ?? 0,
        explanation: leagueTrendSummary.biggestDecline ? explainDirection(leagueTrendSummary.biggestDecline) : { key: "", params: {} },
      },
      {
        key: "consistent",
        titleKey: "trends.mostConsistentTitle",
        trend: leagueTrendSummary.mostConsistent,
        score: leagueTrendSummary.mostConsistent?.consistencyScore ?? 0,
        explanation: leagueTrendSummary.mostConsistent ? explainConsistency(leagueTrendSummary.mostConsistent) : { key: "", params: {} },
      },
      {
        key: "active",
        titleKey: "trends.mostActiveTitle",
        trend: leagueTrendSummary.mostActive,
        score: leagueTrendSummary.mostActive?.activityScore ?? 0,
        explanation: leagueTrendSummary.mostActive ? explainActivity(leagueTrendSummary.mostActive) : { key: "", params: {} },
      },
    ];

    return configs
      .filter((c): c is typeof c & { trend: PlayerTrendMetrics } => c.trend !== null)
      .map((c) => ({ ...c, player: rosterById.get(c.trend.playerId) ?? null }))
      .filter((c): c is typeof c & { player: PlayerProfile } => c.player !== null)
      .slice(0, TRENDING_PREVIEW);
  }, [roster, leagueTrendSummary]);

  const insightOfTheDay = useMemo(
    () => selectInsightOfTheDay(roster, allMatches, new Date()),
    // Same day-stable rationale as highlights below -- only rotates once per calendar day.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [roster, allMatches],
  );

  const highlights = useMemo(() => {
    if (!myPlayer) return [];
    return selectHomeHighlights(myPlayer.id, roster, allMatches, t, new Date(), HIGHLIGHTS_COUNT);
    // "now" is intentionally the only non-listed input -- highlights only need to rotate day to day, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myPlayer, roster, allMatches, t]);

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
        {/* The active football night belongs at the very top, above any
            personal/historical stats -- QuickMatchCard is the "LIVE SESSION"
            hero (session status, current matchup, Quick Result CTA). */}
        <QuickMatchCard groupId={groupId} gameVersionId={currentGroup?.default_game_version_id} />

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
                <Badge label={myRank ? t("common.rankPosition", { position: myRank.position, of: myRank.of }) : t("common.notYetQualified")} tone={rankBadgeTone(myRank?.position ?? null)} />
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
                  {myStats && myStats.played > 0 ? (
                    <WinRateBreakdown wins={myStats.wins} losses={myStats.losses} draws={myStats.draws} />
                  ) : null}
                </View>
                <View style={styles.heroStat}>
                  <Text style={styles.heroEyebrow}>{t("home.streak")}</Text>
                  <Text style={styles.heroValue}>{formatStreakLabel(t, myStreak?.currentStreak.result ?? null, myStreak?.currentStreak.count ?? 0)}</Text>
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

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("home.quickActions")}</Text>
          <View style={styles.quickActions}>
            <QuickActionCard icon="football" label={t("home.quickActionStartEvening")} onPress={() => router.push("/start-evening")} />
            <QuickActionCard icon="analytics" label={t("home.quickActionTrends")} onPress={() => router.push("/trends")} />
            <QuickActionCard icon="calendar" label={t("home.quickActionMonthlySummary")} onPress={() => router.push("/monthly-summary")} />
            <QuickActionCard icon="bulb" label={t("home.quickActionInsights")} onPress={() => router.push("/insights")} />
          </View>
        </View>

        {tonightsStandings.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t("home.tonightsStandings")}</Text>
            <View style={styles.sectionList}>
              {tonightsStandings.map((row, index) => (
                <RankingRow
                  key={row.id}
                  playerId={row.id}
                  rank={index + 1}
                  name={row.name}
                  avatarUrl={roster.find((p) => p.id === row.id)?.avatar_url}
                  color={roster.find((p) => p.id === row.id)?.custom_color ?? colors.accent}
                  value={row.points}
                  detail={t("home.leagueTableCardRowDetail", { gd: row.goalDifference > 0 ? `+${row.goalDifference}` : String(row.goalDifference), played: String(row.played) })}
                  onPress={handlePressPlayer}
                  form={row.form}
                />
              ))}
            </View>
          </View>
        ) : null}

        <QuickClubDrawCard groupId={groupId} gameVersionId={currentGroup?.default_game_version_id} />

        {highlights.length > 0 ? (
          <FadeIn>
            <View style={styles.highlightsSection}>
              <Text style={styles.highlightsTitle}>{t("home.didYouKnow")}</Text>
              {highlights.map((item) => (
                <View key={item.id} style={styles.highlightCardRow}>
                  <Text style={styles.highlightIcon}>{DISCOVERY_ICON[item.type]}</Text>
                  <Text style={styles.highlightText}>{t(item.textKey, item.textParams)}</Text>
                </View>
              ))}
            </View>
          </FadeIn>
        ) : null}

        {isLoading ? (
          <SkeletonList count={4} />
        ) : isError ? (
          <ErrorState message={t("home.loadError")} onRetry={handleRefresh} />
        ) : (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t("home.insightOfTheDay")}</Text>
              <Card variant="elevated" style={styles.insightCard}>
                <View style={styles.insightIconBadge}>
                  <Text style={styles.insightIcon}>💡</Text>
                </View>
                <Text style={styles.insightText}>{insightOfTheDay ? t(insightOfTheDay.textKey, insightOfTheDay.textParams) : t("home.noInsightYet")}</Text>
              </Card>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t("home.leagueSummary")}</Text>
              <View style={styles.statTileRow}>
                <StatTile label={t("home.statMatchesPlayed")} value={leagueSummary.matchesPlayed} />
                <StatTile label={t("home.statGoals")} value={leagueSummary.totalGoals} />
                <StatTile label={t("home.statPlayers")} value={leagueSummary.playersCount} />
                <StatTile label={t("home.statCurrentLeader")} value={leagueSummary.currentLeader?.playerName ?? t("home.noLeaderYet")} />
              </View>
            </View>

            <View style={styles.section}>
              <LeagueTableCard
                groupName={currentGroup?.name ?? null}
                roster={roster}
                allMatches={allMatches}
                activeSeason={activeSeason}
                myPlayerId={myPlayer?.id ?? null}
                period={leagueTablePeriod}
                onChangePeriod={setLeagueTablePeriod}
                expanded={leagueTableExpanded}
                onToggleExpanded={() => setLeagueTableExpanded(!leagueTableExpanded)}
                onPressPlayer={handlePressPlayer}
                onViewFullTable={() => router.push("/league-table")}
                onStartMatch={() => router.push("/record-match")}
              />
            </View>

            {latestMatch ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t("home.recentActivity")}</Text>
                <View style={styles.sectionList}>
                  {allMatches.slice(0, RECENT_ACTIVITY_COUNT).map((match) => (
                    <MatchRow
                      key={match.id}
                      matchType={match.match_type}
                      isPenalties={match.is_penalties}
                      playedAtLabel={formatRelativeDate(match.played_at, t)}
                      side1={{
                        label: matchSideLabel(match.sides[0].players.map((p) => p.display_name)),
                        clubName: match.sides[0].club?.name ?? t("common.unknownClub"),
                        clubLogoUrl: match.sides[0].club?.logo_url,
                        score: match.sides[0].score,
                        result: match.sides[0].result,
                      }}
                      side2={{
                        label: matchSideLabel(match.sides[1].players.map((p) => p.display_name)),
                        clubName: match.sides[1].club?.name ?? t("common.unknownClub"),
                        clubLogoUrl: match.sides[1].club?.logo_url,
                        score: match.sides[1].score,
                        result: match.sides[1].result,
                      }}
                      onPress={() => router.push(`/match/${match.id}`)}
                    />
                  ))}
                </View>
              </View>
            ) : null}

            <Section
              title={t("home.trendsTitle")}
              seeAllLabel={t("home.seeAll")}
              onSeeAll={() => router.push("/leaderboards")}
              isEmpty={trendCards.length === 0}
              emptyProps={{ icon: "📈", title: t("home.notEnoughTrendData") }}
            >
              {trendCards.map((card) => {
                const directionLabel = t(`trends.direction.${card.trend.direction}`);
                const explanationText = card.explanation.key ? t(card.explanation.key, card.explanation.params) : "";

                // Every trend card shows the same self-explanatory value --
                // recent win rate vs. the previous window -- regardless of
                // which underlying score (momentum/consistency/activity)
                // selected this player for this card. A bare 0-100 score
                // with no unit was exactly the "68, +49, -61" problem this
                // replaces: a win rate + W/L/D breakdown + a labeled
                // comparison is meaningful on its own.
                const recentPct = card.trend.recentWinRate !== null ? Math.round(card.trend.recentWinRate * 100) : null;
                const previousPct = card.trend.previousWinRate !== null ? Math.round(card.trend.previousWinRate * 100) : null;
                const change = recentPct !== null ? describeMetricChange(recentPct, previousPct) : null;
                const tone = change ? metricChangeTone(change) : "neutral";
                const changeColor = tone === "positive" ? colors.win : tone === "negative" ? colors.loss : colors.textSecondary;
                const formCounts = card.trend.currentForm.reduce(
                  (acc, result) => {
                    if (result === "win") acc.wins++;
                    else if (result === "loss") acc.losses++;
                    else acc.draws++;
                    return acc;
                  },
                  { wins: 0, losses: 0, draws: 0 },
                );

                return (
                  <Pressable
                    key={card.key}
                    onPress={() => router.push(`/player/${card.player.id}?tab=analytics`)}
                    style={({ pressed }) => [styles.trendCard, pressed && styles.trendCardPressed]}
                    accessibilityRole="button"
                    accessibilityLabel={`${t(card.titleKey)}: ${card.player.display_name}, ${directionLabel}. ${explanationText}`}
                  >
                    <Avatar uri={card.player.avatar_url} name={card.player.display_name} color={card.player.custom_color} size={40} />
                    <View style={styles.trendCardInfo}>
                      <View style={styles.trendCardNameRow}>
                        <Text style={styles.trendCardName} numberOfLines={1}>
                          {card.player.display_name}
                        </Text>
                        <Text style={styles.trendCardCaption}>{t(card.titleKey)}</Text>
                      </View>
                      <Text style={styles.trendCardExplanation} numberOfLines={2}>
                        {explanationText}
                      </Text>
                      {recentPct !== null ? <WinRateBreakdown wins={formCounts.wins} losses={formCounts.losses} draws={formCounts.draws} /> : null}
                    </View>
                    <View style={styles.trendCardScoreCol}>
                      <Text style={styles.trendCardScore}>{recentPct !== null ? `${recentPct}%` : "–"}</Text>
                      {change && change.absoluteChange !== null ? (
                        <Text style={[styles.trendCardChange, { color: changeColor }]}>
                          {change.direction === "up" ? "↑" : change.direction === "down" ? "↓" : "→"} {change.absoluteChange > 0 ? "+" : ""}
                          {change.absoluteChange}%
                        </Text>
                      ) : (
                        <TrendBadge direction={card.trend.direction} label={directionLabel} />
                      )}
                    </View>
                  </Pressable>
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
  const { colors, radius, spacing, typography } = useTheme();
  const styles = useDashboardStyles(colors, radius, spacing, typography);
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

function useDashboardStyles(colors: ThemeColors, radius: ThemeValue["radius"], spacing: ThemeValue["spacing"], typography: ThemeValue["typography"]) {
  return useMemo(
    () => ({
      content: { gap: spacing.lg, paddingVertical: spacing.lg, paddingBottom: spacing.xxl },
      hero: { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderSubtle, padding: spacing.lg },
      heroTop: { flexDirection: "row" as const, alignItems: "center" as const, gap: spacing.md },
      heroInfo: { flex: 1, gap: 2 },
      heroGreeting: { ...typography.caption },
      heroName: { ...typography.title },
      heroStatsRow: { flexDirection: "row" as const, gap: spacing.xl, marginTop: spacing.lg },
      heroStat: { gap: spacing.xs },
      heroEyebrow: { ...typography.eyebrow },
      heroValue: { ...typography.display, fontSize: 24 },
      heroValueRow: { flexDirection: "row" as const, alignItems: "baseline" as const },
      greeting: { ...typography.title },
      subtitle: { ...typography.caption },
      highlightsSection: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderSubtle, backgroundColor: colors.surface },
      highlightsTitle: { ...typography.heading },
      highlightCardRow: { flexDirection: "row" as const, alignItems: "flex-start" as const, gap: spacing.sm },
      highlightIcon: { fontSize: 18, lineHeight: 20 },
      highlightText: { ...typography.body, flex: 1, flexShrink: 1 },
      quickActions: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: spacing.sm },
      statTileRow: { flexDirection: "row" as const, gap: spacing.sm },
      insightCard: { flexDirection: "row" as const, alignItems: "center" as const, gap: spacing.md },
      insightIconBadge: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: colors.accentSubtle, alignItems: "center" as const, justifyContent: "center" as const },
      insightIcon: { fontSize: 18, lineHeight: 20 },
      insightText: { ...typography.bodyStrong, flex: 1, flexShrink: 1 },
      section: { gap: spacing.sm },
      sectionHeader: { flexDirection: "row" as const, justifyContent: "space-between" as const, alignItems: "center" as const },
      sectionTitle: { ...typography.heading },
      seeAll: { ...typography.caption, color: colors.accent, fontWeight: "600" as const },
      sectionList: { gap: spacing.sm },
      trendCard: { flexDirection: "row" as const, alignItems: "center" as const, gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderSubtle, backgroundColor: colors.surface },
      trendCardPressed: { backgroundColor: colors.surfaceElevated },
      trendCardInfo: { flex: 1, gap: 2 },
      trendCardNameRow: { flexDirection: "row" as const, alignItems: "baseline" as const, gap: spacing.xs },
      trendCardName: { ...typography.bodyStrong, flexShrink: 1 },
      trendCardCaption: { ...typography.small, color: colors.textSecondary },
      trendCardExplanation: { ...typography.small },
      trendCardScoreCol: { alignItems: "flex-end" as const, gap: 4 },
      trendCardScore: { ...typography.bodyStrong, color: colors.accent },
      trendCardChange: { ...typography.small, fontWeight: "700" as const },
    }),
    [colors, radius, spacing, typography],
  );
}
