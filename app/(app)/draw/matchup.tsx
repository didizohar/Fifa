import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
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
import { SegmentedControl } from "../../../src/components/SegmentedControl";
import { ShareCopyRow } from "../../../src/components/ShareCopyRow";
import { SkeletonList } from "../../../src/components/Skeleton";
import { useClubVersions, useGameVersions } from "../../../src/hooks/useClubVersions";
import { useDrawSuspense } from "../../../src/hooks/useDrawSuspense";
import { useGroup } from "../../../src/hooks/useGroup";
import { usePlayers } from "../../../src/hooks/usePlayers";
import { useTranslation } from "../../../src/lib/i18n";
import { toPickablePlayer } from "../../../src/lib/players";
import {
  assignBalancedClubs,
  assignHandicapClubs,
  assignRandomClubs,
  chunkIntoSides,
  filterClubsByExactStars,
  filterClubsByStarRange,
  generateFullMatchup,
  sample,
  splitIntoTeams,
} from "../../../src/lib/random";
import type { ClubVersion, MatchType, PlayerProfile } from "../../../src/lib/types/database";
import { colors, iconSize, spacing, typography } from "../../../src/theme";

type ClubMode = "random" | "exactStars" | "starRange" | "balanced" | "handicap";
const DRAW_LEVEL_DEFAULT = 3;
const SIDE_COUNT = 2;

function averageDrawLevel(sidePlayers: PlayerProfile[]): number {
  if (sidePlayers.length === 0) return DRAW_LEVEL_DEFAULT;
  return sidePlayers.reduce((sum, p) => sum + (p.draw_level ?? DRAW_LEVEL_DEFAULT), 0) / sidePlayers.length;
}

