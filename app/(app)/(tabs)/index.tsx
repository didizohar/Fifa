import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import type { ComponentProps, ReactNode } from "react";
import { useMemo } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Card } from "../../../src/components/Card";
import { EmptyState } from "../../../src/components/EmptyState";
import { ErrorState } from "../../../src/components/ErrorState";
import { FormStrip } from "../../../src/components/FormStrip";
import { MatchRow } from "../../../src/components/MatchRow";
import { RankingRow } from "../../../src/components/RankingRow";
import { Screen } from "../../../src/components/Screen";
import { SkeletonList } from "../../../src/components/Skeleton";
import { StatTile } from "../../../src/components/StatTile";
import { useAuth } from "../../../src/hooks/useAuth";
import { useGroup } from "../../../src/hooks/useGroup";
import { useGroupMatchHistory, useMatches, usePlayerRecords } from "../../../src/hooks/useMatches";
import { usePlayers } from "../../../src/hooks/usePlayers";
import { DEFAULT_MATCH_FILTERS, filterMatches } from "../../../src/lib/matchFilters";
import { matchSideLabel, formatRelativeDate } from "../../../src/lib/format";
import { computeLastNStats, computeMonthlyLeaderboard, computeMostMatchesLeaderboard, computeStreaks } from "../../../src/lib/stats";
import { colors, radius, spacing, typography } from "../../../src/theme";

