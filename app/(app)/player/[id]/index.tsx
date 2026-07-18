import { useMemo, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Avatar } from "../../../../src/components/Avatar";
import { BarChart } from "../../../../src/components/BarChart";
import { Button } from "../../../../src/components/Button";
import { Card } from "../../../../src/components/Card";
import { ErrorState } from "../../../../src/components/ErrorState";
import { FormStrip } from "../../../../src/components/FormStrip";
import { PlayerPicker } from "../../../../src/components/PlayerPicker";
import { Screen } from "../../../../src/components/Screen";
import { SegmentedControl } from "../../../../src/components/SegmentedControl";
import { Skeleton } from "../../../../src/components/Skeleton";
import { Sparkline } from "../../../../src/components/Sparkline";
import { StatTile } from "../../../../src/components/StatTile";
import { useAuth } from "../../../../src/hooks/useAuth";
import { useGroup } from "../../../../src/hooks/useGroup";
import { useEloHistory, usePlayerMatchHistory, usePlayerRecords } from "../../../../src/hooks/useMatches";
import { useArchivePlayer, useUpdatePlayer } from "../../../../src/hooks/usePlayerMutations";
import { usePlayer, usePlayers } from "../../../../src/hooks/usePlayers";
import { confirmAction, notify } from "../../../../src/lib/confirm";
import type { MatchSummary } from "../../../../src/lib/matches";
import { toPickablePlayer, type PickablePlayer } from "../../../../src/lib/players";
import {
  computeBiggestLoss,
  computeEloRank,
  computeBiggestWin,
  computeClubPerformance,
  computeDoublesPartnerships,
  computeGoalStats,
  computeHeadToHead,
  computeLastNStats,
  computeStreaks,
  findSides,
  MIN_SAMPLE_SIZE,
} from "../../../../src/lib/stats";
import { pickAndUploadAvatar } from "../../../../src/lib/storage";
import { colors, spacing, typography } from "../../../../src/theme";

const EMPTY_MATCHES: MatchSummary[] = [];

type ProfileTab = "overview" | "charts" | "h2h";
const TABS: { value: ProfileTab; label: string }[] = [
  { value: "overview", label: "Overview" },
  { value: "charts", label: "Charts" },
  { value: "h2h", label: "Head-to-Head" },
];

function opponentLabel(playerId: string, match: MatchSummary): string {
  const sides = findSides(playerId, match);
  if (!sides) return "Unknown opponent";
  const names = sides.opponent.players.map((p) => p.display_name).join(" & ");
  return sides.opponent.club ? `${names} (${sides.opponent.club.name})` : names;
}

