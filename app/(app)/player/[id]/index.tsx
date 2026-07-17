import { useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Avatar } from "../../../../src/components/Avatar";
import { Button } from "../../../../src/components/Button";
import { Card } from "../../../../src/components/Card";
import { ErrorState } from "../../../../src/components/ErrorState";
import { Screen } from "../../../../src/components/Screen";
import { Skeleton } from "../../../../src/components/Skeleton";
import { useAuth } from "../../../../src/hooks/useAuth";
import { useGroup } from "../../../../src/hooks/useGroup";
import { usePlayerRecords } from "../../../../src/hooks/useMatches";
import { useArchivePlayer, useUpdatePlayer } from "../../../../src/hooks/usePlayerMutations";
import { usePlayer } from "../../../../src/hooks/usePlayers";
import { confirmAction, notify } from "../../../../src/lib/confirm";
import { pickAndUploadAvatar } from "../../../../src/lib/storage";
import { colors, spacing, typography } from "../../../../src/theme";

export default function PlayerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { currentGroupId, currentRole } = useGroup();
  const { data: player, isLoading, isError, refetch } = usePlayer(id);
  const records = usePlayerRecords(id ? [id] : []);
  const updatePlayer = useUpdatePlayer(currentGroupId);
  const archivePlayer = useArchivePlayer(currentGroupId);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

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
        <ErrorState message="Couldn't load this player." onRetry={refetch} />
      </Screen>
    );
  }

  const canManage = currentRole === "owner" || currentRole === "admin" || player.linked_user_id === user?.id;
  const stats = records.data?.get(player.id) ?? null;

  const handleAvatarPress = async () => {
    if (!canManage || !currentGroupId || isUploadingAvatar) return;
    setIsUploadingAvatar(true);
    try {
      const picked = await pickAndUploadAvatar(currentGroupId, player.id);
      if (picked) {
        await updatePlayer.mutateAsync({ playerId: player.id, patch: { avatar_url: picked.publicUrl } });
      }
    } catch (e) {
      notify("Couldn't update avatar", e instanceof Error ? e.message : "Please try again.");
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleArchive = () => {
    confirmAction(
      "Archive player?",
      `${player.display_name} will be hidden from the active roster. Match history is kept.`,
      "Archive",
      async () => {
        await archivePlayer.mutateAsync(player.id);
        router.back();
      },
    );
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable onPress={handleAvatarPress} disabled={!canManage || isUploadingAvatar}>
            <Avatar uri={player.avatar_url} name={player.display_name} color={player.custom_color} size={96} />
            {canManage ? <Text style={styles.changePhoto}>{isUploadingAvatar ? "Uploading…" : "Change photo"}</Text> : null}
          </Pressable>
          <Text style={styles.name}>{player.display_name}</Text>
          {player.nickname ? <Text style={styles.nickname}>"{player.nickname}"</Text> : null}
          {!player.is_active ? <Text style={styles.archivedBadge}>Archived</Text> : null}
        </View>

        <View style={styles.statsRow}>
          <Card style={styles.statCard}>
            <Text style={styles.statValue}>{player.singles_elo}</Text>
            <Text style={styles.statLabel}>Singles Elo</Text>
          </Card>
          <Card style={styles.statCard}>
            <Text style={styles.statValue}>{player.doubles_elo}</Text>
            <Text style={styles.statLabel}>Doubles Elo</Text>
          </Card>
        </View>

        <Card>
          <Text style={styles.sectionTitle}>Record</Text>
          {stats ? (
            <View style={styles.recordRow}>
              <RecordStat label="Played" value={stats.played} />
              <RecordStat label="Wins" value={stats.wins} color={colors.win} />
              <RecordStat label="Losses" value={stats.losses} color={colors.loss} />
              <RecordStat label="Draws" value={stats.draws} color={colors.draw} />
            </View>
          ) : (
            <Skeleton height={40} />
          )}
        </Card>

        {canManage ? (
          <View style={styles.actions}>
            <Button label="Edit player" variant="secondary" onPress={() => router.push(`/player/${player.id}/edit`)} />
            {player.is_active ? (
              <Button label="Archive player" variant="danger" onPress={handleArchive} loading={archivePlayer.isPending} />
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function RecordStat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <View style={styles.recordStat}>
      <Text style={[styles.recordValue, color ? { color } : null]}>{value}</Text>
      <Text style={styles.recordLabel}>{label}</Text>
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
    gap: spacing.lg,
    paddingVertical: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  header: {
    alignItems: "center",
    gap: spacing.xs,
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
  archivedBadge: {
    ...typography.small,
    color: colors.warning,
    marginTop: spacing.xs,
  },
  statsRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  statCard: {
    flex: 1,
    alignItems: "center",
  },
  statValue: {
    ...typography.stat,
    color: colors.accent,
  },
  statLabel: {
    ...typography.caption,
    marginTop: spacing.xs,
  },
  sectionTitle: {
    ...typography.heading,
    marginBottom: spacing.md,
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
    marginTop: spacing.sm,
  },
});