const RANKINGS_PREVIEW = 5;
const MATCHES_PREVIEW = 5;
const ACTIVE_PREVIEW = 3;

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { currentGroup } = useGroup();
  const groupId = currentGroup?.id ?? null;

  const players = usePlayers(groupId);
  const matches = useMatches(groupId, MATCHES_PREVIEW);
  const fullHistory = useGroupMatchHistory(groupId);
  const rankingPreviewIds = (players.data ?? []).slice(0, RANKINGS_PREVIEW).map((p) => p.id);
  const records = usePlayerRecords(rankingPreviewIds);

  const isLoading = players.isLoading || matches.isLoading;
  const isError = players.isError || matches.isError;
  const isRefetching = players.isRefetching || matches.isRefetching;

  const roster = players.data ?? [];
  const allMatches = fullHistory.data ?? [];
  const myPlayer = roster.find((p) => p.linked_user_id === user?.id) ?? null;

  const myStreak = useMemo(() => (myPlayer ? computeStreaks(myPlayer.id, allMatches) : null), [myPlayer, allMatches]);
  const myForm = useMemo(() => (myPlayer ? computeLastNStats(myPlayer.id, allMatches, 5) : null), [myPlayer, allMatches]);

  const mostActive = useMemo(() => computeMostMatchesLeaderboard(roster, allMatches).slice(0, ACTIVE_PREVIEW), [roster, allMatches]);

  const matchesThisMonth = useMemo(() => filterMatches(allMatches, { ...DEFAULT_MATCH_FILTERS, dateRange: "month" }), [allMatches]);
  const monthlyTop = useMemo(() => {
    const now = new Date();
    return computeMonthlyLeaderboard(roster, allMatches, now.getFullYear(), now.getMonth())[0] ?? null;
  }, [roster, allMatches]);

  const handleRefresh = () => {
    players.refetch();
    matches.refetch();
    records.refetch();
    fullHistory.refetch();
  };

  return (
    <Screen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl tintColor={colors.accent} refreshing={isRefetching} onRefresh={handleRefresh} />}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{currentGroup?.name}</Text>
            <Text style={styles.subtitle}>Dashboard</Text>
          </View>
        </View>

        <View style={styles.quickActions}>
          <QuickAction icon="add-circle" label="Record" onPress={() => router.push("/record-match")} />
          <QuickAction icon="person-add" label="Add player" onPress={() => router.push("/player/new")} />
          <QuickAction icon="trophy" label="Leaderboards" onPress={() => router.push("/leaderboards")} />
          <QuickAction icon="time" label="History" onPress={() => router.push("/history")} />
        </View>

        {isLoading ? (
          <SkeletonList count={4} />
        ) : isError ? (
          <ErrorState message="Couldn't load your dashboard." onRetry={handleRefresh} />
        ) : (
          <>
            <View style={styles.statTileRow}>
              <StatTile label="Matches" value={allMatches.length} />
              <StatTile label="Players" value={roster.length} />
              <StatTile label="This month" value={matchesThisMonth.length} />
            </View>


            {myPlayer && myStreak && myForm ? (
              <Card variant="glow">
                <Text style={styles.sectionTitle}>Your form</Text>
                <View style={styles.yourFormRow}>
                  <FormStrip results={myForm.form.map((f) => f.result)} />
                  <Text style={styles.streakBadge}>
                    {myStreak.currentStreak.count > 0
                      ? `${myStreak.currentStreak.count} ${myStreak.currentStreak.result} streak`
                      : "No streak yet"}
                  </Text>
                </View>
              </Card>
            ) : null}

            {mostActive.length > 0 ? (
              <Section title="Most active" onSeeAll={() => router.push("/leaderboards")} isEmpty={false} emptyProps={{ title: "" }}>
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

            {monthlyTop ? (
              <Card compact>
                <View style={styles.monthlyRow}>
                  <View>
                    <Text style={styles.monthlyLabel}>Top this month</Text>
                    <Text style={styles.monthlyName}>{monthlyTop.playerName}</Text>
                  </View>
                  <Text style={styles.monthlyValue}>{monthlyTop.valueLabel}</Text>
                </View>
              </Card>
            ) : null}

            <Section
              title="Rankings"
              onSeeAll={() => router.push("/leaderboards")}
              isEmpty={(players.data ?? []).length === 0}
              emptyProps={{
                icon: "🏆",
                title: "No rankings yet",
                message: "Add players to start tracking Elo ratings.",
                actionLabel: "Add player",
                onAction: () => router.push("/player/new"),
              }}
            >
              {(players.data ?? []).slice(0, RANKINGS_PREVIEW).map((player, index) => {
                const stats = records.data?.get(player.id) ?? null;
                const matchesPlayed = stats?.played ?? 0;
                const winRate = stats?.winRate ?? null;
                return (
                  <RankingRow
                    key={player.id}
                    rank={index + 1}
                    name={player.display_name}
                    avatarUrl={player.avatar_url}
                    color={player.custom_color}
                    value={player.singles_elo}
                    detail={matchesPlayed === 0 ? "No matches yet" : `${matchesPlayed} played · ${winRate !== null ? Math.round(winRate * 100) : 0}% win`}
                    onPress={() => router.push(`/player/${player.id}`)}
                  />
                );
              })}
            </Section>

            <Section
              title="Recent matches"
              onSeeAll={() => router.push("/history")}
              isEmpty={(matches.data ?? []).length === 0}
              emptyProps={{
                icon: "⚽️",
                title: "No matches yet",
                message: "Record your group's first match to see it here.",
                actionLabel: "Record match",
                onAction: () => router.push("/record-match"),
              }}
            >
              {(matches.data ?? []).slice(0, MATCHES_PREVIEW).map((match) => {
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
    <Pressable onPress={onPress} style={({ pressed }) => [styles.quickAction, pressed && styles.quickActionPressed]}>
      <View style={styles.quickActionIcon}>
        <Ionicons name={icon} size={20} color={colors.accent} />
      </View>
      <Text style={styles.quickActionLabel} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function Section({
  title,
  onSeeAll,
  isEmpty,
  emptyProps,
  children,
}: {
  title: string;
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
            See all
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
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  greeting: {
    ...typography.title,
  },
  subtitle: {
    ...typography.caption,
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
  yourFormRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.sm,
  },
  streakBadge: {
    ...typography.caption,
    color: colors.accent,
    fontWeight: "700",
  },
  monthlyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  monthlyLabel: {
    ...typography.small,
  },
  monthlyName: {
    ...typography.bodyStrong,
  },
  monthlyValue: {
    ...typography.heading,
    color: colors.accent,
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
