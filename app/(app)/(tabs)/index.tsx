import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import type { ComponentProps, ReactNode } from "react";
import { useMemo } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { AnimatedNumber } from "../../../src/components/AnimatedNumber";
import { Avatar } from "../../../src/components/Avatar";
import { Badge, rankBadgeTone } from "../../../src/components/Badge";
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
import { DEFAULT_MATCH_FILTERS, filterMatches } from "../../../src/lib/matchFilters";
import { matchSideLabel, formatRelativeDate } from "../../../src/lib/format";
import {
  computeLastNStats,
  computeMonthlyLeaderboard,
  computeMostMatchesLeaderboard,
  computePlayerStats,
  computeStreaks,
  computeWinRateLeaderboard,
  computeWinRateRank,
  WIN_RATE_MIN_PLAYED,
} from "../../../src/lib/stats";
import type { MatchSummary } from "../../../src/lib/matches";
import type { PlayerProfile } from "../../../src/lib/types/database";
import { colors, iconSize, radius, spacing, typography } from "../../../src/theme";

const RANKINGS_PREVIEW = 5;
const MATCHES_PREVIEW = 5;
const ACTIVE_PREVIEW = 3;
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
  const myPlayer = roster.find((p) => p.linked_user_id === user?.id) ?? null;

  const myStreak = useMemo(() => (myPlayer ? computeStreaks(myPlayer.id, allMatches) : null), [myPlayer, allMatches]);
  const myForm = useMemo(() => (myPlayer ? computeLastNStats(myPlayer.id, allMatches, 5) : null), [myPlayer, allMatches]);
  const myStats = useMemo(() => (myPlayer ? computePlayerStats(myPlayer.id, allMatches) : null), [myPlayer, allMatches]);
  const myRank = useMemo(() => (myPlayer ? computeWinRateRank(myPlayer.id, roster, allMatches) : null), [myPlayer, roster, allMatches]);
  const winRateLeaders = useMemo(() => computeWinRateLeaderboard(roster, allMatches), [roster, allMatches]);

  const mostActive = useMemo(() => computeMostMatchesLeaderboard(roster, allMatches).slice(0, ACTIVE_PREVIEW), [roster, allMatches]);

  const matchesThisMonth = useMemo(() => filterMatches(allMatches, { ...DEFAULT_MATCH_FILTERS, dateRange: "month" }), [allMatches]);
  const monthlyTop = useMemo(() => {
    const now = new Date();
    return computeMonthlyLeaderboard(roster, allMatches, now.getFullYear(), now.getMonth())[0] ?? null;
  }, [roster, allMatches]);
  const topPerformer = winRateLeaders[0] ?? null;

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
                  <Text style={styles.heroName}>{myPlayer.display_name}</Text>
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
          <QuickAction icon="add-circle" label={t("home.quickActionRecord")} onPress={() => router.push("/record-match")} />
          <QuickAction icon="person-add" label={t("home.quickActionAddPlayer")} onPress={() => router.push("/player/new")} />
          <QuickAction icon="trophy" label={t("home.quickActionLeaderboards")} onPress={() => router.push("/leaderboards")} />
          <QuickAction icon="time" label={t("home.quickActionHistory")} onPress={() => router.push("/history")} />
        </View>

        {isLoading ? (
          <SkeletonList count={4} />
        ) : isError ? (
          <ErrorState message="Couldn't load your dashboard. Check your connection and try again." onRetry={handleRefresh} />
        ) : (
          <>
            <View style={styles.statTileRow}>
              <StatTile label="Matches" value={allMatches.length} />
              <StatTile label="Players" value={roster.length} />
              <StatTile label="This month" value={matchesThisMonth.length} />
            </View>

            {topPerformer || monthlyTop ? (
              <View style={styles.highlightRow}>
                {topPerformer ? (
                  <Card compact variant="elevated" style={styles.highlightCard}>
                    <Text style={styles.highlightLabel}>{t("home.topPerformer")}</Text>
                    <Text style={styles.highlightName} numberOfLines={1}>
                      {topPerformer.playerName}
                    </Text>
                    <Badge label={`${topPerformer.valueLabel} win rate`} tone="gold" />
                  </Card>
                ) : null}
                {monthlyTop ? (
                  <Card compact variant="elevated" style={styles.highlightCard}>
                    <Text style={styles.highlightLabel}>{t("home.topThisMonth")}</Text>
                    <Text style={styles.highlightName} numberOfLines={1}>
                      {monthlyTop.playerName}
                    </Text>
                    <Badge label={monthlyTop.valueLabel} tone="accent" />
                  </Card>
                ) : null}
              </View>
            ) : null}

            {mostActive.length > 0 ? (
              <Section
                title={t("home.mostActive")}
                seeAllLabel={t("home.seeAll")}
                onSeeAll={() => router.push("/leaderboards")}
                isEmpty={false}
                emptyProps={{ title: "" }}
              >
                {mostActive.map((row, index) => (
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
            ) : null}

            <Section
              title={t("home.rankings")}
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

function QuickAction({ icon, label, onPress }: { icon: ComponentProps<typeof Ionicons>["name"]; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.quickAction, pressed && styles.quickActionPressed]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={styles.quickActionIcon}>
        <Ionicons name={icon} size={iconSize.md} color={colors.accent} />
      </View>
      <Text style={styles.quickActionLabel} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
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
    gap: spacing.sm,
  },
  quickAction: {
    flex: 1,
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  quickActionPressed: {
    backgroundColor: colors.surfaceElevated,
  },
  quickActionIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  quickActionLabel: {
    ...typography.small,
    textAlign: "center",
  },
  statTileRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  highlightRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  highlightCard: {
    flex: 1,
    gap: spacing.xs,
  },
  highlightLabel: {
    ...typography.eyebrow,
  },
  highlightName: {
    ...typography.bodyStrong,
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
