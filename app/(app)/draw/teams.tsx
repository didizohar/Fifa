import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { AccessibilityInfo, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { Avatar } from "../../../src/components/Avatar";
import { Button } from "../../../src/components/Button";
import { Card } from "../../../src/components/Card";
import { Chevron } from "../../../src/components/Chevron";
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
import { movePlayerBetweenTeams, resolveDrawLevel, splitIntoBalancedTeams, splitIntoTeams } from "../../../src/lib/random";
import type { PlayerProfile } from "../../../src/lib/types/database";
import { colors, iconSize, spacing, typography } from "../../../src/theme";

type TeamMode = "random" | "balanced";

const MIN_TEAMS = 2;
const MAX_TEAMS = 8;

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

  // useCallback so PlayerPicker's React.memo actually skips re-rendering
  // the roster list on unrelated state changes (team count, mode, locks)
  // -- see src/components/PlayerPicker.tsx.
  const toggleSelection = useCallback((playerId: string) => {
    setSelectedIds((prev) => (prev.includes(playerId) ? prev.filter((id) => id !== playerId) : [...prev, playerId]));
  }, []);

  const teamLabel = (index: number) => teamNames[index]?.trim() || t("draw.teamLabel", { number: String(index + 1) });

  const computeTeams = (lockedMap: Map<string, number>) => {
    const eligible = (players ?? []).filter((p) => selectedIds.includes(p.id));
    return mode === "balanced"
      ? splitIntoBalancedTeams(eligible, teamCount, (p) => resolveDrawLevel(p.draw_level), { locked: lockedMap })
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

  // Both useCallback'd with empty deps (functional setState only, no
  // closed-over state) so the memoized TeamPlayerRow below actually skips
  // re-rendering rows in OTHER teams when one team's name field changes --
  // without this, every row across every team re-rendered on every
  // keystroke in any team's name TextField.
  const toggleLock = useCallback((playerId: string, teamIndex: number) => {
    setLocked((prev) => {
      const next = new Map(prev);
      if (next.has(playerId)) next.delete(playerId);
      else next.set(playerId, teamIndex);
      return next;
    });
  }, []);

  const movePlayer = useCallback((playerId: string, fromTeam: number, toTeam: number) => {
    setTeams((prevTeams) => {
      if (!prevTeams || toTeam < 0 || toTeam >= prevTeams.length) return prevTeams;
      return movePlayerBetweenTeams(prevTeams, playerId, fromTeam, toTeam);
    });
    setLocked((prev) => {
      if (!prev.has(playerId)) return prev;
      const nextLocked = new Map(prev);
      nextLocked.set(playerId, toTeam);
      return nextLocked;
    });
  }, []);

  const handleTeamNameChange = useCallback((index: number, value: string) => {
    setTeamNames((prev) => prev.map((name, i) => (i === index ? value : name)));
  }, []);

  // Screen/ScrollView below is now ALWAYS mounted -- loading/error/empty
  // states render as its *content*, not as separate early-return trees.
  // See draw/matchup.tsx for the full root-cause writeup: when the loading
  // branch returned a separate <Screen><SkeletonList/></Screen> (a plain
  // View, no ScrollView at all), the real ScrollView only mounted for the
  // first time once data resolved -- often right as the push transition
  // was settling, racing the screen-edge swipe-back gesture for priority
  // and causing scrolling to appear frozen for a moment on real devices.
  const zeroPlayers = !isLoading && !isError && (!players || players.length === 0);

  // Same rationale as draw/players.tsx: players only actually changes when
  // the roster query refetches, not on every selection/lock/move re-render.
  const pickablePlayers = useMemo(() => (players ?? []).map(toPickablePlayer), [players]);
  const sizes = teams?.map((team) => team.length) ?? [];
  const unevenSizes = sizes.length > 0 && new Set(sizes).size > 1;
  const resultText = teams
    ? teams.map((team, i) => `${teamLabel(i)}: ${team.map((p) => p.display_name).join(", ")}`).join("\n")
    : "";

  return (
    <Screen avoidKeyboard>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {isLoading ? (
          <SkeletonList count={5} />
        ) : isError ? (
          <ErrorState onRetry={refetch} />
        ) : zeroPlayers ? (
          <EmptyState
            icon="🎲"
            title={t("draw.zeroPlayers")}
            message={t("draw.zeroPlayersMessage")}
            actionLabel={t("common.addPlayer")}
            onAction={() => router.push("/player/new")}
          />
        ) : (
          <>
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
                  onChangeText={(value) => handleTeamNameChange(teamIndex, value)}
                  placeholder={t("draw.teamLabel", { number: String(teamIndex + 1) })}
                />
                <Text style={styles.teamCount}>{t("draw.teamPlayerCount", { count: String(team.length) })}</Text>
                {team.map((player) => (
                  <TeamPlayerRow
                    key={player.id}
                    player={player}
                    teamIndex={teamIndex}
                    isFirstTeam={teamIndex === 0}
                    isLastTeam={teamIndex === teams.length - 1}
                    isLocked={locked.get(player.id) === teamIndex}
                    onMove={movePlayer}
                    onToggleLock={toggleLock}
                  />
                ))}
                {unevenSizes ? (
                  <Text style={styles.sizeNote} numberOfLines={2}>
                    {t("draw.teamSizeNote", { name: teamLabel(teamIndex), count: String(team.length) })}
                  </Text>
                ) : null}
              </Card>
            ))}
            <ShareCopyRow text={resultText} />
          </ResultRevealCard>
        ) : null}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

