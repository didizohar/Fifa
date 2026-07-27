import { useEffect, useMemo, useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { Button } from "../../src/components/Button";
import { Card } from "../../src/components/Card";
import { ClubBadge } from "../../src/components/ClubBadge";
import { EmptyState } from "../../src/components/EmptyState";
import { FilterChip } from "../../src/components/FilterChip";
import { InfoBanner } from "../../src/components/InfoBanner";
import { PlayerPicker } from "../../src/components/PlayerPicker";
import { Screen } from "../../src/components/Screen";
import { ScoreStepper } from "../../src/components/ScoreStepper";
import { SegmentedControl } from "../../src/components/SegmentedControl";
import { Skeleton } from "../../src/components/Skeleton";
import { useClubVersions } from "../../src/hooks/useClubVersions";
import { useGroup } from "../../src/hooks/useGroup";
import { usePlayers } from "../../src/hooks/usePlayers";
import { useRecordMatch } from "../../src/hooks/useRecordMatch";
import { matchSideLabel } from "../../src/lib/format";
import { useTranslation } from "../../src/lib/i18n";
import { type MatchPrefillRouteParams, validateMatchPrefill } from "../../src/lib/matchPrefill";
import { toPickablePlayer } from "../../src/lib/players";
import { filterValidClubVersions } from "../../src/lib/random/clubs";
import { drawClubsForMatch, type ClubDrawStarMode } from "../../src/lib/random/matchClubDraw";
import type { ClubVersion, MatchType } from "../../src/lib/types/database";
import { validateMatchForm } from "../../src/lib/validation/matchForm";
import { colors, radius, spacing, typography } from "../../src/theme";

const STAR_MODES: ClubDrawStarMode[] = ["sameStar", "similarStrength", "anyStrength"];

const MIN_PLAYERS_TO_RECORD = 2;

export default function RecordMatchScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const rawParams = useLocalSearchParams();
  const prefillParams: MatchPrefillRouteParams = {
    matchType: typeof rawParams.matchType === "string" ? rawParams.matchType : undefined,
    side1Players: typeof rawParams.side1Players === "string" ? rawParams.side1Players : undefined,
    side2Players: typeof rawParams.side2Players === "string" ? rawParams.side2Players : undefined,
    side1Club: typeof rawParams.side1Club === "string" ? rawParams.side1Club : undefined,
    side2Club: typeof rawParams.side2Club === "string" ? rawParams.side2Club : undefined,
  };
  const isFromWinnersStay = rawParams.source === "winnersStay";
  const { currentGroup } = useGroup();
  const { data: players, isLoading: playersLoading } = usePlayers(currentGroup?.id ?? null);
  const { data: clubVersions, isLoading: clubsLoading } = useClubVersions(currentGroup?.default_game_version_id);
  const recordMatch = useRecordMatch(currentGroup?.id ?? null);

  const [matchType, setMatchType] = useState<MatchType>("singles");
  const [side1ClubId, setSide1ClubId] = useState<string | null>(null);
  const [side2ClubId, setSide2ClubId] = useState<string | null>(null);
  const [side1PlayerIds, setSide1PlayerIds] = useState<string[]>([]);
  const [side2PlayerIds, setSide2PlayerIds] = useState<string[]>([]);
  const [side1Score, setSide1Score] = useState(0);
  const [side2Score, setSide2Score] = useState(0);
  const [isOvertime, setIsOvertime] = useState(false);
  const [isPenalties, setIsPenalties] = useState(false);
  const [penaltyScore1, setPenaltyScore1] = useState(0);
  const [penaltyScore2, setPenaltyScore2] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [showPrefillBanner, setShowPrefillBanner] = useState(false);

  // Winners Stay's "Draw Clubs by Stars" -- only ever touches side1ClubId/side2ClubId,
  // never the players, pairings, score, or waiting queue.
  const [starMode, setStarMode] = useState<ClubDrawStarMode>("sameStar");
  const [selectedStarLevel, setSelectedStarLevel] = useState<number | null>(null);
  const [hasDrawnClubs, setHasDrawnClubs] = useState(false);
  const [clubDrawFailed, setClubDrawFailed] = useState(false);

  const validClubPool = useMemo(() => filterValidClubVersions(clubVersions ?? []), [clubVersions]);
  const availableStarLevels = useMemo(() => Array.from(new Set(validClubPool.map((cv) => cv.star_rating))).sort((a, b) => b - a), [validClubPool]);

  // Default to the highest available star level once clubs load, without stomping on a later user choice.
  const hasSetDefaultStarLevel = useRef(false);
  useEffect(() => {
    if (hasSetDefaultStarLevel.current || availableStarLevels.length === 0) return;
    hasSetDefaultStarLevel.current = true;
    setSelectedStarLevel(availableStarLevels[0]!);
  }, [availableStarLevels]);

  const handleDrawClubs = () => {
    const outcome = drawClubsForMatch({ clubs: validClubPool, starMode, selectedStarLevel });
    if (!outcome.ok) {
      setClubDrawFailed(true);
      return;
    }
    setClubDrawFailed(false);
    setHasDrawnClubs(true);
    setSide1ClubId(outcome.result.clubA.id);
    setSide2ClubId(outcome.result.clubB.id);
  };

  // Apply a draw-result prefill (see app/(app)/draw/matchup.tsx) exactly once, as soon as
  // the roster/club data needed to re-validate it has loaded -- never on a later refetch,
  // or it would silently stomp on whatever the user has already edited.
  const hasAppliedPrefill = useRef(false);
  useEffect(() => {
    if (hasAppliedPrefill.current || !players || !clubVersions) return;
    if (!prefillParams.matchType) return;
    hasAppliedPrefill.current = true;
    const prefill = validateMatchPrefill(
      prefillParams,
      players.map((p) => p.id),
      clubVersions.map((cv) => cv.id),
    );
    if (!prefill) return;
    setMatchType(prefill.matchType);
    setSide1PlayerIds(prefill.side1PlayerIds);
    setSide2PlayerIds(prefill.side2PlayerIds);
    setSide1ClubId(prefill.side1ClubId);
    setSide2ClubId(prefill.side2ClubId);
    if (prefill.side1PlayerIds.length > 0 || prefill.side2PlayerIds.length > 0 || prefill.side1ClubId || prefill.side2ClubId) {
      setShowPrefillBanner(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, clubVersions]);

  const requiredCount = matchType === "singles" ? 1 : 2;
  const scoresLevel = side1Score === side2Score;

  const pickablePlayers = useMemo(() => (players ?? []).map(toPickablePlayer), [players]);

  const pairLabel = (playerIds: string[]): string => matchSideLabel(playerIds.map((id) => (players ?? []).find((p) => p.id === id)?.display_name ?? "?"));

  const changeMatchType = (type: MatchType) => {
    setMatchType(type);
    setSide1PlayerIds([]);
    setSide2PlayerIds([]);
  };

  const toggleSide1Player = (id: string) => {
    setSide1PlayerIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  };
  const toggleSide2Player = (id: string) => {
    setSide2PlayerIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  };

  const handleSubmit = async () => {
    if (!currentGroup) return;

    const validation = validateMatchForm(
      {
        matchType,
        side1: { clubVersionId: side1ClubId, playerIds: side1PlayerIds, score: side1Score },
        side2: { clubVersionId: side2ClubId, playerIds: side2PlayerIds, score: side2Score },
        isPenalties,
        penaltyScore1: isPenalties ? penaltyScore1 : null,
        penaltyScore2: isPenalties ? penaltyScore2 : null,
      },
      (players ?? []).map((p) => p.id),
    );

    if (!validation.ok) {
      setErrors(validation.errors);
      return;
    }
    setErrors([]);

    try {
      const matchId = await recordMatch.mutateAsync({
        groupId: currentGroup.id,
        gameVersionId: currentGroup.default_game_version_id!,
        matchType,
        isOvertime,
        isPenalties,
        penaltyWinnerSide: validation.penaltyWinnerSide,
        sides: [
          {
            clubVersionId: side1ClubId!,
            score: side1Score,
            penaltyScore: isPenalties ? penaltyScore1 : null,
            result: validation.side1Result,
            playerIds: side1PlayerIds,
          },
          {
            clubVersionId: side2ClubId!,
            score: side2Score,
            penaltyScore: isPenalties ? penaltyScore2 : null,
            result: validation.side2Result,
            playerIds: side2PlayerIds,
          },
        ],
      });
      router.replace(`/match/${matchId}`);
    } catch (e) {
      setErrors([e instanceof Error ? e.message : "Failed to record match."]);
    }
  };

  if (!currentGroup) return null;

  if (!playersLoading && (players ?? []).length < MIN_PLAYERS_TO_RECORD) {
    return (
      <Screen>
        <EmptyState
          icon="🧑‍🤝‍🧑"
          title="Not enough players yet"
          message="A match needs at least two players in the group. Add one, then come back here."
          actionLabel="Add player"
          onAction={() => router.push("/player/new")}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {showPrefillBanner ? (
          <View style={styles.prefillBanner}>
            <Text style={styles.prefillBannerText}>{t("draw.prefillBannerMessage")}</Text>
          </View>
        ) : null}

        <SegmentedControl
          options={[
            { value: "singles" as const, label: "1 v 1" },
            { value: "doubles" as const, label: "2 v 2" },
          ]}
          value={matchType}
          onChange={changeMatchType}
        />

        {isFromWinnersStay && matchType === "doubles" ? (
          <Card style={styles.clubDrawCard}>
            <Text style={styles.sideTitle}>{t("rotation.drawClubsByStars")}</Text>
            <View style={styles.chipRow}>
              <FilterChip label={t("rotation.starModeSameLevel")} active={starMode === "sameStar"} onPress={() => setStarMode("sameStar")} />
              <FilterChip label={t("rotation.starModeSimilar")} active={starMode === "similarStrength"} onPress={() => setStarMode("similarStrength")} />
              <FilterChip label={t("rotation.starModeAny")} active={starMode === "anyStrength"} onPress={() => setStarMode("anyStrength")} />
            </View>

            {starMode === "sameStar" ? (
              <View style={styles.chipRow}>
                {availableStarLevels.map((stars) => (
                  <FilterChip key={stars} label={t("draw.exactStarsLabel", { stars: String(stars) })} active={selectedStarLevel === stars} onPress={() => setSelectedStarLevel(stars)} />
                ))}
              </View>
            ) : null}

            {clubDrawFailed ? <InfoBanner tone="warning" message={`${t("rotation.notEnoughClubsAtLevel")} ${t("rotation.chooseAnotherLevel")}`} /> : null}

            <Button label={hasDrawnClubs ? t("rotation.drawClubsAgain") : t("rotation.drawClubsByStars")} variant="secondary" onPress={handleDrawClubs} />

            {hasDrawnClubs && side1ClubId && side2ClubId ? (
              <View style={styles.clubDrawResultRow}>
                <ClubDrawResult label={t("rotation.pairALabel")} playerNames={pairLabel(side1PlayerIds)} clubVersion={clubVersions?.find((cv) => cv.id === side1ClubId) ?? null} />
                <ClubDrawResult label={t("rotation.pairBLabel")} playerNames={pairLabel(side2PlayerIds)} clubVersion={clubVersions?.find((cv) => cv.id === side2ClubId) ?? null} />
              </View>
            ) : null}
          </Card>
        ) : null}

        <Card style={styles.sideCard}>
          <Text style={styles.sideTitle}>Side 1</Text>
          {clubsLoading ? <Skeleton height={40} /> : (
            <ClubSelect clubVersions={clubVersions ?? []} selectedId={side1ClubId} onSelect={setSide1ClubId} disabledId={isFromWinnersStay ? side2ClubId : null} />
          )}
          {playersLoading ? <Skeleton height={80} /> : (
            <PlayerPicker
              players={pickablePlayers}
              selectedIds={side1PlayerIds}
              onToggle={toggleSide1Player}
              disabledIds={side2PlayerIds}
              maxSelected={requiredCount}
            />
          )}
          <ScoreStepper label="Score" value={side1Score} onChange={setSide1Score} />
        </Card>

        <Card style={styles.sideCard}>
          <Text style={styles.sideTitle}>Side 2</Text>
          {clubsLoading ? <Skeleton height={40} /> : (
            <ClubSelect clubVersions={clubVersions ?? []} selectedId={side2ClubId} onSelect={setSide2ClubId} disabledId={isFromWinnersStay ? side1ClubId : null} />
          )}
          {playersLoading ? <Skeleton height={80} /> : (
            <PlayerPicker
              players={pickablePlayers}
              selectedIds={side2PlayerIds}
              onToggle={toggleSide2Player}
              disabledIds={side1PlayerIds}
              maxSelected={requiredCount}
            />
          )}
          <ScoreStepper label="Score" value={side2Score} onChange={setSide2Score} />
        </Card>

        <Card style={styles.optionsCard}>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Went to overtime</Text>
            <Switch
              value={isOvertime}
              onValueChange={setIsOvertime}
              trackColor={{ false: colors.border, true: colors.accentMuted }}
              thumbColor={colors.textPrimary}
            />
          </View>
          <View style={styles.switchRow}>
            <Text style={[styles.switchLabel, !scoresLevel && styles.switchLabelDisabled]}>
              Decided by penalties
            </Text>
            <Switch
              value={isPenalties && scoresLevel}
              onValueChange={setIsPenalties}
              disabled={!scoresLevel}
              trackColor={{ false: colors.border, true: colors.accentMuted }}
              thumbColor={colors.textPrimary}
            />
          </View>
          {!scoresLevel ? <Text style={styles.hint}>Only available when both sides have the same score.</Text> : null}
          {isPenalties && scoresLevel ? (
            <View style={styles.penaltyRow}>
              <ScoreStepper label="Side 1 pens" value={penaltyScore1} onChange={setPenaltyScore1} max={20} />
              <ScoreStepper label="Side 2 pens" value={penaltyScore2} onChange={setPenaltyScore2} max={20} />
            </View>
          ) : null}
        </Card>

        {errors.length > 0 ? (
          <View style={styles.errorBox}>
            {errors.map((message) => (
              <Text key={message} style={styles.errorText}>• {message}</Text>
            ))}
          </View>
        ) : null}

        <Button label="Save match" onPress={handleSubmit} loading={recordMatch.isPending} />

        {isFromWinnersStay ? <Button label={t("rotation.backToHome")} variant="secondary" onPress={() => router.replace("/")} /> : null}
      </ScrollView>
    </Screen>
  );
}

function ClubSelect({
  clubVersions,
  selectedId,
  onSelect,
  disabledId = null,
}: {
  clubVersions: ClubVersion[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** The other side's currently selected club -- when set, prevents (and visually disables) choosing that same club here too. Only passed in the Winners Stay context. */
  disabledId?: string | null;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.clubScroll}>
      {clubVersions.map((cv) => {
        const isDisabled = disabledId !== null && cv.id === disabledId && cv.id !== selectedId;
        return (
          <Pressable
            key={cv.id}
            onPress={() => !isDisabled && onSelect(cv.id)}
            disabled={isDisabled}
            style={[styles.clubChip, selectedId === cv.id && styles.clubChipSelected, isDisabled && styles.clubChipDisabled]}
            accessibilityRole="button"
            accessibilityLabel={cv.club.name}
            accessibilityState={{ selected: selectedId === cv.id, disabled: isDisabled }}
          >
            <Text style={[styles.clubChipLabel, selectedId === cv.id && styles.clubChipLabelSelected]} numberOfLines={1}>
              {cv.club.name}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function ClubDrawResult({ label, playerNames, clubVersion }: { label: string; playerNames: string; clubVersion: ClubVersion | null }) {
  return (
    <View style={styles.clubDrawResult}>
      <Text style={styles.clubDrawResultLabel}>{label}</Text>
      <Text style={styles.clubDrawResultNames} numberOfLines={1}>
        {playerNames}
      </Text>
      {clubVersion ? <ClubBadge name={clubVersion.club.name} starRating={clubVersion.star_rating} size="sm" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.lg,
    paddingVertical: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  prefillBanner: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.accentSubtle,
    padding: spacing.md,
  },
  prefillBannerText: {
    ...typography.small,
    color: colors.accent,
    textAlign: "center",
  },
  sideCard: {
    gap: spacing.md,
  },
  sideTitle: {
    ...typography.heading,
  },
  clubScroll: {
    flexGrow: 0,
  },
  clubChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    marginEnd: spacing.sm,
  },
  clubChipSelected: {
    backgroundColor: colors.accentSubtle,
    borderColor: colors.accent,
  },
  clubChipLabel: {
    ...typography.caption,
  },
  clubChipLabelSelected: {
    color: colors.accent,
    fontWeight: "700",
  },
  clubChipDisabled: {
    opacity: 0.35,
  },
  clubDrawCard: {
    gap: spacing.md,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  clubDrawResultRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  clubDrawResult: {
    flex: 1,
    alignItems: "center",
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
  },
  clubDrawResultLabel: {
    ...typography.small,
    color: colors.textSecondary,
  },
  clubDrawResultNames: {
    ...typography.bodyStrong,
    textAlign: "center",
  },
  optionsCard: {
    gap: spacing.md,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  switchLabel: {
    ...typography.body,
  },
  switchLabelDisabled: {
    color: colors.textMuted,
  },
  hint: {
    ...typography.small,
    marginTop: -spacing.xs,
  },
  penaltyRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingTop: spacing.sm,
  },
  errorBox: {
    backgroundColor: colors.dangerSubtle,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  errorText: {
    ...typography.caption,
    color: colors.danger,
  },
});
