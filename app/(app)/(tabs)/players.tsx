import { memo, useMemo, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { FlatList, Pressable, RefreshControl, StyleSheet, Switch, Text, View } from "react-native";
import { Avatar } from "../../../src/components/Avatar";
import { Badge } from "../../../src/components/Badge";
import { EmptyState } from "../../../src/components/EmptyState";
import { ErrorState } from "../../../src/components/ErrorState";
import { ExportButton } from "../../../src/components/ExportButton";
import { ListSeparator } from "../../../src/components/ListSeparator";
import { Screen } from "../../../src/components/Screen";
import { SkeletonList } from "../../../src/components/Skeleton";
import { useFocusFrozenValue } from "../../../src/hooks/useFocusFrozenValue";
import { useGroup } from "../../../src/hooks/useGroup";
import { useGroupMatchHistory } from "../../../src/hooks/useMatches";
import { usePlayers } from "../../../src/hooks/usePlayers";
import { playerStatsToCsv } from "../../../src/lib/csv";
import { useTranslation } from "../../../src/lib/i18n";
import { computeAllPlayerStats, type PlayerStats } from "../../../src/lib/stats";
import type { MatchSummary } from "../../../src/lib/matches";
import type { PlayerProfile } from "../../../src/lib/types/database";
import { colors, radius, spacing, typography } from "../../../src/theme";

// Stable fallback references so `data ?? []` doesn't allocate a fresh empty
// array every render while a query is still loading (see leaderboards.tsx).
const EMPTY_PLAYERS: PlayerProfile[] = [];
const EMPTY_MATCHES: MatchSummary[] = [];

export default function PlayersScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { currentGroupId } = useGroup();
  const { includeArchived: includeArchivedParam } = useLocalSearchParams<{ includeArchived?: string }>();
  // Lets League Management's "View archived players" link land here with the
  // toggle already on -- read once on mount, same as any other deep-link prefill.
  const [includeArchived, setIncludeArchived] = useState(includeArchivedParam === "1");
  const { data: players, isLoading, isError, refetch, isRefetching } = usePlayers(currentGroupId, includeArchived);
  const matchHistory = useGroupMatchHistory(currentGroupId);
  // Frozen while this tab is buried under a pushed screen -- see
  // useFocusFrozenValue / app/(app)/(tabs)/index.tsx for the full rationale.
  const matches = useFocusFrozenValue(matchHistory.data ?? EMPTY_MATCHES);
  const statsById = useMemo(
    () => computeAllPlayerStats((players ?? EMPTY_PLAYERS).map((p) => p.id), matches),
    [players, matches],
  );

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <Text style={styles.title}>{t("players.title")}</Text>
        <View style={styles.headerActions}>
          {players && players.length > 0 ? (
            <ExportButton
              label={t("players.export")}
              filename="fc-rival-player-stats.csv"
              getCsv={() => playerStatsToCsv(players, matches)}
            />
          ) : null}
          <Pressable
            onPress={() => router.push("/player/new")}
            style={styles.addButton}
            accessibilityRole="button"
            accessibilityLabel={t("common.addPlayer")}
          >
            <Text style={styles.addButtonLabel}>{t("players.addButtonLabel")}</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.archivedToggleRow}>
        <Text style={styles.archivedToggleLabel}>{t("draw.includeArchived")}</Text>
        <Switch value={includeArchived} onValueChange={setIncludeArchived} trackColor={{ false: colors.border, true: colors.accentMuted }} thumbColor={colors.textPrimary} />
      </View>

      {isLoading ? (
        <View style={styles.listPadding}>
          <SkeletonList count={6} height={64} />
        </View>
      ) : isError ? (
        <ErrorState message={t("players.loadError")} onRetry={refetch} />
      ) : (
        <FlatList
          data={players}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listPadding}
          refreshControl={<RefreshControl tintColor={colors.accent} refreshing={isRefetching} onRefresh={refetch} />}
          ItemSeparatorComponent={ListSeparator}
          renderItem={({ item }) => <PlayerRow player={item} stats={statsById.get(item.id) ?? null} />}
          ListEmptyComponent={
            <EmptyState
              icon="🧑‍🤝‍🧑"
              title={t("players.emptyTitle")}
              message={t("players.emptyMessage")}
              actionLabel={t("common.addPlayer")}
              onAction={() => router.push("/player/new")}
            />
          }
        />
      )}
    </Screen>
  );
}

const PlayerRow = memo(function PlayerRow({ player, stats }: { player: PlayerProfile; stats: PlayerStats | null }) {
  const { t } = useTranslation();
  const router = useRouter();
  const winRateLabel = stats && stats.winRate !== null ? `${Math.round(stats.winRate * 100)}%` : "–";
  return (
    <Pressable
      onPress={() => router.push(`/player/${player.id}`)}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      accessibilityRole="button"
      accessibilityLabel={t("players.rowA11yLabel", { name: player.display_name, winRate: winRateLabel, played: stats?.played ?? 0 })}
    >
      <Avatar uri={player.avatar_url} name={player.display_name} color={player.custom_color} size={44} />
      <View style={styles.rowInfo}>
        <View style={styles.rowNameRow}>
          <Text style={styles.rowName} numberOfLines={1}>{player.display_name}</Text>
          {!player.is_active ? <Badge label={t("players.archivedBadge")} tone="warning" /> : null}
        </View>
        {player.nickname ? <Text style={styles.rowNickname}>"{player.nickname}"</Text> : null}
      </View>
      <View style={styles.statGroup}>
        <Text style={styles.statValue}>{winRateLabel}</Text>
        <Text style={styles.statLabel}>{t("players.winRate")}</Text>
      </View>
      <View style={styles.statGroup}>
        <Text style={styles.statValue}>{stats?.played ?? 0}</Text>
        <Text style={styles.statLabel}>{t("players.played")}</Text>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  title: {
    ...typography.title,
  },
  addButton: {
    backgroundColor: colors.accentSubtle,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  addButtonLabel: {
    color: colors.accent,
    fontWeight: "700",
  },
  archivedToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  archivedToggleLabel: {
    ...typography.caption,
  },
  listPadding: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing.md,
  },
  rowPressed: {
    opacity: 0.8,
  },
  rowInfo: {
    flex: 1,
    gap: 2,
  },
  rowNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  rowName: {
    ...typography.bodyStrong,
    flexShrink: 1,
  },
  rowNickname: {
    ...typography.small,
  },
  statGroup: {
    alignItems: "center",
    minWidth: 44,
  },
  statValue: {
    ...typography.bodyStrong,
    color: colors.accent,
  },
  statLabel: {
    ...typography.small,
  },
});
