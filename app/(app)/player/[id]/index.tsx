import { useMemo, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Avatar } from "../../../../src/components/Avatar";
import { Badge, rankBadgeTone } from "../../../../src/components/Badge";
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
import { useGroupMatchHistory, usePlayerMatchHistory } from "../../../../src/hooks/useMatches";
import { useArchivePlayer, useUpdatePlayer } from "../../../../src/hooks/usePlayerMutations";
import { usePlayer, usePlayers } from "../../../../src/hooks/usePlayers";
import { confirmAction, notify } from "../../../../src/lib/confirm";
import { generateFunFacts, type FunFact } from "../../../../src/lib/facts";
import { generateInsights, type Insight } from "../../../../src/lib/insights";
import type { MatchSummary } from "../../../../src/lib/matches";
import { toPickablePlayer, type PickablePlayer } from "../../../../src/lib/players";
import { computeAllRecords, type RecordEntry } from "../../../../src/lib/records";
import {
  computeBiggestLoss,
  computeBiggestWin,
  computeClubPerformance,
  computeDoublesPartnerships,
  computeFavoriteOpponent,
  computeGoalStats,
  computeHeadToHead,
  computeLastNStats,
  computeNemesis,
  computePlayerStats,
  computeStreaks,
  computeWinRateProgression,
  computeWinRateRank,
  findSides,
  MIN_SAMPLE_SIZE,
} from "../../../../src/lib/stats";
import { pickAndUploadAvatar } from "../../../../src/lib/storage";
import type { PlayerProfile } from "../../../../src/lib/types/database";
import { colors, spacing, typography } from "../../../../src/theme";