export default function FullMatchupScreen() {
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
  const basePool = useMemo(() => (clubVersions ?? []).filter((cv) => typeof cv.star_rating === "number"), [clubVersions]);
  const distinctStars = useMemo(() => Array.from(new Set(basePool.map((cv) => cv.star_rating))).sort((a, b) => b - a), [basePool]);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [matchType, setMatchType] = useState<MatchType>("singles");
  const [randomizeSides, setRandomizeSides] = useState(true);
  const [clubMode, setClubMode] = useState<ClubMode>("random");
  const [exactStars, setExactStars] = useState<number | null>(null);
  const [rangeMin, setRangeMin] = useState<number | null>(null);
  const [rangeMax, setRangeMax] = useState<number | null>(null);
  const [allowDuplicates, setAllowDuplicates] = useState(false);

  const [sides, setSides] = useState<[PlayerProfile[], PlayerProfile[]] | null>(null);
  const [sideClubs, setSideClubs] = useState<[ClubVersion, ClubVersion] | null>(null);
  const [lockedPlayers, setLockedPlayers] = useState<Map<string, number>>(new Map());
  const [lockedClubSides, setLockedClubSides] = useState<Set<number>>(new Set());
  const [revealKey, setRevealKey] = useState(0);
  const suspense = useDrawSuspense();

  useEffect(() => {
    setSelectedIds((players ?? []).map((p) => p.id));
  }, [players]);

  useEffect(() => {
    setSides(null);
    setSideClubs(null);
    setLockedPlayers(new Map());
    setLockedClubSides(new Set());
  }, [matchType, selectedIds.length]);

  const requiredPlayers = matchType === "singles" ? 2 : 4;

  const filteredClubs = useMemo(() => {
    if (clubMode === "exactStars") return exactStars !== null ? filterClubsByExactStars(basePool, exactStars) : [];
    if (clubMode === "starRange")
      return rangeMin !== null && rangeMax !== null
        ? filterClubsByStarRange(basePool, Math.min(rangeMin, rangeMax), Math.max(rangeMin, rangeMax))
        : [];
    return basePool;
  }, [clubMode, exactStars, rangeMin, rangeMax, basePool]);

  const toggleSelection = (playerId: string) => {
    setSelectedIds((prev) => (prev.includes(playerId) ? prev.filter((id) => id !== playerId) : [...prev, playerId]));
  };

  const drawSides = (lockedMap: Map<string, number>): [PlayerProfile[], PlayerProfile[]] | null => {
    const eligible = (players ?? []).filter((p) => selectedIds.includes(p.id));
    const lockedIds = [...lockedMap.keys()];
    const lockedPlayerProfiles = eligible.filter((p) => lockedIds.includes(p.id));
    const pool = eligible.filter((p) => !lockedIds.includes(p.id));
    const need = requiredPlayers - lockedPlayerProfiles.length;
    if (need < 0 || eligible.length < requiredPlayers) return null;
    const newlyDrawn = sample(pool, need);
    const drawn = [...lockedPlayerProfiles, ...newlyDrawn];
    if (randomizeSides) {
      const split = splitIntoTeams(drawn, SIDE_COUNT, { locked: lockedMap });
      return [split[0], split[1]];
    }
    return chunkIntoSides(drawn);
  };

  const drawClubsForSides = (currentSides: [PlayerProfile[], PlayerProfile[]], lockedSideIndexes: Set<number>, existing: [ClubVersion, ClubVersion] | null): [ClubVersion, ClubVersion] | null => {
    // A locked index only stays fixed if there's actually an existing club to keep -- otherwise treat it as unlocked.
    const isLocked = (i: number) => lockedSideIndexes.has(i) && existing !== null;
    const excludeIds = new Set([0, 1].filter(isLocked).map((i) => existing![i].id));
    const clubPool = allowDuplicates ? filteredClubs : filteredClubs.filter((c) => !excludeIds.has(c.id));
    const pool = clubPool.length > 0 ? clubPool : filteredClubs;
    if (pool.length === 0) return null;

    const unlockedIndexes = [0, 1].filter((i) => !isLocked(i));
    let newClubsByIndex: Map<number, ClubVersion>;
    if (clubMode === "handicap") {
      // assignHandicapClubs returns results ordered by draw level, not input order -- map back by id to preserve side index.
      const entries = unlockedIndexes.map((i) => ({ participant: { id: `side${i}` }, drawLevel: averageDrawLevel(currentSides[i]) }));
      const byId = new Map(assignHandicapClubs(entries, pool, { allowDuplicates }).map((r) => [r.participant.id, r.club]));
      newClubsByIndex = new Map(unlockedIndexes.map((i) => [i, byId.get(`side${i}`)!]));
    } else {
      const assignments =
        clubMode === "balanced"
          ? assignBalancedClubs(pool, unlockedIndexes.length, { allowDuplicates }).assignments
          : assignRandomClubs(pool, unlockedIndexes.length, { allowDuplicates }).assignments;
      newClubsByIndex = new Map(unlockedIndexes.map((i, cursor) => [i, assignments[cursor]]));
    }

    const result = [0, 1].map((i) => (isLocked(i) ? existing![i] : newClubsByIndex.get(i)!)) as [ClubVersion, ClubVersion];
    return result;
  };

  const announce = (nextSides: [PlayerProfile[], PlayerProfile[]] | null, nextClubs: [ClubVersion, ClubVersion] | null) => {
    if (!nextSides) return;
    const summary = nextSides
      .map((side, i) => `${side.map((p) => p.display_name).join(" + ")} ${nextClubs ? `(${nextClubs[i].club.name})` : ""}`)
      .join(` ${t("draw.vs")} `);
    AccessibilityInfo.announceForAccessibility(t("draw.resultAnnouncement", { summary }));
  };

  const drawAll = () => {
    const eligible = (players ?? []).filter((p) => selectedIds.includes(p.id));
    const result = generateFullMatchup({
      eligiblePlayers: eligible,
      requiredPlayers,
      randomizeSides,
      clubPool: filteredClubs,
      clubMode: clubMode === "balanced" || clubMode === "handicap" ? clubMode : "random",
      allowDuplicates,
      getDrawLevel: (p) => p.draw_level ?? DRAW_LEVEL_DEFAULT,
    });
    if (!result) return;
    suspense.start(() => {
      setSides(result.sides);
      setSideClubs(result.clubs);
      setLockedPlayers(new Map());
      setLockedClubSides(new Set());
      setRevealKey((k) => k + 1);
      announce(result.sides, result.clubs);
    });
  };

  const redrawPlayersOnly = () => {
    const newSides = drawSides(lockedPlayers);
    if (!newSides) return;
    suspense.start(() => {
      setSides(newSides);
      setRevealKey((k) => k + 1);
      announce(newSides, sideClubs);
    });
  };

  const redrawTeamsOnly = () => {
    if (!sides) return;
    const allDrawn = [...sides[0], ...sides[1]];
    const newSides: [PlayerProfile[], PlayerProfile[]] = randomizeSides
      ? (() => {
          const split = splitIntoTeams(allDrawn, SIDE_COUNT, { locked: lockedPlayers });
          return [split[0], split[1]];
        })()
      : chunkIntoSides(allDrawn);
    suspense.start(() => {
      setSides(newSides);
      setRevealKey((k) => k + 1);
      announce(newSides, sideClubs);
    });
  };

  const redrawClubsOnly = () => {
    if (!sides) return;
    const newClubs = drawClubsForSides(sides, lockedClubSides, sideClubs);
    if (!newClubs) return;
    suspense.start(() => {
      setSideClubs(newClubs);
      setRevealKey((k) => k + 1);
      announce(sides, newClubs);
    });
  };

  const resetAll = () => {
    setSides(null);
    setSideClubs(null);
    setLockedPlayers(new Map());
    setLockedClubSides(new Set());
  };

  const togglePlayerLock = (playerId: string, sideIndex: number) => {
    setLockedPlayers((prev) => {
      const next = new Map(prev);
      if (next.has(playerId)) next.delete(playerId);
      else next.set(playerId, sideIndex);
      return next;
    });
  };

  const toggleClubLock = (sideIndex: number) => {
    setLockedClubSides((prev) => {
      const next = new Set(prev);
      if (next.has(sideIndex)) next.delete(sideIndex);
      else next.add(sideIndex);
      return next;
    });
  };

  if (playersLoading || clubsLoading) {
    return (
      <Screen>
        <SkeletonList count={5} />
      </Screen>
    );
  }

  if (playersError || clubsError) {
    return (
      <Screen>
        <ErrorState onRetry={playersError ? refetchPlayers : refetchClubs} />
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
  const notEnoughPlayers = selectedIds.length < requiredPlayers;
  const noClubsMatch = (clubMode === "exactStars" || clubMode === "starRange") && filteredClubs.length === 0;
  const resultText = sides
    ? sides
        .map((side, i) => {
          const club = sideClubs?.[i];
          return `${side.map((p) => p.display_name).join(" + ")}${club ? ` — ${club.club.name} (${club.star_rating}★)` : ""}`;
        })
        .join(`\n${t("draw.vs")}\n`)
    : "";

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card style={styles.section}>
          <Text style={styles.label}>{t("draw.matchupStep2")}</Text>
          <SegmentedControl
            value={matchType}
            onChange={setMatchType}
            options={[
              { value: "singles", label: t("draw.matchTypeSingles") },
              { value: "doubles", label: t("draw.matchTypeDoubles") },
            ]}
          />
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>{t("draw.randomizeSides")}</Text>
            <Switch value={randomizeSides} onValueChange={setRandomizeSides} />
          </View>
        </Card>

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
          <Text style={styles.label}>{t("draw.matchupStep1")}</Text>
          <PlayerPicker players={pickablePlayers} selectedIds={selectedIds} onToggle={toggleSelection} maxSelected={pickablePlayers.length} />
          <View style={styles.selectionActions}>
            <Button label={t("draw.selectAll")} variant="ghost" size="sm" onPress={() => setSelectedIds(pickablePlayers.map((p) => p.id))} />
            <Button label={t("draw.clearSelection")} variant="ghost" size="sm" onPress={() => setSelectedIds([])} />
          </View>
          <Text style={styles.eligibleCount}>{t("draw.eligiblePlayers", { count: String(selectedIds.length) })}</Text>
        </Card>

        <Card style={styles.section}>
          <Text style={styles.label}>{t("draw.clubMode")}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            <FilterChip label={t("draw.clubModeRandom")} active={clubMode === "random"} onPress={() => setClubMode("random")} />
            <FilterChip label={t("draw.clubModeExactStars")} active={clubMode === "exactStars"} onPress={() => setClubMode("exactStars")} />
            <FilterChip label={t("draw.clubModeStarRange")} active={clubMode === "starRange"} onPress={() => setClubMode("starRange")} />
            <FilterChip label={t("draw.clubModeBalanced")} active={clubMode === "balanced"} onPress={() => setClubMode("balanced")} />
            <FilterChip label={t("draw.clubModeHandicap")} active={clubMode === "handicap"} onPress={() => setClubMode("handicap")} />
          </ScrollView>

          {clubMode === "exactStars" ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {distinctStars.map((stars) => (
                <FilterChip key={stars} label={t("draw.exactStarsLabel", { stars: String(stars) })} active={exactStars === stars} onPress={() => setExactStars(stars)} />
              ))}
            </ScrollView>
          ) : null}

          {clubMode === "starRange" ? (
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
        </Card>

        {notEnoughPlayers ? (
          <EmptyState icon="🎲" title={t("draw.notEnoughPlayers")} message={t("draw.notEnoughPlayersMessage", { requested: String(requiredPlayers), available: String(selectedIds.length) })} />
        ) : noClubsMatch ? (
          <EmptyState icon="🔍" title={t("draw.noClubsInRange")} message={t("draw.noClubsInRangeMessage")} />
        ) : (
          <View style={styles.drawActions}>
            <Button
              label={suspense.isDrawing ? t("common.skip") : sides ? t("common.redrawAll") : t("draw.drawButton")}
              onPress={suspense.isDrawing ? suspense.skip : drawAll}
              style={styles.drawButton}
            />
            {sides ? (
              <>
                <Button label={t("draw.redrawPlayersOnly")} variant="secondary" size="sm" onPress={redrawPlayersOnly} />
                <Button label={t("draw.redrawTeamsOnly")} variant="secondary" size="sm" onPress={redrawTeamsOnly} />
                <Button label={t("draw.redrawClubsOnly")} variant="secondary" size="sm" onPress={redrawClubsOnly} />
                <Button label={t("common.resetAll")} variant="secondary" size="sm" onPress={resetAll} />
              </>
            ) : null}
          </View>
        )}

        {sides ? (
          <ResultRevealCard revealKey={revealKey}>
            {sides.map((side, sideIndex) => (
              <View key={sideIndex}>
                <Card variant="elevated" style={styles.sideCard}>
                  <View style={styles.sideHeader}>
                    <Text style={styles.sideTitle}>{t("draw.side", { number: String(sideIndex + 1) })}</Text>
                    <Pressable
                      onPress={() => toggleClubLock(sideIndex)}
                      accessibilityRole="button"
                      accessibilityLabel={lockedClubSides.has(sideIndex) ? t("common.unlock") : t("common.lock")}
                      hitSlop={6}
                    >
                      <Ionicons
                        name={lockedClubSides.has(sideIndex) ? "lock-closed" : "lock-open-outline"}
                        size={iconSize.sm}
                        color={lockedClubSides.has(sideIndex) ? colors.accent : colors.textMuted}
                      />
                    </Pressable>
                  </View>
                  {side.map((player) => (
                    <View key={player.id} style={styles.playerRow}>
                      <Avatar uri={player.avatar_url} name={player.display_name} color={player.custom_color} size={36} />
                      <Text style={styles.playerName} numberOfLines={1}>
                        {player.display_name}
                      </Text>
                      <Pressable
                        onPress={() => togglePlayerLock(player.id, sideIndex)}
                        accessibilityRole="button"
                        accessibilityLabel={lockedPlayers.has(player.id) ? t("common.unlock") : t("common.lock")}
                        hitSlop={6}
                      >
                        <Ionicons
                          name={lockedPlayers.has(player.id) ? "lock-closed" : "lock-open-outline"}
                          size={iconSize.sm}
                          color={lockedPlayers.has(player.id) ? colors.accent : colors.textMuted}
                        />
                      </Pressable>
                    </View>
                  ))}
                  {sideClubs ? <ClubBadge name={sideClubs[sideIndex].club.name} starRating={sideClubs[sideIndex].star_rating} /> : null}
                </Card>
                {sideIndex === 0 ? <Text style={styles.vsLabel}>{t("draw.vs")}</Text> : null}
              </View>
            ))}
            <View style={styles.recordAction}>
              <Button label={t("draw.proceedToRecordMatch")} onPress={() => router.push("/record-match")} />
            </View>
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
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  drawButton: {
    flexBasis: "100%",
  },
  sideCard: {
    gap: spacing.sm,
  },
  sideHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sideTitle: {
    ...typography.heading,
  },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  playerName: {
    ...typography.body,
    flex: 1,
  },
  vsLabel: {
    ...typography.bodyStrong,
    textAlign: "center",
    color: colors.textMuted,
    marginVertical: spacing.sm,
  },
  recordAction: {
    marginTop: spacing.sm,
  },
});