export default function PlayerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { currentGroupId, currentRole } = useGroup();
  const { data: player, isLoading, isError, refetch } = usePlayer(id);
  const records = usePlayerRecords(id ? [id] : []);
  const matchHistory = usePlayerMatchHistory(id);
  const eloHistoryQuery = useEloHistory(id);
  const roster = usePlayers(currentGroupId);
  const updatePlayer = useUpdatePlayer(currentGroupId);
  const archivePlayer = useArchivePlayer(currentGroupId);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [headToHeadOpponentId, setHeadToHeadOpponentId] = useState<string | null>(null);
  const [tab, setTab] = useState<ProfileTab>("overview");

  const playerId = id ?? "";
  const matches = matchHistory.data ?? EMPTY_MATCHES;
  const eloEntries = eloHistoryQuery.data ?? [];

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
  const singlesEloSeries = useMemo(
    () => eloEntries.filter((e) => e.match_type === "singles").map((e) => e.rating_after),
    [eloEntries],
  );
  const doublesEloSeries = useMemo(
    () => eloEntries.filter((e) => e.match_type === "doubles").map((e) => e.rating_after),
    [eloEntries],
  );
  const rank = useMemo(() => computeEloRank(playerId, roster.data ?? []), [roster.data, playerId]);

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
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={[colors.surfaceElevated, colors.surface]} style={styles.hero}>
          <Pressable onPress={handleAvatarPress} disabled={!canManage || isUploadingAvatar}>
            <Avatar uri={player.avatar_url} name={player.display_name} color={player.custom_color} size={96} />
            {canManage ? <Text style={styles.changePhoto}>{isUploadingAvatar ? "Uploading…" : "Change photo"}</Text> : null}
          </Pressable>
          <Text style={styles.name}>{player.display_name}</Text>
          {player.nickname ? <Text style={styles.nickname}>"{player.nickname}"</Text> : null}
          {!player.is_active ? <Text style={styles.archivedBadge}>Archived</Text> : null}

          {matchHistory.isLoading ? (
            <View style={styles.formPlaceholder} />
          ) : (
            <FormStrip results={last10.form.slice(0, 5).map((f) => f.result)} />
          )}
        </LinearGradient>

        <View style={styles.tileGrid}>
          <StatTile label="Singles Elo" value={player.singles_elo} style={styles.tile} />
          <StatTile label="Doubles Elo" value={player.doubles_elo} style={styles.tile} />
          <StatTile label="Rank" value={rank ? `#${rank.position} of ${rank.of}` : "–"} style={styles.tile} />
          <StatTile
            label="Win Rate"
            value={stats?.winRate !== null && stats?.winRate !== undefined ? `${Math.round(stats.winRate * 100)}%` : "–"}
            style={styles.tile}
          />
        </View>

        <View style={styles.tabRow}>
          <SegmentedControl options={TABS} value={tab} onChange={setTab} />
        </View>

        {tab === "overview" ? (
          <View style={styles.tabContent}>
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

            <Card>
              <Text style={styles.sectionTitle}>Form (last 10)</Text>
              {matchHistory.isLoading ? (
                <Skeleton height={40} />
              ) : matchHistory.isError ? (
                <Text style={styles.errorText}>Couldn't load match history.</Text>
              ) : (
                <>
                  <FormStrip results={last10.form.map((f) => f.result)} />
                  <View style={styles.streakRow}>
                    <Text style={styles.streakText}>
                      Current streak:{" "}
                      <Text
                        style={
                          streaks.currentStreak.result === "win"
                            ? styles.streakWin
                            : streaks.currentStreak.result === "loss"
                              ? styles.streakLoss
                              : undefined
                        }
                      >
                        {streaks.currentStreak.count > 0
                          ? `${streaks.currentStreak.count} ${streaks.currentStreak.result}${streaks.currentStreak.count > 1 ? "s" : ""}`
                          : "—"}
                      </Text>
                    </Text>
                    <Text style={styles.streakText}>Best win streak: {streaks.longestWinStreak}</Text>
                    <Text style={styles.streakText}>Worst losing streak: {streaks.longestLossStreak}</Text>
                  </View>
                </>
              )}
            </Card>

            <Card>
              <Text style={styles.sectionTitle}>Goals</Text>
              {matchHistory.isLoading ? (
                <Skeleton height={40} />
              ) : (
                <View style={styles.recordRow}>
                  <RecordStat label="Scored" value={goalStats.goalsScored} />
                  <RecordStat label="Conceded" value={goalStats.goalsConceded} />
                  <RecordStat label="Per match" value={goalStats.goalsPerMatch !== null ? goalStats.goalsPerMatch.toFixed(2) : "–"} />
                  <RecordStat label="Clean sheets" value={goalStats.cleanSheets} color={colors.accent} />
                </View>
              )}
            </Card>

            <Card>
              <Text style={styles.sectionTitle}>Best & Worst</Text>
              {matchHistory.isLoading ? (
                <Skeleton height={40} />
              ) : (
                <View style={styles.bestWorst}>
                  <View style={styles.bestWorstRow}>
                    <Text style={styles.bestWorstLabel}>Biggest win</Text>
                    {biggestWin ? (
                      <Text style={styles.bestWorstValue} numberOfLines={1}>
                        {biggestWin.ownScore}-{biggestWin.opponentScore} vs {opponentLabel(playerId, biggestWin.match)}
                      </Text>
                    ) : (
                      <Text style={styles.bestWorstEmpty}>No wins yet</Text>
                    )}
                  </View>
                  <View style={styles.bestWorstRow}>
                    <Text style={styles.bestWorstLabel}>Biggest loss</Text>
                    {biggestLoss ? (
                      <Text style={styles.bestWorstValue} numberOfLines={1}>
                        {biggestLoss.ownScore}-{biggestLoss.opponentScore} vs {opponentLabel(playerId, biggestLoss.match)}
                      </Text>
                    ) : (
                      <Text style={styles.bestWorstEmpty}>No losses yet</Text>
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
              <Text style={styles.sectionTitle}>Elo Progression</Text>
              {eloHistoryQuery.isLoading ? (
                <Skeleton height={80} />
              ) : (
                <View style={styles.eloSection}>
                  <View>
                    <Text style={styles.subLabel}>Singles</Text>
                    <Sparkline values={singlesEloSeries} />
                  </View>
                  <View>
                    <Text style={styles.subLabel}>Doubles</Text>
                    <Sparkline values={doublesEloSeries} />
                  </View>
                </View>
              )}
            </Card>

            {clubPerformance.length > 0 ? (
              <Card>
                <Text style={styles.sectionTitle}>By Club</Text>
                {totalClubMatches < MIN_SAMPLE_SIZE ? (
                  <Text style={styles.insufficientData}>Not enough matches yet</Text>
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
                <Text style={styles.sectionTitle}>Doubles Partners</Text>
                {totalPartnershipMatches < MIN_SAMPLE_SIZE ? (
                  <Text style={styles.insufficientData}>Not enough matches yet</Text>
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

            {clubPerformance.length === 0 && partnerships.length === 0 && !matchHistory.isLoading ? (
              <Card>
                <Text style={styles.emptyChartsTitle}>No club or partnership data yet</Text>
                <Text style={styles.emptyChartsMessage}>Record a few matches to see club performance and doubles partnerships here.</Text>
              </Card>
            ) : null}
          </View>
        ) : null}

        {tab === "h2h" ? (
          <View style={styles.tabContent}>
            {opponents.length > 0 ? (
              <Card>
                <Text style={styles.sectionTitle}>Head-to-Head</Text>
                <PlayerPicker
                  players={opponents}
                  selectedIds={headToHeadOpponentId ? [headToHeadOpponentId] : []}
                  onToggle={(opponentId) => setHeadToHeadOpponentId((prev) => (prev === opponentId ? null : opponentId))}
                  maxSelected={1}
                />
                {headToHead ? (
                  <View style={styles.h2hRow}>
                    <View style={styles.recordRow}>
                      <RecordStat label="Played" value={headToHead.played} />
                      <RecordStat label="Wins" value={headToHead.wins} color={colors.win} />
                      <RecordStat label="Losses" value={headToHead.losses} color={colors.loss} />
                      <RecordStat label="Draws" value={headToHead.draws} color={colors.draw} />
                    </View>
                    <View style={styles.recordRow}>
                      <RecordStat label="Goals For" value={headToHead.goalsFor} />
                      <RecordStat label="Goals Against" value={headToHead.goalsAgainst} />
                      <RecordStat
                        label="Goal Diff"
                        value={headToHead.goalDifference > 0 ? `+${headToHead.goalDifference}` : headToHead.goalDifference}
                        color={headToHead.goalDifference > 0 ? colors.win : headToHead.goalDifference < 0 ? colors.loss : undefined}
                      />
                    </View>
                  </View>
                ) : null}
              </Card>
            ) : (
              <Card>
                <Text style={styles.emptyChartsTitle}>No opponents yet</Text>
                <Text style={styles.emptyChartsMessage}>Once {player.display_name} has played a match, opponents will show up here.</Text>
              </Card>
            )}
          </View>
        ) : null}

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

function RecordStat({ label, value, color }: { label: string; value: number | string; color?: string }) {
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
  archivedBadge: {
    ...typography.small,
    color: colors.warning,
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
  eloSection: {
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
  emptyChartsTitle: {
    ...typography.bodyStrong,
    textAlign: "center",
  },
  emptyChartsMessage: {
    ...typography.caption,
    textAlign: "center",
    marginTop: spacing.xs,
  },
});
