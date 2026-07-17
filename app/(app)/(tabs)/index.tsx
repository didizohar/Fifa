import { useRouter } from "expo-router";
import type { ComponentProps, ReactNode } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Button } from "../../../src/components/Button";
import { EmptyState } from "../../../src/components/EmptyState";
import { ErrorState } from "../../../src/components/ErrorState";
import { MatchRow } from "../../../src/components/MatchRow";
import { RankingRow } from "../../../src/components/RankingRow";
import { Screen } from "../../../src/components/Screen";
import { SkeletonList } from "../../../src/components/Skeleton";
import { useGroup } from "../../../src/hooks/useGroup";
import { useMatches, usePlayerRecords } from "../../../src/hooks/useMatches";
import { usePlayers } from "../../../src/hooks/usePlayers";
import { matchSideLabel, formatRelativeDate } from "../../../src/lib/format";
import { colors, spacing, typography } from "../../../src/theme";

const RANKINGS_PREVIEW = 5;
const MATCHES_PREVIEW = 5;

export default function HomeScreen() {
  const router = useRouter();
  const { currentGroup } = useGroup();
  const groupId = currentGroup?.id ?? null;

  const players = usePlayers(groupId);
  const matches = useMatches(groupId, MATCHES_PREVIEW);
  const rankingPreviewIds = (players.data ?? []).slice(0, RANKINGS_PREVIEW).map((p) => p.id);
  const records = usePlayerRecords(rankingPreviewIds);

  const isLoading = players.isLoading || matches.isLoading;
  const isError = players.isError || matches.isError;
  const isRefetching = players.isRefetching || matches.isRefetching;

  const handleRefresh = () => {
    players.refetch();
    matches.refetch();
    records.refetch();
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

        <Button label="＋ Record match" onPress={() => router.push("/record-match")} />

        {isLoading ? (
          <SkeletonList count={4} />
        ) : isError ? (
          <ErrorState message="Couldn't load your dashboard." onRetry={handleRefresh} />
        ) : (
          <>
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
    gap: spacing.xl,
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