// Every team's player rows re-rendered on ANY unrelated state change --
// typing in a different team's name field, toggling a lock elsewhere --
// since nothing here was memoized and onMove/onToggleLock were freshly
// bound per row per render. onMove/onToggleLock are the same stable
// (useCallback'd) functions for every row; only the primitive props
// (player, teamIndex, isFirstTeam/isLastTeam/isLocked) actually vary.
const TeamPlayerRow = memo(function TeamPlayerRow({
  player,
  teamIndex,
  isFirstTeam,
  isLastTeam,
  isLocked,
  onMove,
  onToggleLock,
}: {
  player: PlayerProfile;
  teamIndex: number;
  isFirstTeam: boolean;
  isLastTeam: boolean;
  isLocked: boolean;
  onMove: (playerId: string, fromTeam: number, toTeam: number) => void;
  onToggleLock: (playerId: string, teamIndex: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.playerRow}>
      <Avatar uri={player.avatar_url} name={player.display_name} color={player.custom_color} size={36} />
      <Text style={styles.playerName} numberOfLines={1}>
        {player.display_name}
      </Text>
      <Pressable
        onPress={() => onMove(player.id, teamIndex, teamIndex - 1)}
        disabled={isFirstTeam}
        accessibilityRole="button"
        accessibilityLabel={t("draw.movePlayer", { name: player.display_name })}
        hitSlop={6}
      >
        <Chevron direction="back" size={iconSize.sm} color={isFirstTeam ? colors.textMuted : colors.accent} />
      </Pressable>
      <Pressable
        onPress={() => onMove(player.id, teamIndex, teamIndex + 1)}
        disabled={isLastTeam}
        accessibilityRole="button"
        accessibilityLabel={t("draw.movePlayer", { name: player.display_name })}
        hitSlop={6}
      >
        <Chevron direction="forward" size={iconSize.sm} color={isLastTeam ? colors.textMuted : colors.accent} />
      </Pressable>
      <Pressable
        onPress={() => onToggleLock(player.id, teamIndex)}
        accessibilityRole="button"
        accessibilityLabel={isLocked ? t("common.unlock") : t("common.lock")}
        hitSlop={6}
      >
        <Ionicons name={isLocked ? "lock-closed" : "lock-open-outline"} size={iconSize.sm} color={isLocked ? colors.accent : colors.textMuted} />
      </Pressable>
    </View>
  );
});

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
