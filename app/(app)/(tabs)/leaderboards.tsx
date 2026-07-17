import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Avatar } from "../../../src/components/Avatar";
import { Card } from "../../../src/components/Card";
import { EmptyState } from "../../../src/components/EmptyState";
import { ErrorState } from "../../../src/components/ErrorState";
import { RankingRow } from "../../../src/components/RankingRow";
import { Screen } from "../../../src/components/Screen";
import { SkeletonList } from "../../../src/components/Skeleton";
import { useGroup } from "../../../src/hooks/useGroup";
import { useGroupMatchHistory } from "../../../src/hooks/useMatches";
import { usePlayers } from "../../../src/hooks/usePlayers";
import {
  computeBestDoublesPairs,
  computeEloLeaderboard,
  computeFewestConcededLeaderboard,
  computeGoalsScoredLeaderboard,
  computeLongestStreakLeaderboard,
  computeMonthlyLeaderboard,
  computeMostMatchesLeaderboard,
  computeWinRateLeaderboard,
  type LeaderboardRow,
} from "../../../src/lib/stats";
import { colors, radius, spacing, typography } from "../../../src/theme";

type Category = "elo" | "winRate" | "mostMatches" | "streaks" | "goalsScored" | "goalsConceded" | "doublesPairs" | "monthly";

const CATEGORIES: { id: Category; label: string }[] = [
  { id: "elo", label: "Elo" },
  { id: "winRate", label: "Win %" },
  { id: "mostMatches", label: "Most Matches" },
  { id: "streaks", label: "Streaks" },
  { id: "goalsScored", label: "Goals Scored" },
  { id: "goalsConceded", label: "Best Defense" },
  { id: "doublesPairs", label: "Doubles Pairs" },
  { id: "monthly", label: "Monthly" },
];

const MONTH_LABEL = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });

export default function LeaderboardsScreen() {
  const router = useRouter();
  const { currentGroup } = useGroup();
  const groupId = currentGroup?.id ?? null;

  const players = usePlayers(groupId);
  const matchHistory = useGroupMatchHistory(groupId);

  const [category, setCategory] = useState<Category>("elo");
  const [eloField, setEloField] = useState<"singles" | "doubles">("singles");
  const [monthOffset, setMonthOffset] = useState(0);

  const roster = players.data ?? [];
  const matches = matchHistory.data ?? [];

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
          roster.map((p) => ({
            id: p.id,
            displayName: p.display_name,
            avatarUrl: p.avatar_url,
            color: p.custom_color,
            elo: eloField === "singles" ? p.singles_elo : p.doubles_elo,
          })),
        );
      case "winRate":
        return computeWinRateLeaderboard(roster, matches);
      case "mostMatches":
        return computeMostMatchesLeaderboard(roster, matches);
      case "streaks":
        return computeLongestStreakLeaderboard(roster, matches);
      case "goalsScored":
        return computeGoalsScoredLeaderboard(roster, matches);
      case "goalsConceded":
        return computeFewestConcededLeaderboard(roster, matches);
      case "monthly":
        return computeMonthlyLeaderboard(roster, matches, monthTarget.getFullYear(), monthTarget.getMonth());
      case "doublesPairs":
        return [];
    }
  }, [category, roster, matches, eloField, monthTarget]);

  const doublesPairs = useMemo(() => (category === "doublesPairs" ? computeBestDoublesPairs(matches) : []), [category, matches]);

  const isLoading = players.isLoading || matchHistory.isLoading;
  const isError = players.isError || matchHistory.isError;

  const handleRefresh = () => {
    players.refetch();
    matchHistory.refetch();
  };

  const isFutureMonth = monthOffset <= 0;

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>Leaderboards</Text>
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

      {category === "elo" ? (
        <View style={styles.subToggleRow}>
          <SubToggle label="Singles" active={eloField === "singles"} onPress={() => setEloField("singles")} />
          <SubToggle label="Doubles" active={eloField === "doubles"} onPress={() => setEloField("doubles")} />
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
          doublesPairs.length === 0 ? (
            <EmptyState icon="🤝" title="No doubles pairs yet" message="Play a few doubles matches together to see this leaderboard." />
          ) : (
            <View style={styles.list}>
              {doublesPairs.map((pair, index) => (
                <Card key={pair.playerIds.join(":")} style={styles.pairCard}>
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
        ) : rows.length === 0 ? (
          <EmptyState icon="🏆" title="Not enough data yet" message="Play more matches to populate this leaderboard." />
        ) : (
          <View style={styles.list}>
            {rows.map((row, index) => (
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
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

function SubToggle({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.subToggle, active && styles.subToggleActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.subToggleLabel, active && styles.subToggleLabelActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingBottom: spacing.sm,
  },
  title: {
    ...typography.title,
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
    flexDirection: "row",
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  subToggle: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  subToggleActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSubtle,
  },
  subToggleLabel: {
    ...typography.caption,
  },
  subToggleLabelActive: {
    color: colors.accent,
    fontWeight: "700",
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
    padding: spacing.md,
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