const EMPTY_MATCHES: MatchSummary[] = [];
const EMPTY_PLAYERS: PlayerProfile[] = [];

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
  const matchHistory = usePlayerMatchHistory(id);
  const roster = usePlayers(currentGroupId);
  // Same query key as Home/Leaderboards/Players, so this is usually already
  // warm in the cache -- needed here because "records held" is a group-wide
  // question that a player's own match history alone can't answer.
  const groupHistory = useGroupMatchHistory(currentGroupId);
  const updatePlayer = useUpdatePlayer(currentGroupId);
  const archivePlayer = useArchivePlayer(currentGroupId);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [headToHeadOpponentId, setHeadToHeadOpponentId] = useState<string | null>(null);
  const [tab, setTab] = useState<ProfileTab>("overview");

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
  const favoritePartner = partnerships.find((p) => p.played >= MIN_SAMPLE_SIZE) ?? null;

  const personalHighlights = useMemo(() => {
    const combined: Array<FunFact | Insight> = [
      ...generateFunFacts(playerId, roster.data ?? EMPTY_PLAYERS, matches),
      ...generateInsights(playerId, roster.data ?? EMPTY_PLAYERS, matches),
    ];
    return combined.sort((a, b) => b.score - a.score).slice(0, 3);
  }, [playerId, roster.data, matches]);

  const heldRecords: RecordEntry[] = useMemo(() => {
    if (!player) return [];
    const allRecords = computeAllRecords(roster.data ?? EMPTY_PLAYERS, groupHistory.data ?? EMPTY_MATCHES);
    return allRecords.filter((r) => r.holderName.split(" & ").includes(player.display_name));
  }, [player, roster.data, groupHistory.data]);

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
        <ErrorState message="Couldn't load this player's profile. Check your connection and try again." onRetry={refetch} />
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
          <Pressable
            onPress={handleAvatarPress}
            disabled={!canManage || isUploadingAvatar}
            accessibilityRole={canManage ? "button" : undefined}
            accessibilityLabel={canManage ? "Change photo" : undefined}
          >
            <Avatar uri={player.avatar_url} name={player.display_name} color={player.custom_color} size={104} />
            {canManage ? <Text style={styles.changePhoto}>{isUploadingAvatar ? "Uploading…" : "Change photo"}</Text> : null}
          </Pressable>
          <Text style={styles.name}>{player.display_name}</Text>
          {player.nickname ? <Text style={styles.nickname}>"{player.nickname}"</Text> : null}
          <View style={styles.heroBadgeRow}>
            {rank ? <Badge label={`#${rank.position} of ${rank.of}`} tone={rankBadgeTone(rank.position)} /> : null}
            {!player.is_active ? <Badge label="Archived" tone="warning" /> : null}
          </View>

          {matchHistory.isLoading ? (
            <View style={styles.formPlaceholder} />
          ) : (
            <FormStrip results={last10.form.slice(0, 5).map((f) => f.result)} />
          )}
        </LinearGradient>

        <View style={styles.tileGrid}>
          <StatTile label="Rank" value={rank ? `#${rank.position} of ${rank.of}` : "Not yet qualified"} style={styles.tile} variant="elevated" />
          <StatTile
            label="Win Rate"
            value={stats.winRate !== null ? `${Math.round(stats.winRate * 100)}%` : "–"}
            style={styles.tile}
            variant="elevated"
          />
          <StatTile label="Matches Played" value={stats.played} style={styles.tile} variant="elevated" />
          <StatTile
            label="Current Streak"
            value={streaks.currentStreak.count > 0 ? `${streaks.currentStreak.count} ${streaks.currentStreak.result}` : "–"}
            style={styles.tile}
            variant="elevated"
          />
        </View>

        <View style={styles.tabRow}>
          <SegmentedControl options={TABS} value={tab} onChange={setTab} />
        </View>

        {tab === "overview" ? (
          <View style={styles.tabContent}>
            {personalHighlights.length > 0 ? (
              <Card>
                <Text style={styles.sectionTitle}>Highlights</Text>
                <View style={styles.highlightsList}>
                  {personalHighlights.map((item) => (
                    <Text key={item.id} style={styles.highlightText}>
                      • {item.text}
                    </Text>
                  ))}
                </View>
              </Card>
            ) : null}

            {heldRecords.length > 0 ? (
              <Card>
                <Text style={styles.sectionTitle}>Records Held</Text>
                <View style={styles.highlightsList}>
                  {heldRecords.map((record) => (
                    <View key={record.id} style={styles.recordHeldRow}>
                      <Text style={styles.recordHeldLabel}>{record.label}</Text>
                      <Text style={styles.recordHeldValue}>{record.valueLabel}</Text>
                    </View>
                  ))}
                </View>
              </Card>
            ) : null}

            {favoriteOpponent || nemesis || favoritePartner ? (
              <Card>
                <Text style={styles.sectionTitle}>Rivalries</Text>
                <View style={styles.bestWorst}>
                  {favoriteOpponent ? (
                    <View style={styles.bestWorstRow}>
                      <Text style={styles.bestWorstLabel}>Most-played opponent</Text>
                      <Text style={styles.bestWorstValue} numberOfLines={1}>
                        {favoriteOpponent.opponentName} ({favoriteOpponent.headToHead.wins}-{favoriteOpponent.headToHead.losses}-
                        {favoriteOpponent.headToHead.draws} in {favoriteOpponent.headToHead.played})
                      </Text>
                    </View>
                  ) : null}
                  {nemesis ? (
                    <View style={styles.bestWorstRow}>
                      <Text style={styles.bestWorstLabel}>Toughest matchup</Text>
                      <Text style={styles.bestWorstValue} numberOfLines={1}>
                        {nemesis.opponentName} ({nemesis.headToHead.winRate !== null ? Math.round(nemesis.headToHead.winRate * 100) : 0}% win rate)
                      </Text>
                    </View>
                  ) : null}
                  {favoritePartner ? (
                    <View style={styles.bestWorstRow}>
                      <Text style={styles.bestWorstLabel}>Favorite doubles partner</Text>
                      <Text style={styles.bestWorstValue} numberOfLines={1}>
                        {favoritePartner.teammateName} ({favoritePartner.played} matches together)
                      </Text>
                    </View>
                  ) : null}
                </View>
              </Card>
            ) : null}

            <Card>
              <Text style={styles.sectionTitle}>Record</Text>
              {matchHistory.isLoading ? (
                <Skeleton height={40} />
              ) : (
                <View style={styles.recordRow}>
                  <RecordStat label="Played" value={stats.played} />
                  <RecordStat label="Wins" value={stats.wins} color={colors.win} />
                  <RecordStat label="Losses" value={stats.losses} color={colors.loss} />
                  <RecordStat label="Draws" value={stats.draws} color={colors.draw} />
                </View>
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
              <Text style={styles.sectionTitle}>Win Rate Progression</Text>
              {matchHistory.isLoading ? (
                <Skeleton height={80} />
              ) : (
                <View style={styles.progressionSection}>
                  <View>
                    <Text style={styles.subLabel}>Singles</Text>
                    <Sparkline values={singlesWinRateSeries} />
                  </View>
                  <View>
                    <Text style={styles.subLabel}>Doubles</Text>
                    <Sparkline values={doublesWinRateSeries} />
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
                    <View style={styles.recordRow}>
                      <RecordStat label="Avg Scored" value={headToHead.averageScoreFor !== null ? headToHead.averageScoreFor.toFixed(2) : "–"} />
                      <RecordStat label="Avg Conceded" value={headToHead.averageScoreAgainst !== null ? headToHead.averageScoreAgainst.toFixed(2) : "–"} />
                      <RecordStat
                        label="Streak"
                        value={headToHead.currentStreak.count > 0 ? `${headToHead.currentStreak.count} ${headToHead.currentStreak.result}` : "–"}
                        color={headToHead.currentStreak.result === "win" ? colors.win : headToHead.currentStreak.result === "loss" ? colors.loss : undefined}
                      />
                    </View>
                    <View style={styles.bestWorst}>
                      <View style={styles.bestWorstRow}>
                        <Text style={styles.bestWorstLabel}>Largest victory</Text>
                        {headToHead.largestVictory ? (
                          <Text style={styles.bestWorstValue}>
                            {headToHead.largestVictory.ownScore}-{headToHead.largestVictory.opponentScore}
                          </Text>
                        ) : (
                          <Text style={styles.bestWorstEmpty}>No wins yet</Text>
                        )}
                      </View>
                      <View style={styles.bestWorstRow}>
                        <Text style={styles.bestWorstLabel}>Largest defeat</Text>
                        {headToHead.largestDefeat ? (
                          <Text style={styles.bestWorstValue}>
                            {headToHead.largestDefeat.ownScore}-{headToHead.largestDefeat.opponentScore}
                          </Text>
                        ) : (
                          <Text style={styles.bestWorstEmpty}>No losses yet</Text>
                        )}
                      </View>
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
