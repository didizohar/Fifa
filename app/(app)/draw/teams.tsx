import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { AccessibilityInfo, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { Avatar } from "../../../src/components/Avatar";
import { Button } from "../../../src/components/Button";
import { Card } from "../../../src/components/Card";
import { EmptyState } from "../../../src/components/EmptyState";
import { ErrorState } from "../../../src/components/ErrorState";
import { PlayerPicker } from "../../../src/components/PlayerPicker";
import { ResultRevealCard } from "../../../src/components/ResultRevealCard";
import { ScoreStepper } from "../../../src/components/ScoreStepper";
import { Screen } from "../../../src/components/Screen";
import { SegmentedControl } from "../../../src/components/SegmentedControl";
import { ShareCopyRow } from "../../../src/components/ShareCopyRow";
import { SkeletonList } from "../../../src/components/Skeleton";
import { TextField } from "../../../src/components/TextField";
import { useDrawSuspense } from "../../../src/hooks/useDrawSuspense";
import { useGroup } from "../../../src/hooks/useGroup";
import { usePlayers } from "../../../src/hooks/usePlayers";
import { useTranslation } from "../../../src/lib/i18n";
import { toPickablePlayer } from "../../../src/lib/players";
import { movePlayerBetweenTeams, splitIntoBalancedTeams, splitIntoTeams } from "../../../src/lib/random";
import type { PlayerProfile } from "../../../src/lib/types/database";
import { colors, iconSize, spacing, typography } from "../../../src/theme";

type TeamMode = "random" | "balanced";

const MIN_TEAMS = 2;
const MAX_TEAMS = 8;
const DRAW_LEVEL_DEFAULT = 3;

export default function TeamDrawScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { currentGroup } = useGroup();
  const [includeArchived, setIncludeArchived] = useState(false);
  const { data: players, isLoading, isError, refetch } = usePlayers(currentGroup?.id ?? null, includeArchived);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [teamCount, setTeamCount] = useState(MIN_TEAMS);
  const [mode, setMode] = useState<TeamMode>("random");
  const [teamNames, setTeamNames] = useState<string[]>([]);
  const [locked, setLocked] = useState<Map<string, number>>(new Map());
  const [teams, setTeams] = useState<PlayerProfile[][] | null>(null);
  const [revealKey, setRevealKey] = useState(0);
  const suspense = useDrawSuspense();

  useEffect(() => {
    setSelectedIds((players ?? []).map((p) => p.id));
  }, [players]);

  useEffect(() => {
    const max = Math.max(MIN_TEAMS, Math.min(MAX_TEAMS, selectedIds.length || MIN_TEAMS));
    setTeamCount((prev) => Math.min(Math.max(prev, MIN_TEAMS), max));
    setTeams(null);
    setLocked(new Map());
  }, [selectedIds]);

  useEffect(() => {
    setTeamNames(Array.from({ length: teamCount }, (_, i) => teamNames[i] ?? ""));
    setTeams(null);
    setLocked(new Map());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamCount]);

  const toggleSelection = (playerId: string) => {
    setSelectedIds((prev) => (prev.includes(playerId) ? prev.filter((id) => id !== playerId) : [...prev, playerId]));
  };

  const teamLabel = (index: number) => teamNames[index]?.trim() || t("draw.teamLabel", { number: String(index + 1) });

  const computeTeams = (lockedMap: Map<string, number>) => {
    const eligible = (players ?? []).filter((p) => selectedIds.includes(p.id));
    return mode === "balanced"
      ? splitIntoBalancedTeams(eligible, teamCount, (p) => p.draw_level ?? DRAW_LEVEL_DEFAULT, { locked: lockedMap })
      : splitIntoTeams(eligible, teamCount, { locked: lockedMap });
  };

  const draw = (lockedMap: Map<string, number> = locked) => {
    const result = computeTeams(lockedMap);
    suspense.start(() => {
      setTeams(result);
      setRevealKey((k) => k + 1);
      const summary = result.map((team, i) => `${teamLabel(i)}: ${team.map((p) => p.display_name).join(", ")}`).join(" | ");
      AccessibilityInfo.announceForAccessibility(t("draw.resultAnnouncement", { summary }));
    });
  };

  const resetDraw = () => {
    setLocked(new Map());
    setTeams(null);
  };

  const toggleLock = (playerId: string, teamIndex: number) => {
    setLocked((prev) => {
      const next = new Map(prev);
      if (next.has(playerId)) next.delete(playerId);
      else next.set(playerId, teamIndex);
      return next;
    });
  };

  const movePlayer = (playerId: string, fromTeam: number, toTeam: number) => {
    if (!teams || toTeam < 0 || toTeam >= teams.length) return;
    setTeams(movePlayerBetweenTeams(teams, playerId, fromTeam, toTeam));
    setLocked((prev) => {
      if (!prev.has(playerId)) return prev;
      const nextLocked = new Map(prev);
      nextLocked.set(playerId, toTeam);
      return nextLocked;
    });
  };

  if (isLoading) {
    return (
      <Screen>
        <SkeletonList count={5} />
      </Screen>
    );
  }

  if (isError) {
    return (
      <Screen>
        <ErrorState onRetry={refetch} />
      </Screen>
    );
  }

  if (!players || players.length === 0) {
    return (
      <Screen>
        <EmptyState
          icon="🎲"
          title={t("draw.zeroPlayers")}
          message={t("draw.zeroPlayersMessage")}
          actionLabel={t("common.addPlayer")}
          onAction={() => router.push("/player/new")}
        />
      </Screen>
    );
  }

  const pickablePlayers = players.map(toPickablePlayer);
  const sizes = teams?.map((team) => team.length) ?? [];
  const unevenSizes = sizes.length > 0 && new Set(sizes).size > 1;
  const resultText = teams
    ? teams.map((team, i) => `${teamLabel(i)}: ${team.map((p) => p.display_name).join(", ")}`).join("\n")
    : "";

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card style={styles.section}>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>{t("draw.includeArchived")}</Text>
            <Switch value={includeArchived} onValueChange={setIncludeArchived} />
          </View>

          <Text style={styles.label}>{t("draw.selectPlayers")}</Text>
          <PlayerPicker
            players={pickablePlayers}
            selectedIds={selectedIds}
            onToggle={toggleSelection}
            maxSelected={pickablePlayers.length}
          />
          <View style={styles.selectionActions}>
            <Button
              label={t("draw.selectAll")}
              variant="ghost"
              size="sm"
              onPress={() => setSelectedIds(pickablePlayers.map((p) => p.id))}
            />
            <Button label={t("draw.clearSelection")} variant="ghost" size="sm" onPress={() => setSelectedIds([])} />
          </View>
          <Text style={styles.eligibleCount}>{t("draw.eligiblePlayers", { count: String(selectedIds.length) })}</Text>
        </Card>

        <Card style={styles.section}>
          <ScoreStepper
            label={t("draw.teamCount")}
            value={teamCount}
            onChange={setTeamCount}
            max={Math.max(MIN_TEAMS, Math.min(MAX_TEAMS, selectedIds.length || MIN_TEAMS))}
          />
          <View style={styles.modeSection}>
            <Text style={styles.label}>{t("draw.teamMode")}</Text>
            <SegmentedControl
              value={mode}
              onChange={setMode}
              options={[
                { value: "random", label: t("draw.modeRandom") },
                { value: "balanced", label: t("draw.modeBalanced") },
              ]}
            />
          </View>
          <View style={styles.drawActions}>
            <Button
              label={suspense.isDrawing ? t("common.skip") : teams ? t("common.redraw") : t("draw.drawButton")}
              onPress={suspense.isDrawing ? suspense.skip : () => draw()}
              disabled={selectedIds.length === 0}
              style={styles.drawButton}
            />
            {teams ? <Button label={t("common.reset")} variant="secondary" onPress={resetDraw} /> : null}
          </View>
        </Card>

        {teams ? (
          <ResultRevealCard revealKey={revealKey}>
            {teams.map((team, teamIndex) => (
              <Card key={teamIndex} variant="elevated" style={styles.teamCard}>
                <TextField
                  value={teamNames[teamIndex] ?? ""}
                  onChangeText={(value) =>
                    setTeamNames((prev) => prev.map((name, i) => (i === teamIndex ? value : name)))
                  }
                  placeholder={t("draw.teamLabel", { number: String(teamIndex + 1) })}
                />
                <Text style={styles.teamCount}>{team.length}</Text>
                {team.map((player) => {
                  const isLocked = locked.get(player.id) === teamIndex;
                  return (
                    <View key={player.id} style={styles.playerRow}>
                      <Avatar uri={player.avatar_url} name={player.display_name} color={player.custom_color} size={36} />
                      <Text style={styles.playerName} numberOfLines={1}>
                        {player.display_name}
                      </Text>
                      <Pressable
                        onPress={() => movePlayer(player.id, teamIndex, teamIndex - 1)}
                        disabled={teamIndex === 0}
                        accessibilityRole="button"
                        accessibilityLabel={t("draw.movePlayer", { name: player.display_name })}
                        hitSlop={6}
                      >
                        <Ionicons name="chevron-back" size={iconSize.sm} color={teamIndex === 0 ? colors.textMuted : colors.accent} />
                      </Pressable>
                      <Pressable
                        onPress={() => movePlayer(player.id, teamIndex, teamIndex + 1)}
                        disabled={teamIndex === teams.length - 1}
                        accessibilityRole="button"
                        accessibilityLabel={t("draw.movePlayer", { name: player.display_name })}
                        hitSlop={6}
                      >
                        <Ionicons
                          name="chevron-forward"
                          size={iconSize.sm}
                          color={teamIndex === teams.length - 1 ? colors.textMuted : colors.accent}
                        />
                      </Pressable>
                      <Pressable
                        onPress={() => toggleLock(player.id, teamIndex)}
                        accessibilityRole="button"
                        accessibilityLabel={isLocked ? t("common.unlock") : t("common.lock")}
                        hitSlop={6}
                      >
                        <Ionicons name={isLocked ? "lock-closed" : "lock-open-outline"} size={iconSize.sm} color={isLocked ? colors.accent : colors.textMuted} />
                      </Pressable>
                    </View>
                  );
                })}
                {unevenSizes ? (
                  <Text style={styles.sizeNote}>{t("draw.teamSizeNote", { name: teamLabel(teamIndex), count: String(team.length) })}</Text>
                ) : null}
              </Card>
            ))}
            <ShareCopyRow text={resultText} />
          </ResultRevealCard>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
    paddingVertical: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  section: {
    gap: spacing.md,
  },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  toggleLabel: {
    ...typography.body,
  },
  label: {
    ...typography.small,
    color: colors.textSecondary,
  },
  selectionActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  eligibleCount: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  modeSection: {
    gap: spacing.sm,
  },
  drawActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  drawButton: {
    flex: 1,
  },
  teamCard: {
    gap: spacing.sm,
  },
  teamCount: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  playerName: {
    ...typography.body,
    flex: 1,
  },
  sizeNote: {
    ...typography.small,
    color: colors.textMuted,
  },
});
