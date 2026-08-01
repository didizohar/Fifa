import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { AccessibilityInfo, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { Avatar } from "../../../src/components/Avatar";
import { Button } from "../../../src/components/Button";
import { Card } from "../../../src/components/Card";
import { ClubBadge } from "../../../src/components/ClubBadge";
import { EmptyState } from "../../../src/components/EmptyState";
import { ErrorState } from "../../../src/components/ErrorState";
import { FilterChip } from "../../../src/components/FilterChip";
import { PlayerPicker } from "../../../src/components/PlayerPicker";
import { ResultRevealCard } from "../../../src/components/ResultRevealCard";
import { Screen } from "../../../src/components/Screen";
import { ShareCopyRow } from "../../../src/components/ShareCopyRow";
import { SkeletonList } from "../../../src/components/Skeleton";
import { useClubFavorites } from "../../../src/hooks/useClubFavorites";
import { useClubVersions, useGameVersions } from "../../../src/hooks/useClubVersions";
import { useDrawSuspense } from "../../../src/hooks/useDrawSuspense";
import { useGroup } from "../../../src/hooks/useGroup";
import { useNationalTeamsPreference } from "../../../src/hooks/useNationalTeamsPreference";
import { usePlayers } from "../../../src/hooks/usePlayers";
import { useRecentlyUsedClubs } from "../../../src/hooks/useRecentlyUsedClubs";
import { filterClubVersionsForRandomGeneration } from "../../../src/lib/clubRepository";
import { useTranslation } from "../../../src/lib/i18n";
import { toPickablePlayer } from "../../../src/lib/players";
import {
  assignBalancedClubs,
  assignHandicapClubs,
  assignRandomClubs,
  averageDrawLevel,
  filterClubsByExactStars,
  filterClubsByStarRange,
  filterValidClubVersions,
  resolveDrawLevel,
} from "../../../src/lib/random";
import type { ClubVersion, PlayerProfile } from "../../../src/lib/types/database";
import { colors, iconSize, spacing, typography } from "../../../src/theme";

type ClubMode = "random" | "exactStars" | "starRange" | "balanced" | "handicap";

export default function ClubDrawScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { currentGroup } = useGroup();

  const [includeArchived, setIncludeArchived] = useState(false);
  const { data: players, isLoading: playersLoading, isError: playersError, refetch: refetchPlayers } = usePlayers(
    currentGroup?.id ?? null,
    includeArchived,
  );

  const { data: gameVersions } = useGameVersions();
  const [gameVersionId, setGameVersionId] = useState<string | null>(null);
  useEffect(() => {
    if (!gameVersionId) setGameVersionId(currentGroup?.default_game_version_id ?? gameVersions?.[0]?.id ?? null);
  }, [gameVersionId, currentGroup, gameVersions]);

  const { data: clubVersions, isLoading: clubsLoading, isError: clubsError, refetch: refetchClubs } = useClubVersions(gameVersionId);
  const { includeNationalTeams, setIncludeNationalTeams } = useNationalTeamsPreference(currentGroup?.id ?? null);
  const { favoriteIds } = useClubFavorites(currentGroup?.id ?? null);
  const { recentIds } = useRecentlyUsedClubs(currentGroup?.id ?? null);
  const [includeCustomClubs, setIncludeCustomClubs] = useState(true);
  const [excludeFavorites, setExcludeFavorites] = useState(false);
  const [excludeRecentlyUsed, setExcludeRecentlyUsed] = useState(false);

  const basePool = useMemo(() => {
    const valid = filterValidClubVersions(clubVersions ?? []);
    const excludeClubIds = [...(excludeFavorites ? favoriteIds : []), ...(excludeRecentlyUsed ? recentIds : [])];
    return filterClubVersionsForRandomGeneration(valid, { includeCustom: includeCustomClubs, includeNationalTeams, excludeClubIds });
  }, [clubVersions, includeCustomClubs, includeNationalTeams, excludeFavorites, excludeRecentlyUsed, favoriteIds, recentIds]);
  const distinctStars = useMemo(
    () => Array.from(new Set(basePool.map((cv) => cv.star_rating))).sort((a, b) => b - a),
    [basePool],
  );

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [mode, setMode] = useState<ClubMode>("random");
  const [exactStars, setExactStars] = useState<number | null>(null);
  const [rangeMin, setRangeMin] = useState<number | null>(null);
  const [rangeMax, setRangeMax] = useState<number | null>(null);
  const [allowDuplicates, setAllowDuplicates] = useState(false);
  const [assignments, setAssignments] = useState<Map<string, ClubVersion> | null>(null);
  const [lockedClubs, setLockedClubs] = useState<Map<string, ClubVersion>>(new Map());
  const [usedDuplicates, setUsedDuplicates] = useState(false);
  const [revealKey, setRevealKey] = useState(0);
  const suspense = useDrawSuspense();

  useEffect(() => {
    setSelectedIds((players ?? []).map((p) => p.id));
  }, [players]);

  useEffect(() => {
    setAssignments(null);
    setLockedClubs(new Map());
  }, [mode, exactStars, rangeMin, rangeMax, gameVersionId, selectedIds.length]);

  const filteredClubs = useMemo(() => {
    if (mode === "exactStars") return exactStars !== null ? filterClubsByExactStars(basePool, exactStars) : [];
    if (mode === "starRange")
      return rangeMin !== null && rangeMax !== null
        ? filterClubsByStarRange(basePool, Math.min(rangeMin, rangeMax), Math.max(rangeMin, rangeMax))
        : [];
    return basePool;
  }, [mode, exactStars, rangeMin, rangeMax, basePool]);

  const participants = (players ?? []).filter((p) => selectedIds.includes(p.id));

  const announceResult = (map: Map<string, ClubVersion>) => {
    const summary = participants.map((p) => `${p.display_name}: ${map.get(p.id)?.club.name ?? "?"}`).join(", ");
    AccessibilityInfo.announceForAccessibility(t("draw.resultAnnouncement", { summary }));
  };

  const assignForParticipants = (pool: ClubVersion[], targetParticipants: PlayerProfile[]): { assigned: ClubVersion[]; usedDuplicates: boolean } => {
    if (targetParticipants.length === 0) return { assigned: [], usedDuplicates: false };
    let assigned: ClubVersion[];
    if (mode === "handicap") {
      const handicapInput = targetParticipants.map((p) => ({ participant: p, drawLevel: resolveDrawLevel(p.draw_level) }));
      const result = assignHandicapClubs(handicapInput, pool, { allowDuplicates });
      const byId = new Map(result.map((r) => [r.participant.id, r.club]));
      assigned = targetParticipants.map((p) => byId.get(p.id)!);
    } else {
      const result =
        mode === "balanced"
          ? assignBalancedClubs(pool, targetParticipants.length, { allowDuplicates })
          : assignRandomClubs(pool, targetParticipants.length, { allowDuplicates });
      assigned = result.assignments;
    }
    const usedDuplicates = new Set(assigned.map((c) => c.id)).size < assigned.length;
    return { assigned, usedDuplicates };
  };

  const draw = () => {
    if (participants.length === 0 || filteredClubs.length === 0) return;
    const { assigned, usedDuplicates: duplicatesUsed } = assignForParticipants(filteredClubs, participants);
    const map = new Map<string, ClubVersion>();
    participants.forEach((p, i) => map.set(p.id, assigned[i]));
    suspense.start(() => {
      setAssignments(map);
      setLockedClubs(new Map());
      setUsedDuplicates(duplicatesUsed);
      setRevealKey((k) => k + 1);
      announceResult(map);
    });
  };

  const redrawAll = () => {
    if (participants.length === 0 || filteredClubs.length === 0) return;
    const lockedParticipants = participants.filter((p) => lockedClubs.has(p.id));
    const unlockedParticipants = participants.filter((p) => !lockedClubs.has(p.id));
    const excludeIds = new Set([...lockedClubs.values()].map((c) => c.id));
    const pool = allowDuplicates ? filteredClubs : filteredClubs.filter((c) => !excludeIds.has(c.id));
    const { assigned } = assignForParticipants(pool.length > 0 ? pool : filteredClubs, unlockedParticipants);
    const map = new Map<string, ClubVersion>();
    lockedParticipants.forEach((p) => map.set(p.id, lockedClubs.get(p.id)!));
    unlockedParticipants.forEach((p, i) => map.set(p.id, assigned[i]));
    suspense.start(() => {
      setAssignments(map);
      const clubIds = [...map.values()].map((c) => c.id);
      setUsedDuplicates(new Set(clubIds).size < clubIds.length);
      setRevealKey((k) => k + 1);
      announceResult(map);
    });
  };

  // useCallback'd (deps limited to the data they actually need) so the
  // memoized ResultRow below doesn't re-render every participant row when
  // unrelated screen state changes -- e.g. toggling "exclude recently used"
  // or changing the player selection previously re-rendered every row's
  // Pressable closures.
  const redrawOne = useCallback(
    (playerId: string) => {
      if (!assignments) return;
      const othersUsed = new Set([...assignments.entries()].filter(([id]) => id !== playerId).map(([, c]) => c.id));
      const pool = allowDuplicates ? filteredClubs : filteredClubs.filter((c) => !othersUsed.has(c.id));
      const candidates = pool.length > 0 ? pool : filteredClubs;
      if (candidates.length === 0) return;
      const pick = assignRandomClubs(candidates, 1, { allowDuplicates: true }).assignments[0];
      if (!pick) return;
      suspense.start(() => {
        setAssignments((prev) => {
          const next = new Map(prev);
          next.set(playerId, pick);
          const clubIds = [...next.values()].map((c) => c.id);
          setUsedDuplicates(new Set(clubIds).size < clubIds.length);
          return next;
        });
        setRevealKey((k) => k + 1);
      });
    },
    [assignments, filteredClubs, allowDuplicates, suspense.start],
  );

  const toggleLock = useCallback(
    (playerId: string) => {
      setLockedClubs((prev) => {
        const next = new Map(prev);
        if (next.has(playerId)) {
          next.delete(playerId);
        } else if (assignments?.has(playerId)) {
          next.set(playerId, assignments.get(playerId)!);
        }
        return next;
      });
    },
    [assignments],
  );

  const resetDraw = () => {
    setAssignments(null);
    setLockedClubs(new Map());
    setUsedDuplicates(false);
  };

  // useCallback so PlayerPicker's React.memo actually skips re-rendering
  // the roster list on unrelated state changes (club mode, star filters,
  // switches) -- see src/components/PlayerPicker.tsx.
  const toggleSelection = useCallback((playerId: string) => {
    setSelectedIds((prev) => (prev.includes(playerId) ? prev.filter((id) => id !== playerId) : [...prev, playerId]));
  }, []);

  // Screen/ScrollView below is now ALWAYS mounted -- loading/error/empty
  // states render as its *content*, not as separate early-return trees.
  // See draw/matchup.tsx for the full root-cause writeup: when the loading
  // branch returned a separate <Screen><SkeletonList/></Screen> (a plain
  // View, no ScrollView at all), the real ScrollView only mounted for the
  // first time once data resolved -- often right as the push transition
  // was settling, racing the screen-edge swipe-back gesture for priority
  // and causing scrolling to appear frozen for a moment on real devices.
  const isLoading = playersLoading || clubsLoading;
  const isError = playersError || clubsError;
  const zeroPlayers = !isLoading && !isError && (!players || players.length === 0);

  const pickablePlayers = useMemo(() => (players ?? []).map(toPickablePlayer), [players]);
  const noClubsMatch = filteredClubs.length === 0;
  const participantAverageDrawLevel = averageDrawLevel(participants, (p) => p.draw_level);
  const resultText = assignments
    ? participants.map((p) => `${p.display_name}: ${assignments.get(p.id)?.club.name ?? "?"} (${assignments.get(p.id)?.star_rating ?? "?"}★)`).join("\n")
    : "";

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {isLoading ? (
          <SkeletonList count={5} />
        ) : isError ? (
          <ErrorState onRetry={playersError ? refetchPlayers : refetchClubs} />
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
        {gameVersions && gameVersions.length > 1 ? (
          <Card style={styles.section}>
            <Text style={styles.label}>{t("draw.gameVersion")}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {gameVersions.map((gv) => (
                <FilterChip key={gv.id} label={gv.name} active={gameVersionId === gv.id} onPress={() => setGameVersionId(gv.id)} />
              ))}
            </ScrollView>
          </Card>
        ) : null}

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
            <Button label={t("draw.selectAll")} variant="ghost" size="sm" onPress={() => setSelectedIds(pickablePlayers.map((p) => p.id))} />
            <Button label={t("draw.clearSelection")} variant="ghost" size="sm" onPress={() => setSelectedIds([])} />
          </View>
          <Text style={styles.eligibleCount}>{t("draw.eligiblePlayers", { count: String(selectedIds.length) })}</Text>
        </Card>

        <Card style={styles.section}>
          <Text style={styles.label}>{t("draw.clubMode")}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            <FilterChip label={t("draw.clubModeRandom")} active={mode === "random"} onPress={() => setMode("random")} />
            <FilterChip label={t("draw.clubModeExactStars")} active={mode === "exactStars"} onPress={() => setMode("exactStars")} />
            <FilterChip label={t("draw.clubModeStarRange")} active={mode === "starRange"} onPress={() => setMode("starRange")} />
            <FilterChip label={t("draw.clubModeBalanced")} active={mode === "balanced"} onPress={() => setMode("balanced")} />
            <FilterChip label={t("draw.clubModeHandicap")} active={mode === "handicap"} onPress={() => setMode("handicap")} />
          </ScrollView>

          {mode === "exactStars" ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {distinctStars.map((stars) => (
                <FilterChip key={stars} label={t("draw.exactStarsLabel", { stars: String(stars) })} active={exactStars === stars} onPress={() => setExactStars(stars)} />
              ))}
            </ScrollView>
          ) : null}

          {mode === "starRange" ? (
            <View style={styles.rangeSection}>
              <Text style={styles.rangeCaption}>{t("draw.rangeFrom")}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                {distinctStars.map((stars) => (
                  <FilterChip key={stars} label={String(stars)} active={rangeMin === stars} onPress={() => setRangeMin(stars)} />
                ))}
              </ScrollView>
              <Text style={styles.rangeCaption}>{t("draw.rangeTo")}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                {distinctStars.map((stars) => (
                  <FilterChip key={stars} label={String(stars)} active={rangeMax === stars} onPress={() => setRangeMax(stars)} />
                ))}
              </ScrollView>
            </View>
          ) : null}

          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>{t("draw.allowDuplicateClubs")}</Text>
            <Switch value={allowDuplicates} onValueChange={setAllowDuplicates} />
          </View>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>{t("clubPicker.includeNationalTeams")}</Text>
            <Switch value={includeNationalTeams} onValueChange={setIncludeNationalTeams} />
          </View>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>{t("draw.includeCustomClubs")}</Text>
            <Switch value={includeCustomClubs} onValueChange={setIncludeCustomClubs} />
          </View>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>{t("draw.excludeFavoriteClubs")}</Text>
            <Switch value={excludeFavorites} onValueChange={setExcludeFavorites} />
          </View>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>{t("draw.excludeRecentClubs")}</Text>
            <Switch value={excludeRecentlyUsed} onValueChange={setExcludeRecentlyUsed} />
          </View>

          {noClubsMatch ? (
            <EmptyState icon="🔍" title={t("draw.noClubsInRange")} message={t("draw.noClubsInRangeMessage")} />
          ) : (
            <View style={styles.drawActions}>
              <Button
                label={suspense.isDrawing ? t("common.skip") : assignments ? t("common.redrawAll") : t("draw.drawButton")}
                onPress={suspense.isDrawing ? suspense.skip : assignments ? redrawAll : draw}
                disabled={selectedIds.length === 0}
                style={styles.drawButton}
              />
              {assignments ? <Button label={t("common.reset")} variant="secondary" onPress={resetDraw} /> : null}
            </View>
          )}
        </Card>

        {assignments ? (
          <ResultRevealCard revealKey={revealKey}>
            {usedDuplicates && !allowDuplicates ? <Text style={styles.duplicateNote}>{t("draw.duplicateClubsUsed")}</Text> : null}
            {participants.map((player) => (
              <ResultRow
                key={player.id}
                player={player}
                club={assignments.get(player.id)}
                isLocked={lockedClubs.has(player.id)}
                isHandicapMode={mode === "handicap"}
                participantAverageDrawLevel={participantAverageDrawLevel}
                onToggleLock={toggleLock}
                onRedraw={redrawOne}
              />
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

// Memoized so an unrelated screen re-render (e.g. toggling a filter switch,
// changing the player selection) doesn't re-render every participant row --
// only the row(s) whose actual props (club, lock state) changed.
interface ResultRowProps {
  player: PlayerProfile;
  club: ClubVersion | undefined;
  isLocked: boolean;
  isHandicapMode: boolean;
  participantAverageDrawLevel: number;
  onToggleLock: (playerId: string) => void;
  onRedraw: (playerId: string) => void;
}

const ResultRow = memo(function ResultRow({
  player,
  club,
  isLocked,
  isHandicapMode,
  participantAverageDrawLevel,
  onToggleLock,
  onRedraw,
}: ResultRowProps) {
  const { t } = useTranslation();
  return (
    <View style={styles.resultRow}>
      <Avatar uri={player.avatar_url} name={player.display_name} color={player.custom_color} size={40} />
      <View style={styles.resultInfo}>
        <Text style={styles.resultName} numberOfLines={1}>
          {player.display_name}
        </Text>
        {club ? <ClubBadge name={club.club.name} starRating={club.star_rating} size="sm" /> : null}
        {isHandicapMode ? (
          player.draw_level === null ? (
            <Text style={styles.handicapNote}>{t("draw.missingDrawLevel", { name: player.display_name })}</Text>
          ) : club && player.draw_level > participantAverageDrawLevel ? (
            <Text style={styles.handicapNote}>
              {t("draw.handicapExplanation", { name: player.display_name, stars: String(club.star_rating) })}
            </Text>
          ) : null
        ) : null}
      </View>
      <Pressable
        onPress={() => onToggleLock(player.id)}
        accessibilityRole="button"
        accessibilityLabel={isLocked ? t("common.unlock") : t("common.lock")}
        hitSlop={6}
      >
        <Ionicons name={isLocked ? "lock-closed" : "lock-open-outline"} size={iconSize.sm} color={isLocked ? colors.accent : colors.textMuted} />
      </Pressable>
      {!isLocked ? (
        <Pressable onPress={() => onRedraw(player.id)} accessibilityRole="button" accessibilityLabel={t("common.redraw")} hitSlop={6}>
          <Ionicons name="refresh" size={iconSize.sm} color={colors.accent} />
        </Pressable>
      ) : null}
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
  chipRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  rangeSection: {
    gap: spacing.xs,
  },
  rangeCaption: {
    ...typography.caption,
    color: colors.textMuted,
  },
  drawActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  drawButton: {
    flex: 1,
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  resultInfo: {
    flex: 1,
    gap: 2,
  },
  resultName: {
    ...typography.bodyStrong,
  },
  handicapNote: {
    ...typography.small,
    color: colors.textMuted,
  },
  duplicateNote: {
    ...typography.small,
    color: colors.textMuted,
    textAlign: "center",
  },
});
