import { useRouter } from "expo-router";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { Avatar } from "../../../src/components/Avatar";
import { EmptyState } from "../../../src/components/EmptyState";
import { ErrorState } from "../../../src/components/ErrorState";
import { ExportButton } from "../../../src/components/ExportButton";
import { Screen } from "../../../src/components/Screen";
import { SkeletonList } from "../../../src/components/Skeleton";
import { useGroup } from "../../../src/hooks/useGroup";
import { useGroupMatchHistory } from "../../../src/hooks/useMatches";
import { usePlayers } from "../../../src/hooks/usePlayers";
import { playerStatsToCsv } from "../../../src/lib/csv";
import type { PlayerProfile } from "../../../src/lib/types/database";
import { colors, radius, spacing, typography } from "../../../src/theme";

export default function PlayersScreen() {
  const router = useRouter();
  const { currentGroupId } = useGroup();
  const { data: players, isLoading, isError, refetch, isRefetching } = usePlayers(currentGroupId);
  const matchHistory = useGroupMatchHistory(currentGroupId);

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <Text style={styles.title}>Players</Text>
        <View style={styles.headerActions}>
          {players && players.length > 0 ? (
            <ExportButton
              label="Export"
              filename="fc-rival-player-stats.csv"
              getCsv={() => playerStatsToCsv(players, matchHistory.data ?? [])}
            />
          ) : null}
          <Pressable onPress={() => router.push("/player/new")} style={styles.addButton}>
            <Text style={styles.addButtonLabel}>+ Add</Text>
          </Pressable>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.listPadding}>
          <SkeletonList count={6} height={64} />
        </View>
      ) : isError ? (
        <ErrorState message="Couldn't load players." onRetry={refetch} />
      ) : (
        <FlatList
          data={players}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listPadding}
          refreshControl={<RefreshControl tintColor={colors.accent} refreshing={isRefetching} onRefresh={refetch} />}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          renderItem={({ item }) => <PlayerRow player={item} onPress={() => router.push(`/player/${item.id}`)} />}
          ListEmptyComponent={
            <EmptyState
              icon="🧑‍🤝‍🧑"
              title="No players yet"
              message="Add your first player to start recording matches."
              actionLabel="Add player"
              onAction={() => router.push("/player/new")}
            />
          }
        />
      )}
    </Screen>
  );
}

function PlayerRow({ player, onPress }: { player: PlayerProfile; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      <Avatar uri={player.avatar_url} name={player.display_name} color={player.custom_color} size={44} />
      <View style={styles.rowInfo}>
        <Text style={styles.rowName} numberOfLines={1}>{player.display_name}</Text>
        {player.nickname ? <Text style={styles.rowNickname}>"{player.nickname}"</Text> : null}
      </View>
      <View style={styles.eloGroup}>
        <Text style={styles.eloValue}>{player.singles_elo}</Text>
        <Text style={styles.eloLabel}>1v1</Text>
      </View>
      <View style={styles.eloGroup}>
        <Text style={styles.eloValue}>{player.doubles_elo}</Text>
        <Text style={styles.eloLabel}>2v2</Text>
      </View>
    </Pressable>
  );
}

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
  rowName: {
    ...typography.bodyStrong,
  },
  rowNickname: {
    ...typography.small,
  },
  eloGroup: {
    alignItems: "center",
    minWidth: 44,
  },
  eloValue: {
    ...typography.bodyStrong,
    color: colors.accent,
  },
  eloLabel: {
    ...typography.small,
  },
});
