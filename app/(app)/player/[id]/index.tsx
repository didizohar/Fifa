import { useMemo, useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { AnalyticsRangeSelector } from "../../../../src/components/AnalyticsRangeSelector";
import { Avatar } from "../../../../src/components/Avatar";
import { Badge, rankBadgeTone } from "../../../../src/components/Badge";
import { BarChart } from "../../../../src/components/BarChart";
import { Button } from "../../../../src/components/Button";
import { Card } from "../../../../src/components/Card";
import { CareerSummaryCard } from "../../../../src/components/CareerSummaryCard";
import { ClubUsageList } from "../../../../src/components/ClubUsageList";
import { ErrorBoundary } from "../../../../src/components/ErrorBoundary";
import { ErrorState } from "../../../../src/components/ErrorState";
import { FormStrip } from "../../../../src/components/FormStrip";
import { InfoBanner } from "../../../../src/components/InfoBanner";
import { InfoTooltip } from "../../../../src/components/InfoTooltip";
import { MomentumIndicator } from "../../../../src/components/MomentumIndicator";
import { OpponentPerformanceList } from "../../../../src/components/OpponentPerformanceList";
import { PerformanceTimelineChart } from "../../../../src/components/PerformanceTimelineChart";
import { PlayerPicker } from "../../../../src/components/PlayerPicker";
import { RecentFormCard } from "../../../../src/components/RecentFormCard";
import { Screen } from "../../../../src/components/Screen";
import { SegmentedControl } from "../../../../src/components/SegmentedControl";
import { Skeleton, SkeletonList } from "../../../../src/components/Skeleton";
import { Sparkline } from "../../../../src/components/Sparkline";
import { StatTile } from "../../../../src/components/StatTile";
import { TimelineChart } from "../../../../src/components/TimelineChart";
import { TrendComparisonRow } from "../../../../src/components/TrendComparisonRow";
import { TrendExplanationCard } from "../../../../src/components/TrendExplanationCard";
import { TrendScoreCard } from "../../../../src/components/TrendScoreCard";
import { WinRateBreakdown } from "../../../../src/components/WinRateBreakdown";
import { useAuth } from "../../../../src/hooks/useAuth";
import { useGroup } from "../../../../src/hooks/useGroup";
import { useGroupMatchHistory, usePlayerMatchHistory } from "../../../../src/hooks/useMatches";
import { useArchivePlayer, useUpdatePlayer } from "../../../../src/hooks/usePlayerMutations";
import { usePlayer, usePlayers } from "../../../../src/hooks/usePlayers";
import { computeAllAchievements } from "../../../../src/lib/achievements";
import { calculatePlayerAnalytics, NOT_RANKED } from "../../../../src/lib/analytics/playerAnalytics";
import { explainActivity, explainAttack, explainConsistency, explainDefence, explainDirection } from "../../../../src/lib/trends/explanations";
import { calculatePlayerTrend } from "../../../../src/lib/trends/playerTrends";
import type { AnalyticsRange, TimelinePoint } from "../../../../src/lib/analytics/types";
import { confirmAction, notify } from "../../../../src/lib/confirm";
import { formatRelativeDate, formatStreakLabel, matchSideLabel } from "../../../../src/lib/format";
import { generateFunFacts, type FunFact } from "../../../../src/lib/facts";
import { useTranslation } from "../../../../src/lib/i18n";
import { generateInsights, type Insight } from "../../../../src/lib/insights";
import { computeIndividualStandings } from "../../../../src/lib/leagueStandings";
import type { MatchSummary } from "../../../../src/lib/matches";
import {
  hasUnparseableOwnMatchDates,
  resolvePlayerAnalyticsNotices,
  summarizeTimelineTrend,
  type PlayerAnalyticsNotice,
} from "../../../../src/lib/playerAnalyticsView";
import { toPickablePlayer, type PickablePlayer } from "../../../../src/lib/players";
import { computeAllRecords, type RecordEntry } from "../../../../src/lib/records";
import {
  computeBestMatchup,
  computeBiggestLoss,
  computeBiggestWin,
  computeClubPerformance,
  computeDayOfWeekPerformance,
  computeDoublesPartnerships,
  computeFavoriteOpponent,
  computeGoalStats,
  computeHeadToHead,
  computeLastNStats,
  computeNemesis,
  computePerformanceAfterBreak,
  computePlayerMonthlyTrend,
  computePlayerStats,
  computeSpecialConditionsPerformance,
  computeStreaks,
  computeWinRateProgression,
  computeWinRateRank,
  findSides,
  MIN_SAMPLE_SIZE,
} from "../../../../src/lib/stats";
import { shareViewAsImage } from "../../../../src/lib/shareCard";
import { pickAndUploadAvatar } from "../../../../src/lib/storage";
import type { PlayerProfile } from "../../../../src/lib/types/database";
import { colors, spacing, typography } from "../../../../src/theme";

const EMPTY_MATCHES: MatchSummary[] = [];
const EMPTY_PLAYERS: PlayerProfile[] = [];

type ProfileTab = "overview" | "charts" | "h2h" | "analytics";

interface AnalyticsChartConfig {
  key: string;
  titleKey: string;
  points: TimelinePoint[];
  formatValue: (value: number) => string;
  invert?: boolean;
  isValueValid?: (point: TimelinePoint) => boolean;
}

function opponentLabel(playerId: string, match: MatchSummary, unknownOpponentLabel: string): string {
  const sides = findSides(playerId, match);
  if (!sides) return unknownOpponentLabel;
  const names = matchSideLabel(sides.opponent.players.map((p) => p.display_name));
  return sides.opponent.club ? `${names} (${sides.opponent.club.name})` : names;
}

// Sunday-first to match DAY_OF_WEEK's own 0=Sunday indexing (computeDayOfWeekPerformance).
const DAY_SHORT_LABELS = Array.from({ length: 7 }, (_, day) =>
  new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(new Date(2026, 0, 4 + day)),
);
const MONTH_SHORT_LABEL = new Intl.DateTimeFormat(undefined, { month: "short", year: "2-digit" });

const VALID_TABS: ProfileTab[] = ["overview", "charts", "h2h", "analytics"];

export default function PlayerDetailScreen() {
  const { id, tab: initialTabParam } = useLocalSearchParams<{ id: string; tab?: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useTranslation();
  const { currentGroupId, currentRole } = useGroup();
  const { data: player, isLoading, isError, refetch } = usePlayer(id);
  const matchHistory = usePlayerMatchHistory(id);
  const roster = usePlayers(currentGroupId);
  // Same query key as Home/Leaderboards/Players, so this is usually already
  // warm in the cache -- needed here because "records held" is a group-wide
  // question that a player's own match history alone can't answer.
  const groupHistory = useGroupMatchHistory(currentGroupId);
  const updatePlayer = useUpdatePlayer(currentGroupId);
  const archivePlayer = useArchivePlayer(currentGroupId);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [headToHeadOpponentId, setHeadToHeadOpponentId] = useState<string | null>(null);
  // Lets a "jump to a player's Analytics tab" link (e.g. Home's trend cards) land directly on it, e.g. /player/[id]?tab=analytics.
  const [tab, setTab] = useState<ProfileTab>((VALID_TABS as string[]).includes(initialTabParam ?? "") ? (initialTabParam as ProfileTab) : "overview");
  const [analyticsRange, setAnalyticsRange] = useState<AnalyticsRange>("30d");
  const careerCardRef = useRef<View>(null);

  const tabs = useMemo(
    () => [
      { value: "overview" as const, label: t("playerProfile.tabOverview") },
      { value: "charts" as const, label: t("playerProfile.tabCharts") },
      { value: "h2h" as const, label: t("playerProfile.tabHeadToHead") },
      { value: "analytics" as const, label: t("playerAnalytics.tabLabel") },
    ],
    [t],
  );

  const playerId = id ?? "";
  const matches = matchHistory.data ?? EMPTY_MATCHES;

  const goalStats = useMemo(() => computeGoalStats(playerId, matches), [playerId, matches]);
  const streaks = useMemo(() => computeStreaks(playerId, matches), [playerId, matches]);
  const last10 = useMemo(() => computeLastNStats(playerId, matches, 10), [playerId, matches]);
  const biggestWin = useMemo(() => computeBiggestWin(playerId, matches), [playerId, matches]);
  const biggestLoss = useMemo(() => computeBiggestLoss(playerId, matches), [playerId, matches]);
  const clubPerformance = useMemo(() => computeClubPerformance(playerId, matches), [playerId, matches]);
  const partnerships = useMemo(() => computeDoublesPartnerships(playerId, matches), [playerId, matches]);
  const totalClubMatches = useMemo(() => clubPerformance.reduce((sum, c) => sum + c.played, 0), [clubPerformance]);
  const totalPartnershipMatches = useMemo(() => partnerships.reduce((sum, p) => sum + p.played, 0), [partnerships]);
  const opponents = useMemo(() => {
    const map = new Map<string, PickablePlayer>();
    for (const match of matches) {
      const sides = findSides(playerId, match);
      if (!sides) continue;
      for (const p of sides.opponent.players) {
        if (!map.has(p.id)) map.set(p.id, toPickablePlayer(p));
      }
    }
    return [...map.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [playerId, matches]);
  const headToHead = useMemo(
    () => (headToHeadOpponentId ? computeHeadToHead(playerId, headToHeadOpponentId, matches) : null),
    [playerId, headToHeadOpponentId, matches],
  );
  const singlesWinRateSeries = useMemo(
    () => computeWinRateProgression(playerId, matches.filter((m) => m.match_type === "singles")),
    [playerId, matches],
  );
  const doublesWinRateSeries = useMemo(
    () => computeWinRateProgression(playerId, matches.filter((m) => m.match_type === "doubles")),
    [playerId, matches],
  );
  const rank = useMemo(() => computeWinRateRank(playerId, roster.data ?? EMPTY_PLAYERS, matches), [roster.data, playerId, matches]);
  // Derived from matches (already fetched via usePlayerMatchHistory, uncapped) instead of a
  // second usePlayerRecords network round-trip for the same win/loss/draw fact.
  const stats = useMemo(() => computePlayerStats(playerId, matches), [playerId, matches]);

  const favoriteOpponent = useMemo(
    () => computeFavoriteOpponent(playerId, roster.data ?? EMPTY_PLAYERS, matches),
    [playerId, roster.data, matches],
  );
  const nemesis = useMemo(() => computeNemesis(playerId, roster.data ?? EMPTY_PLAYERS, matches), [playerId, roster.data, matches]);
  const bestMatchup = useMemo(() => computeBestMatchup(playerId, roster.data ?? EMPTY_PLAYERS, matches), [playerId, roster.data, matches]);
  const favoritePartner = partnerships.find((p) => p.played >= MIN_SAMPLE_SIZE) ?? null;
  const favoriteClub = clubPerformance[0] ?? null;

  // Points-based (win=3/draw=1/loss=0) league position, from the same
  // engine that backs the League Table screen -- distinct from `rank`
  // above, which is the older Win-Rate-only ranking. Needs the whole
  // group's roster/history (not just this player's matches), same source
  // as heldRecords below.
  const leagueStandings = useMemo(
    () => computeIndividualStandings(roster.data ?? EMPTY_PLAYERS, groupHistory.data ?? EMPTY_MATCHES),
    [roster.data, groupHistory.data],
  );
  const leaguePosition = useMemo(() => {
    const index = leagueStandings.findIndex((row) => row.id === playerId);
    return index === -1 ? null : { position: index + 1, of: leagueStandings.length };
  }, [leagueStandings, playerId]);

  const personalHighlights = useMemo(() => {
    const combined: Array<FunFact | Insight> = [
      ...generateFunFacts(playerId, roster.data ?? EMPTY_PLAYERS, matches),
      ...generateInsights(playerId, roster.data ?? EMPTY_PLAYERS, matches),
    ];
    return combined.sort((a, b) => b.score - a.score).slice(0, 3);
  }, [playerId, roster.data, matches]);

  const heldRecords: RecordEntry[] = useMemo(() => {
    const allRecords = computeAllRecords(roster.data ?? EMPTY_PLAYERS, groupHistory.data ?? EMPTY_MATCHES);
    return allRecords.filter((r) => r.holderIds.includes(playerId));
  }, [playerId, roster.data, groupHistory.data]);

  const achievements = useMemo(() => computeAllAchievements(playerId, matches), [playerId, matches]);

  const dayOfWeekPerformance = useMemo(() => computeDayOfWeekPerformance(playerId, matches), [playerId, matches]);
  const specialConditions = useMemo(() => computeSpecialConditionsPerformance(playerId, matches), [playerId, matches]);
  const afterBreak = useMemo(() => computePerformanceAfterBreak(playerId, matches), [playerId, matches]);
  const monthlyTrend = useMemo(() => computePlayerMonthlyTrend(playerId, matches), [playerId, matches]);

  // Stage 7 M2/M2.5 analytics engine -- every number in the Analytics tab comes from
  // this single memoized call, never recalculated in the UI itself.
  const playerAnalytics = useMemo(
    () => calculatePlayerAnalytics(playerId, roster.data ?? EMPTY_PLAYERS, matches, analyticsRange),
    [playerId, roster.data, matches, analyticsRange],
  );

  const analyticsNotices = useMemo<PlayerAnalyticsNotice[]>(
    () =>
      resolvePlayerAnalyticsNotices({
        matchesConsidered: playerAnalytics.matchesConsidered,
        isArchived: player ? !player.is_active : false,
        hasUnparseableDates: hasUnparseableOwnMatchDates(playerId, matches),
      }),
    [playerAnalytics.matchesConsidered, player, playerId, matches],
  );

  const analyticsChartConfigs = useMemo<AnalyticsChartConfig[]>(
    () => [
      { key: "winRate", titleKey: "playerAnalytics.chartWinRateTimeline", points: playerAnalytics.winRateTimeline, formatValue: (v: number) => `${Math.round(v * 100)}%` },
      { key: "goals", titleKey: "playerAnalytics.chartGoalsTimeline", points: playerAnalytics.goalsTimeline, formatValue: (v: number) => `${v}` },
      { key: "matches", titleKey: "playerAnalytics.chartMatchesTimeline", points: playerAnalytics.matchesTimeline, formatValue: (v: number) => `${v}` },
      {
        key: "goalDiff",
        titleKey: "playerAnalytics.chartGoalDifferenceTimeline",
        points: playerAnalytics.goalDifferenceTimeline,
        formatValue: (v: number) => (v > 0 ? `+${v}` : `${v}`),
      },
      {
        key: "rank",
        titleKey: "playerAnalytics.chartRankTimeline",
        points: playerAnalytics.rankTimeline,
        formatValue: (v: number) => `#${v}`,
        invert: true,
        isValueValid: (p: TimelinePoint) => p.matchesInBucket > 0 && p.value !== NOT_RANKED,
      },
    ],
    [playerAnalytics],
  );

  const analyticsNoticeText: Record<PlayerAnalyticsNotice, string> = {
    archivedPlayer: t("playerAnalytics.noticeArchived"),
    noMatches: t("playerAnalytics.noticeNoMatches"),
    oneMatchOnly: t("playerAnalytics.noticeOneMatch"),
    insufficientSample: t("playerAnalytics.noticeInsufficientSample"),
    legacyDataExcluded: t("playerAnalytics.noticeLegacyData"),
  };

  // Stage 7 M4 trends engine -- momentum/consistency/activity/attack/defence,
  // all derived from this single memoized call.
  const playerTrend = useMemo(() => calculatePlayerTrend(playerId, roster.data ?? EMPTY_PLAYERS, matches), [playerId, roster.data, matches]);

  if (isLoading) {
    return (
      <Screen>
        <View style={styles.loading}>
          <Skeleton width={96} height={96} borderRadius={48} />
          <Skeleton width="60%" height={22} />
          <Skeleton width="40%" height={16} />
        </View>
      </Screen>
    );
  }

  if (isError || !player) {
    return (
      <Screen>
        <ErrorState message={t("playerProfile.loadError")} onRetry={refetch} />
      </Screen>
    );
  }

  const canManage = currentRole === "owner" || currentRole === "admin" || player.linked_user_id === user?.id;

  const handleAvatarPress = async () => {
    if (!canManage || !currentGroupId || isUploadingAvatar) return;
    setIsUploadingAvatar(true);
    try {
      const picked = await pickAndUploadAvatar(currentGroupId, player.id);
      if (picked) {
        await updatePlayer.mutateAsync({ playerId: player.id, patch: { avatar_url: picked.publicUrl } });
      }
    } catch (e) {
      notify(t("playerProfile.avatarUpdateErrorTitle"), e instanceof Error ? e.message : t("playerProfile.genericRetryMessage"));
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleArchive = () => {
    confirmAction(
      t("playerProfile.archiveConfirmTitle"),
      t("playerProfile.archiveConfirmMessage", { name: player.display_name }),
      t("playerProfile.archiveConfirmAction"),
      async () => {
        await archivePlayer.mutateAsync(player.id);
        router.back();
      },
    );
  };

  const cardHeadline = heldRecords[0] ? t(heldRecords[0].labelKey) : achievements.length > 0 ? t(achievements[achievements.length - 1]!.labelKey) : null;

  const handleShareCareerCard = async () => {
    if (isSharing) return;
    setIsSharing(true);
    try {
      await shareViewAsImage(careerCardRef, `${player.display_name}-fc-rival-career.png`);
    } catch (e) {
      notify(t("playerProfile.shareCareerCardErrorTitle"), e instanceof Error ? e.message : t("playerProfile.genericRetryMessage"));
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={[colors.surfaceElevated, colors.surface]} style={styles.hero}>
          <Pressable
            onPress={handleAvatarPress}
            disabled={!canManage || isUploadingAvatar}
            accessibilityRole={canManage ? "button" : undefined}
            accessibilityLabel={canManage ? t("playerProfile.changePhoto") : undefined}
          >
            <Avatar uri={player.avatar_url} name={player.display_name} color={player.custom_color} size={104} />
            {canManage ? (
              <Text style={styles.changePhoto}>{isUploadingAvatar ? t("playerProfile.uploadingPhoto") : t("playerProfile.changePhoto")}</Text>
            ) : null}
          </Pressable>
          <Text style={styles.name}>{player.display_name}</Text>
          {player.nickname ? <Text style={styles.nickname}>"{player.nickname}"</Text> : null}
          <View style={styles.heroBadgeRow}>
            {rank ? <Badge label={t("playerProfile.rankPositionOf", { position: rank.position, of: rank.of })} tone={rankBadgeTone(rank.position)} /> : null}
            {!player.is_active ? <Badge label={t("players.archivedBadge")} tone="warning" /> : null}
          </View>

          {matchHistory.isLoading ? (
            <View style={styles.formPlaceholder} />
          ) : (
            <FormStrip results={last10.form.slice(0, 5).map((f) => f.result)} />
          )}
        </LinearGradient>

        <View style={styles.tileGrid}>
          <StatTile
            label={t("playerProfile.statRank")}
            value={rank ? t("playerProfile.rankPositionOf", { position: rank.position, of: rank.of }) : t("playerProfile.notYetQualified")}
            style={styles.tile}
            variant="elevated"
          />
          <StatTile
            label={t("playerProfile.statWinRate")}
            value={stats.winRate !== null ? `${Math.round(stats.winRate * 100)}%` : "–"}
            style={styles.tile}
            variant="elevated"
          />
          <StatTile label={t("playerProfile.statMatchesPlayed")} value={stats.played} style={styles.tile} variant="elevated" />
          <StatTile
            label={t("playerProfile.statCurrentStreak")}
            value={formatStreakLabel(t, streaks.currentStreak.result, streaks.currentStreak.count)}
            style={styles.tile}
            variant="elevated"
          />
        </View>
        {stats.played > 0 ? (
          <View style={styles.heroWinRateBreakdown}>
            <WinRateBreakdown wins={stats.wins} losses={stats.losses} draws={stats.draws} />
          </View>
        ) : null}

        <View style={styles.tabRow}>
          <SegmentedControl options={tabs} value={tab} onChange={setTab} />
        </View>

        {tab === "overview" ? (
          <View style={styles.tabContent}>
            {matchHistory.isLoading || groupHistory.isLoading ? (
              <Card>
                <Skeleton height={120} />
              </Card>
            ) : (
              <Card>
                <Text style={styles.sectionTitle}>{t("playerProfile.snapshotTitle")}</Text>
                <View style={styles.bestWorst}>
                  <View style={styles.bestWorstRow}>
                    <Text style={styles.bestWorstLabel}>{t("playerProfile.leaguePositionLabel")}</Text>
                    <Text style={styles.bestWorstValue}>
                      {leaguePosition
                        ? t("playerProfile.leaguePositionValue", { position: leaguePosition.position, of: leaguePosition.of })
                        : t("playerProfile.notYetQualified")}
                    </Text>
                  </View>
                  <View style={styles.bestWorstRow}>
                    <Text style={styles.bestWorstLabel}>{t("playerProfile.avgGoalsConcededLabel")}</Text>
                    <Text style={styles.bestWorstValue}>
                      {goalStats.goalsConcededPerMatch !== null
                        ? t("playerProfile.perMatchValue", { value: goalStats.goalsConcededPerMatch.toFixed(2) })
                        : "–"}
                    </Text>
                  </View>
                  <View style={styles.bestWorstRow}>
                    <Text style={styles.bestWorstLabel}>{t("playerProfile.favoriteClubLabel")}</Text>
                    <Text style={styles.bestWorstValue} numberOfLines={1}>
                      {favoriteClub
                        ? t("playerProfile.clubMatchesValue", { name: favoriteClub.clubName, count: favoriteClub.played })
                        : t("playerProfile.noMatchesYet")}
                    </Text>
                  </View>
                  <View style={styles.bestWorstRow}>
                    <Text style={styles.bestWorstLabel}>{t("playerProfile.mostSuccessfulVsLabel")}</Text>
                    <Text style={styles.bestWorstValue} numberOfLines={1}>
                      {bestMatchup
                        ? t("playerProfile.matchupSummary", {
                            name: bestMatchup.opponentName,
                            winRate: bestMatchup.headToHead.winRate !== null ? Math.round(bestMatchup.headToHead.winRate * 100) : 0,
                            wins: bestMatchup.headToHead.wins,
                            losses: bestMatchup.headToHead.losses,
                            draws: bestMatchup.headToHead.draws,
                            played: bestMatchup.headToHead.played,
                          })
                        : t("playerProfile.notEnoughMatchupData", { count: MIN_SAMPLE_SIZE })}
                    </Text>
                  </View>
                </View>
              </Card>
            )}

            {personalHighlights.length > 0 ? (
              <Card>
                <Text style={styles.sectionTitle}>{t("playerProfile.highlightsTitle")}</Text>
                <View style={styles.highlightsList}>
                  {personalHighlights.map((item) => (
                    <Text key={item.id} style={styles.highlightText}>
                      • {t(item.textKey, item.textParams)}
                    </Text>
                  ))}
                </View>
              </Card>
            ) : null}

            {heldRecords.length > 0 ? (
              <Card>
                <Text style={styles.sectionTitle}>{t("playerProfile.recordsHeldTitle")}</Text>
                <View style={styles.highlightsList}>
                  {heldRecords.map((record) => (
                    <View key={record.id} style={styles.recordHeldRow}>
                      <Text style={styles.recordHeldLabel}>{t(record.labelKey)}</Text>
                      <Text style={styles.recordHeldValue}>{t(record.valueLabelKey, record.valueLabelParams)}</Text>
                    </View>
                  ))}
                </View>
              </Card>
            ) : null}

            {achievements.length > 0 ? (
              <Card>
                <Text style={styles.sectionTitle}>{t("playerProfile.achievementsTitle")}</Text>
                <View style={styles.highlightsList}>
                  {achievements.map((achievement) => (
                    <View key={achievement.id} style={styles.achievementRow}>
                      <Text style={styles.achievementIcon}>🏅</Text>
                      <View style={styles.achievementInfo}>
                        <Text style={styles.achievementLabel}>{t(achievement.labelKey)}</Text>
                        <Text style={styles.achievementDescription}>{t(achievement.descriptionKey, achievement.descriptionParams)}</Text>
                      </View>
                      <Text style={styles.achievementDate}>{formatRelativeDate(achievement.unlockedAt, t)}</Text>
                    </View>
                  ))}
                </View>
              </Card>
            ) : null}

            {favoriteOpponent || nemesis || favoritePartner ? (
              <Card>
                <Text style={styles.sectionTitle}>{t("playerProfile.rivalriesTitle")}</Text>
                <View style={styles.bestWorst}>
                  {favoriteOpponent ? (
                    <View style={styles.bestWorstRow}>
                      <Text style={styles.bestWorstLabel}>{t("playerProfile.mostPlayedOpponentLabel")}</Text>
                      <Text style={styles.bestWorstValue} numberOfLines={1}>
                        {t("playerProfile.headToHeadSummary", {
                          name: favoriteOpponent.opponentName,
                          wins: favoriteOpponent.headToHead.wins,
                          losses: favoriteOpponent.headToHead.losses,
                          draws: favoriteOpponent.headToHead.draws,
                          played: favoriteOpponent.headToHead.played,
                        })}
                      </Text>
                    </View>
                  ) : null}
                  {nemesis ? (
                    <View style={styles.bestWorstRow}>
                      <Text style={styles.bestWorstLabel}>{t("playerProfile.toughestMatchupLabel")}</Text>
                      <Text style={styles.bestWorstValue} numberOfLines={1}>
                        {t("playerProfile.toughestMatchupSummary", {
                          name: nemesis.opponentName,
                          winRate: nemesis.headToHead.winRate !== null ? Math.round(nemesis.headToHead.winRate * 100) : 0,
                          wins: nemesis.headToHead.wins,
                          losses: nemesis.headToHead.losses,
                          draws: nemesis.headToHead.draws,
                          played: nemesis.headToHead.played,
                        })}
                      </Text>
                    </View>
                  ) : null}
                  {favoritePartner ? (
                    <View style={styles.bestWorstRow}>
                      <Text style={styles.bestWorstLabel}>{t("playerProfile.favoritePartnerLabel")}</Text>
                      <Text style={styles.bestWorstValue} numberOfLines={1}>
                        {t("playerProfile.partnerMatchesValue", { name: favoritePartner.teammateName, count: favoritePartner.played })}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </Card>
            ) : null}

            <Card>
              <Text style={styles.sectionTitle}>{t("playerProfile.careerRecordTitle")}</Text>
              {matchHistory.isLoading ? (
                <Skeleton height={40} />
              ) : (
                <View style={styles.recordRow}>
                  <RecordStat label={t("playerProfile.statPlayed")} value={stats.played} />
                  <RecordStat label={t("playerProfile.statWins")} value={stats.wins} color={colors.win} />
                  <RecordStat label={t("playerProfile.statLosses")} value={stats.losses} color={colors.loss} />
                  <RecordStat label={t("playerProfile.statDraws")} value={stats.draws} color={colors.draw} />
                </View>
              )}
            </Card>

            <Card>
              <Text style={styles.sectionTitle}>{t("playerProfile.formLast10Title")}</Text>
              {matchHistory.isLoading ? (
                <Skeleton height={40} />
              ) : matchHistory.isError ? (
                <Text style={styles.errorText}>{t("playerProfile.matchHistoryLoadError")}</Text>
              ) : (
                <>
                  <FormStrip results={last10.form.map((f) => f.result)} />
                  <View style={styles.streakRow}>
                    <Text style={styles.streakText}>
                      {t("playerProfile.currentStreakPrefix")}{" "}
                      <Text
                        style={
                          streaks.currentStreak.result === "win"
                            ? styles.streakWin
                            : streaks.currentStreak.result === "loss"
                              ? styles.streakLoss
                              : undefined
                        }
                      >
                        {formatStreakLabel(t, streaks.currentStreak.result, streaks.currentStreak.count)}
                      </Text>
                    </Text>
                    <Text style={styles.streakText}>{t("playerProfile.bestWinStreakLabel", { count: streaks.longestWinStreak })}</Text>
                    <Text style={styles.streakText}>{t("playerProfile.worstLossStreakLabel", { count: streaks.longestLossStreak })}</Text>
                  </View>
                </>
              )}
            </Card>

            <Card>
              <Text style={styles.sectionTitle}>{t("playerProfile.goalsTitle")}</Text>
              {matchHistory.isLoading ? (
                <Skeleton height={40} />
              ) : (
                <View style={styles.recordRow}>
                  <RecordStat label={t("playerProfile.statScored")} value={goalStats.goalsScored} />
                  <RecordStat label={t("playerProfile.statConceded")} value={goalStats.goalsConceded} />
                  <RecordStat
                    label={t("playerProfile.statPerMatch")}
                    value={goalStats.goalsPerMatch !== null ? goalStats.goalsPerMatch.toFixed(2) : "–"}
                  />
                  <RecordStat label={t("playerProfile.statCleanSheets")} value={goalStats.cleanSheets} color={colors.accent} />
                </View>
              )}
            </Card>

            <Card>
              <Text style={styles.sectionTitle}>{t("playerProfile.bestWorstTitle")}</Text>
              {matchHistory.isLoading ? (
                <Skeleton height={40} />
              ) : (
                <View style={styles.bestWorst}>
                  <View style={styles.bestWorstRow}>
                    <Text style={styles.bestWorstLabel}>{t("playerProfile.biggestWinLabel")}</Text>
                    {biggestWin ? (
                      <Text style={styles.bestWorstValue} numberOfLines={1}>
                        {t("playerProfile.scoreVsOpponent", {
                          score: `${biggestWin.ownScore}-${biggestWin.opponentScore}`,
                          opponent: opponentLabel(playerId, biggestWin.match, t("playerProfile.unknownOpponent")),
                        })}
                      </Text>
                    ) : (
                      <Text style={styles.bestWorstEmpty}>{t("playerProfile.noWinsYet")}</Text>
                    )}
                  </View>
                  <View style={styles.bestWorstRow}>
                    <Text style={styles.bestWorstLabel}>{t("playerProfile.biggestLossLabel")}</Text>
                    {biggestLoss ? (
                      <Text style={styles.bestWorstValue} numberOfLines={1}>
                        {t("playerProfile.scoreVsOpponent", {
                          score: `${biggestLoss.ownScore}-${biggestLoss.opponentScore}`,
                          opponent: opponentLabel(playerId, biggestLoss.match, t("playerProfile.unknownOpponent")),
                        })}
                      </Text>
                    ) : (
                      <Text style={styles.bestWorstEmpty}>{t("playerProfile.noLossesYet")}</Text>
                    )}
                  </View>
                </View>
              )}
            </Card>
          </View>
        ) : null}

        {tab === "charts" ? (
          <View style={styles.tabContent}>
            <Card>
              <Text style={styles.sectionTitle}>{t("playerProfile.winRateProgressionTitle")}</Text>
              {matchHistory.isLoading ? (
                <Skeleton height={80} />
              ) : (
                <View style={styles.progressionSection}>
                  <View>
                    <Text style={styles.subLabel}>{t("playerProfile.singlesLabel")}</Text>
                    <Sparkline values={singlesWinRateSeries} />
                  </View>
                  <View>
                    <Text style={styles.subLabel}>{t("playerProfile.doublesLabel")}</Text>
                    <Sparkline values={doublesWinRateSeries} />
                  </View>
                </View>
              )}
            </Card>

            {monthlyTrend.length >= 2 ? (
              <Card>
                <Text style={styles.sectionTitle}>{t("playerProfile.monthlyPerformanceTitle")}</Text>
                <Text style={styles.subLabel}>{t("playerProfile.monthlyPerformanceHint")}</Text>
                <BarChart
                  rows={monthlyTrend.slice(-6).map((m) => ({
                    label: MONTH_SHORT_LABEL.format(new Date(m.year, m.month, 1)),
                    value: m.stats.played,
                    valueLabel: m.stats.winRate !== null ? `${Math.round(m.stats.winRate * 100)}%` : "–",
                  }))}
                />
              </Card>
            ) : null}

            {dayOfWeekPerformance.some((d) => d.stats.played > 0) ? (
              <Card>
                <Text style={styles.sectionTitle}>{t("playerProfile.byDayOfWeekTitle")}</Text>
                <BarChart
                  rows={dayOfWeekPerformance
                    .filter((d) => d.stats.played > 0)
                    .map((d) => ({
                      label: DAY_SHORT_LABELS[d.day]!,
                      value: d.stats.played,
                      valueLabel: `${d.stats.wins}-${d.stats.losses}-${d.stats.draws}`,
                    }))}
                />
              </Card>
            ) : null}

            {specialConditions.overtime.played > 0 || specialConditions.penalties.played > 0 ? (
              <Card>
                <Text style={styles.sectionTitle}>{t("playerProfile.overtimePenaltiesTitle")}</Text>
                <View style={styles.recordRow}>
                  <RecordStat
                    label={t("playerProfile.statOvertime")}
                    value={specialConditions.overtime.played > 0 ? `${specialConditions.overtime.wins}-${specialConditions.overtime.losses}-${specialConditions.overtime.draws}` : "–"}
                  />
                  <RecordStat
                    label={t("playerProfile.statPenalties")}
                    value={specialConditions.penalties.played > 0 ? `${specialConditions.penalties.wins}-${specialConditions.penalties.losses}-${specialConditions.penalties.draws}` : "–"}
                  />
                </View>
              </Card>
            ) : null}

            {afterBreak.played > 0 ? (
              <Card>
                <Text style={styles.sectionTitle}>{t("playerProfile.afterBreakTitle")}</Text>
                <View style={styles.recordRow}>
                  <RecordStat label={t("playerProfile.statPlayed")} value={afterBreak.played} />
                  <RecordStat label={t("playerProfile.statWins")} value={afterBreak.wins} color={colors.win} />
                  <RecordStat label={t("playerProfile.statLosses")} value={afterBreak.losses} color={colors.loss} />
                  <RecordStat
                    label={t("playerProfile.statWinRate")}
                    value={afterBreak.winRate !== null ? `${Math.round(afterBreak.winRate * 100)}%` : "–"}
                    color={colors.accent}
                  />
                </View>
                <Text style={styles.insufficientData}>{t("playerProfile.afterBreakHint")}</Text>
              </Card>
            ) : null}

            {clubPerformance.length > 0 ? (
              <Card>
                <Text style={styles.sectionTitle}>{t("playerProfile.byClubTitle")}</Text>
                {totalClubMatches < MIN_SAMPLE_SIZE ? (
                  <Text style={styles.insufficientData}>{t("playerProfile.notEnoughMatchesYet")}</Text>
                ) : (
                  <BarChart
                    rows={clubPerformance.slice(0, 6).map((c) => ({
                      label: c.clubName,
                      value: c.played,
                      valueLabel: `${c.wins}-${c.losses}-${c.draws}`,
                    }))}
                  />
                )}
              </Card>
            ) : null}

            {partnerships.length > 0 ? (
              <Card>
                <Text style={styles.sectionTitle}>{t("playerProfile.doublesPartnersTitle")}</Text>
                {totalPartnershipMatches < MIN_SAMPLE_SIZE ? (
                  <Text style={styles.insufficientData}>{t("playerProfile.notEnoughMatchesYet")}</Text>
                ) : (
                  <BarChart
                    rows={partnerships.slice(0, 6).map((p) => ({
                      label: p.teammateName,
                      value: p.played,
                      valueLabel: `${p.wins}-${p.losses}-${p.draws}`,
                    }))}
                  />
                )}
              </Card>
            ) : null}

            {clubPerformance.length === 0 &&
            partnerships.length === 0 &&
            monthlyTrend.length < 2 &&
            !dayOfWeekPerformance.some((d) => d.stats.played > 0) &&
            specialConditions.overtime.played === 0 &&
            specialConditions.penalties.played === 0 &&
            afterBreak.played === 0 &&
            !matchHistory.isLoading ? (
              <Card>
                <Text style={styles.emptyChartsTitle}>{t("playerProfile.notEnoughDataTitle")}</Text>
                <Text style={styles.emptyChartsMessage}>{t("playerProfile.notEnoughDataMessage")}</Text>
              </Card>
            ) : null}
          </View>
        ) : null}

        {tab === "h2h" ? (
          <View style={styles.tabContent}>
            {opponents.length > 0 ? (
              <Card>
                <Text style={styles.sectionTitle}>{t("playerProfile.headToHeadTitle")}</Text>
                <PlayerPicker
                  players={opponents}
                  selectedIds={headToHeadOpponentId ? [headToHeadOpponentId] : []}
                  onToggle={(opponentId) => setHeadToHeadOpponentId((prev) => (prev === opponentId ? null : opponentId))}
                  maxSelected={1}
                />
                {!headToHead ? <Text style={styles.h2hPrompt}>{t("playerProfile.h2hPrompt")}</Text> : null}
                {headToHead ? (
                  <View style={styles.h2hRow}>
                    <View style={styles.recordRow}>
                      <RecordStat label={t("playerProfile.statPlayed")} value={headToHead.played} />
                      <RecordStat label={t("playerProfile.statWins")} value={headToHead.wins} color={colors.win} />
                      <RecordStat label={t("playerProfile.statLosses")} value={headToHead.losses} color={colors.loss} />
                      <RecordStat label={t("playerProfile.statDraws")} value={headToHead.draws} color={colors.draw} />
                    </View>
                    <View style={styles.recordRow}>
                      <RecordStat label={t("playerProfile.statGoalsFor")} value={headToHead.goalsFor} />
                      <RecordStat label={t("playerProfile.statGoalsAgainst")} value={headToHead.goalsAgainst} />
                      <RecordStat
                        label={t("playerProfile.statGoalDiff")}
                        value={headToHead.goalDifference > 0 ? `+${headToHead.goalDifference}` : headToHead.goalDifference}
                        color={headToHead.goalDifference > 0 ? colors.win : headToHead.goalDifference < 0 ? colors.loss : undefined}
                      />
                    </View>
                    <View style={styles.recordRow}>
                      <RecordStat
                        label={t("playerProfile.statAvgScored")}
                        value={headToHead.averageScoreFor !== null ? headToHead.averageScoreFor.toFixed(2) : "–"}
                      />
                      <RecordStat
                        label={t("playerProfile.statAvgConceded")}
                        value={headToHead.averageScoreAgainst !== null ? headToHead.averageScoreAgainst.toFixed(2) : "–"}
                      />
                      <RecordStat
                        label={t("playerProfile.statStreak")}
                        value={formatStreakLabel(t, headToHead.currentStreak.result, headToHead.currentStreak.count)}
                        color={headToHead.currentStreak.result === "win" ? colors.win : headToHead.currentStreak.result === "loss" ? colors.loss : undefined}
                      />
                    </View>
                    <View style={styles.bestWorst}>
                      <View style={styles.bestWorstRow}>
                        <Text style={styles.bestWorstLabel}>{t("playerProfile.largestVictoryLabel")}</Text>
                        {headToHead.largestVictory ? (
                          <Text style={styles.bestWorstValue}>
                            {headToHead.largestVictory.ownScore}-{headToHead.largestVictory.opponentScore}
                          </Text>
                        ) : (
                          <Text style={styles.bestWorstEmpty}>{t("playerProfile.noWinsYet")}</Text>
                        )}
                      </View>
                      <View style={styles.bestWorstRow}>
                        <Text style={styles.bestWorstLabel}>{t("playerProfile.largestDefeatLabel")}</Text>
                        {headToHead.largestDefeat ? (
                          <Text style={styles.bestWorstValue}>
                            {headToHead.largestDefeat.ownScore}-{headToHead.largestDefeat.opponentScore}
                          </Text>
                        ) : (
                          <Text style={styles.bestWorstEmpty}>{t("playerProfile.noLossesYet")}</Text>
                        )}
                      </View>
                    </View>
                  </View>
                ) : null}
              </Card>
            ) : (
              <Card>
                <Text style={styles.emptyChartsTitle}>{t("playerProfile.noOpponentsTitle")}</Text>
                <Text style={styles.emptyChartsMessage}>{t("playerProfile.noOpponentsMessage", { name: player.display_name })}</Text>
              </Card>
            )}
          </View>
        ) : null}

        {tab === "analytics" ? (
          <ErrorBoundary>
            <View style={styles.tabContent}>
              <Card>
                <Text style={styles.sectionTitle}>{t("playerAnalytics.sectionOverview")}</Text>
                <View style={styles.analyticsRangeRow}>
                  <AnalyticsRangeSelector value={analyticsRange} onChange={setAnalyticsRange} />
                </View>

                {matchHistory.isLoading ? (
                  <SkeletonList count={3} height={56} />
                ) : matchHistory.isError ? (
                  <InfoBanner tone="warning" message={t("playerAnalytics.loadFailed")} />
                ) : (
                  <>
                    {analyticsNotices.length > 0 ? (
                      <View style={styles.noticeStack}>
                        {analyticsNotices.map((notice) => (
                          <InfoBanner key={notice} tone={notice === "archivedPlayer" ? "warning" : "info"} message={analyticsNoticeText[notice]} />
                        ))}
                      </View>
                    ) : null}

                    <View style={styles.analyticsTileGrid}>
                      <StatTile label={t("playerAnalytics.statMatches")} value={playerAnalytics.overall.played} style={styles.analyticsTile} />
                      <StatTile
                        label={t("playerAnalytics.statWinRate")}
                        value={playerAnalytics.overall.winRate !== null ? `${Math.round(playerAnalytics.overall.winRate * 100)}%` : "–"}
                        style={styles.analyticsTile}
                      />
                      <StatTile label={t("playerAnalytics.statGoals")} value={playerAnalytics.goals.goalsScored} style={styles.analyticsTile} />
                      <StatTile
                        label={t("playerAnalytics.statGoalsPerMatch")}
                        value={playerAnalytics.goals.goalsPerMatch !== null ? playerAnalytics.goals.goalsPerMatch.toFixed(2) : "–"}
                        style={styles.analyticsTile}
                      />
                      <StatTile
                        label={t("playerAnalytics.statGoalDifference")}
                        value={(() => {
                          const diff = playerAnalytics.goals.goalsScored - playerAnalytics.goals.goalsConceded;
                          return diff > 0 ? `+${diff}` : `${diff}`;
                        })()}
                        style={styles.analyticsTile}
                      />
                      <StatTile
                        label={t("playerAnalytics.statCurrentStreak")}
                        value={streaks.currentStreak.count > 0 ? formatStreakLabel(t, streaks.currentStreak.result, streaks.currentStreak.count) : t("playerAnalytics.streakNone")}
                        style={styles.analyticsTile}
                      />
                    </View>
                    {playerAnalytics.overall.played > 0 ? (
                      <WinRateBreakdown wins={playerAnalytics.overall.wins} losses={playerAnalytics.overall.losses} draws={playerAnalytics.overall.draws} />
                    ) : null}

                    <RecentFormCard form={playerAnalytics.recentForm.form} />
                  </>
                )}
              </Card>

              {!matchHistory.isLoading && !matchHistory.isError ? (
                <Card>
                  <View style={styles.sectionTitleRow}>
                    <Text style={[styles.sectionTitle, styles.sectionTitleInRow]}>{t("trends.sectionTitle")}</Text>
                    <InfoTooltip
                      title={t("trends.sectionTitle")}
                      howCalculated={t("trends.infoHowCalculated")}
                      matchesIncluded={t("trends.infoMatchesIncluded")}
                      whenUpdates={t("trends.infoWhenUpdates")}
                      whyUseful={t("trends.infoWhyUseful")}
                    />
                  </View>
                  {playerTrend.direction === "insufficientData" ? (
                    <InfoBanner tone="info" message={t("trends.insufficientDataNotice")} />
                  ) : (
                    <View style={styles.trendSection}>
                      <MomentumIndicator
                        score={playerTrend.momentumScore}
                        direction={playerTrend.direction}
                        directionLabel={t(`trends.direction.${playerTrend.direction}`)}
                        label={t("trends.momentumLabel")}
                      />

                      <View style={styles.trendComparisons}>
                        <TrendComparisonRow
                          label={t("trends.winRateLabel")}
                          previousLabel={`${Math.round((playerTrend.previousWinRate ?? 0) * 100)}%`}
                          recentLabel={`${Math.round((playerTrend.recentWinRate ?? 0) * 100)}%`}
                          improved={compareNullable(playerTrend.recentWinRate, playerTrend.previousWinRate)}
                        />
                        <TrendComparisonRow
                          label={t("trends.goalsPerMatchLabel")}
                          previousLabel={playerTrend.previousGoalsPerMatch !== null ? playerTrend.previousGoalsPerMatch.toFixed(2) : "–"}
                          recentLabel={playerTrend.recentGoalsPerMatch !== null ? playerTrend.recentGoalsPerMatch.toFixed(2) : "–"}
                          improved={compareNullable(playerTrend.recentGoalsPerMatch, playerTrend.previousGoalsPerMatch)}
                        />
                      </View>

                      <View style={styles.trendScoreGrid}>
                        <TrendScoreCard label={t("trends.consistencyLabel")} score={playerTrend.consistencyScore} explanation={t(explainConsistency(playerTrend).key, explainConsistency(playerTrend).params)} />
                        <TrendScoreCard label={t("trends.activityLabel")} score={playerTrend.activityScore} explanation={t(explainActivity(playerTrend).key, explainActivity(playerTrend).params)} />
                        <TrendScoreCard label={t("trends.attackLabel")} score={playerTrend.attackScore} explanation={t(explainAttack(playerTrend).key, explainAttack(playerTrend).params)} />
                        <TrendScoreCard label={t("trends.defenceLabel")} score={playerTrend.defenceScore} explanation={t(explainDefence(playerTrend).key, explainDefence(playerTrend).params)} />
                      </View>

                      <TrendExplanationCard
                        title={t(`trends.direction.${playerTrend.direction}`)}
                        message={t(explainDirection(playerTrend).key, explainDirection(playerTrend).params)}
                      />
                      <Text style={styles.confidenceNote}>{t("trends.confidenceNotice", { matches: playerTrend.matchesConsidered, confidence: playerTrend.confidence })}</Text>
                    </View>
                  )}
                </Card>
              ) : null}

              {!matchHistory.isLoading && !matchHistory.isError ? (
                <>
                  <Card>
                    <Text style={styles.sectionTitle}>{t("playerAnalytics.sectionPerformance")}</Text>
                    <View style={styles.chartGroup}>
                      <Text style={styles.subLabel}>{t("playerAnalytics.chartPerformanceTimeline")}</Text>
                      <PerformanceTimelineChart
                        buckets={playerAnalytics.performanceTimeline}
                        emptyMessage={t("playerAnalytics.chartNoData")}
                        noDataLabel={t("playerAnalytics.chartNoDataPoint")}
                      />
                    </View>
                    {analyticsChartConfigs
                      .filter((cfg) => cfg.key === "matches" || cfg.key === "goals")
                      .map((cfg) => (
                        <AnalyticsTimelineSection key={cfg.key} config={cfg} t={t} />
                      ))}
                  </Card>

                  <Card>
                    <Text style={styles.sectionTitle}>{t("playerAnalytics.sectionTrends")}</Text>
                    {analyticsChartConfigs
                      .filter((cfg) => cfg.key === "winRate" || cfg.key === "goalDiff" || cfg.key === "rank")
                      .map((cfg) => (
                        <AnalyticsTimelineSection key={cfg.key} config={cfg} t={t} />
                      ))}
                  </Card>

                  <Card>
                    <Text style={styles.sectionTitle}>{t("playerAnalytics.sectionOpponents")}</Text>
                    <OpponentPerformanceList
                      opponents={playerAnalytics.opponents}
                      emptyMessage={t("playerAnalytics.opponentsEmpty")}
                      onSelectOpponent={(opponentId) => {
                        setHeadToHeadOpponentId(opponentId);
                        setTab("h2h");
                      }}
                    />
                  </Card>

                  <Card>
                    <Text style={styles.sectionTitle}>{t("playerAnalytics.sectionClubs")}</Text>
                    <ClubUsageList
                      clubs={playerAnalytics.clubUsage}
                      emptyMessage={t("playerAnalytics.clubsEmpty")}
                      playedLabel={t("playerAnalytics.clubsPlayedLabel")}
                      goalsLabel={t("playerAnalytics.clubsGoalsLabel")}
                    />
                  </Card>
                </>
              ) : null}
            </View>
          </ErrorBoundary>
        ) : null}

        <View style={styles.actions}>
          <Button label={t("playerProfile.shareCareerCardAction")} variant="secondary" onPress={handleShareCareerCard} loading={isSharing} />
          {canManage ? (
            <>
              <Button label={t("common.editPlayer")} variant="secondary" onPress={() => router.push(`/player/${player.id}/edit`)} />
              {player.is_active ? (
                <Button label={t("playerProfile.archivePlayerAction")} variant="danger" onPress={handleArchive} loading={archivePlayer.isPending} />
              ) : null}
            </>
          ) : null}
        </View>

        {/* Off-screen -- laid out for react-native-view-shot to capture, never shown directly. */}
        <View style={styles.offscreenCard} pointerEvents="none">
          <CareerSummaryCard
            ref={careerCardRef}
            data={{
              displayName: player.display_name,
              avatarUrl: player.avatar_url,
              color: player.custom_color,
              winRate: stats.winRate,
              played: stats.played,
              wins: stats.wins,
              losses: stats.losses,
              draws: stats.draws,
              currentStreak: streaks.currentStreak,
              headline: cardHeadline,
            }}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

/** true = recent is strictly better, false = strictly worse, null = equal or either side unknown. */
function compareNullable(recent: number | null, previous: number | null): boolean | null {
  if (recent === null || previous === null || recent === previous) return null;
  return recent > previous;
}

function RecordStat({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <View style={styles.recordStat}>
      <Text style={[styles.recordValue, color ? { color } : null]}>{value}</Text>
      <Text style={styles.recordLabel}>{label}</Text>
    </View>
  );
}

/** One titled TimelineChart, with its accessibility summary sentence built from the chart's own trend once (memoized per config/points). */
function AnalyticsTimelineSection({ config, t }: { config: AnalyticsChartConfig; t: (key: string, params?: Record<string, string | number>) => string }) {
  const trend = useMemo(() => {
    const valid = config.isValueValid ? config.points.filter(config.isValueValid) : config.points;
    return summarizeTimelineTrend(valid);
  }, [config.points, config.isValueValid]);

  const title = t(config.titleKey);
  const summary = trend
    ? t("playerAnalytics.chartSummaryA11y", {
        metric: title,
        firstValue: config.formatValue(trend.first.value),
        firstLabel: trend.first.label,
        lastValue: config.formatValue(trend.last.value),
        lastLabel: trend.last.label,
        min: config.formatValue(trend.min),
        max: config.formatValue(trend.max),
      })
    : null;

  return (
    <View style={styles.chartGroup}>
      <Text style={styles.subLabel}>{title}</Text>
      <TimelineChart
        points={config.points}
        formatValue={config.formatValue}
        emptyMessage={t("playerAnalytics.chartNoData")}
        noDataLabel={config.key === "rank" ? t("playerAnalytics.rankNotQualified") : t("playerAnalytics.chartNoDataPoint")}
        accessibilitySummary={summary}
        invert={config.invert}
        isValueValid={config.isValueValid}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.xxl,
  },
  content: {
    paddingBottom: spacing.xl,
  },
  hero: {
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  changePhoto: {
    ...typography.small,
    color: colors.accent,
    textAlign: "center",
    marginTop: spacing.xs,
  },
  name: {
    ...typography.title,
    marginTop: spacing.sm,
  },
  nickname: {
    ...typography.caption,
  },
  heroBadgeRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  formPlaceholder: {
    height: 28,
    marginTop: spacing.sm,
  },
  tileGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  tile: {
    flexBasis: "47%",
  },
  tabRow: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  tabContent: {
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  sectionTitle: {
    ...typography.heading,
    marginBottom: spacing.sm,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  sectionTitleInRow: {
    marginBottom: 0,
  },
  heroWinRateBreakdown: {
    marginTop: -spacing.sm,
  },
  recordRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  recordStat: {
    alignItems: "center",
    gap: 2,
  },
  recordValue: {
    ...typography.heading,
  },
  recordLabel: {
    ...typography.small,
  },
  actions: {
    gap: spacing.md,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  offscreenCard: {
    position: "absolute",
    top: -9999,
    left: -9999,
  },
  errorText: {
    ...typography.caption,
    color: colors.danger,
  },
  streakRow: {
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  streakText: {
    ...typography.caption,
  },
  streakWin: {
    color: colors.win,
    fontWeight: "700",
  },
  streakLoss: {
    color: colors.loss,
    fontWeight: "700",
  },
  bestWorst: {
    gap: spacing.sm,
  },
  bestWorstRow: {
    gap: 2,
  },
  bestWorstLabel: {
    ...typography.small,
  },
  bestWorstValue: {
    ...typography.bodyStrong,
  },
  bestWorstEmpty: {
    ...typography.caption,
  },
  highlightsList: {
    gap: spacing.sm,
  },
  highlightText: {
    ...typography.body,
  },
  recordHeldRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  recordHeldLabel: {
    ...typography.body,
    flexShrink: 1,
  },
  recordHeldValue: {
    ...typography.bodyStrong,
    color: colors.gold,
  },
  achievementRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  achievementIcon: {
    fontSize: 20,
  },
  achievementInfo: {
    flex: 1,
    gap: 2,
  },
  achievementLabel: {
    ...typography.bodyStrong,
  },
  achievementDescription: {
    ...typography.small,
  },
  achievementDate: {
    ...typography.small,
  },
  progressionSection: {
    gap: spacing.md,
  },
  subLabel: {
    ...typography.small,
    marginBottom: spacing.xs,
  },
  insufficientData: {
    ...typography.caption,
  },
  h2hRow: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  h2hPrompt: {
    ...typography.caption,
    textAlign: "center",
    marginTop: spacing.md,
  },
  emptyChartsTitle: {
    ...typography.bodyStrong,
    textAlign: "center",
  },
  emptyChartsMessage: {
    ...typography.caption,
    textAlign: "center",
    marginTop: spacing.xs,
  },
  analyticsRangeRow: {
    marginBottom: spacing.md,
  },
  noticeStack: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  analyticsTileGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  analyticsTile: {
    flexBasis: "31%",
  },
  chartGroup: {
    marginBottom: spacing.lg,
  },
  trendSection: {
    gap: spacing.lg,
  },
  trendComparisons: {
    gap: spacing.xs,
  },
  trendScoreGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  confidenceNote: {
    ...typography.small,
    textAlign: "center",
  },
});
