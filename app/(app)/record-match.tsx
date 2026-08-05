import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Stack, useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { Button } from "../../src/components/Button";
import { Card } from "../../src/components/Card";
import { ClubBadge } from "../../src/components/ClubBadge";
import { ClubPickerSheet } from "../../src/components/ClubPickerSheet";
import { EmptyState } from "../../src/components/EmptyState";
import { ErrorState } from "../../src/components/ErrorState";
import { Chip } from "../../src/components/Chip";
import { InfoBanner } from "../../src/components/InfoBanner";
import { PlayerPicker } from "../../src/components/PlayerPicker";
import { Screen } from "../../src/components/Screen";
import { ScoreStepper } from "../../src/components/ScoreStepper";
import { SegmentedControl } from "../../src/components/SegmentedControl";
import { Skeleton } from "../../src/components/Skeleton";
import { TextField } from "../../src/components/TextField";
import { useAuth } from "../../src/hooks/useAuth";
import { useClubFavorites } from "../../src/hooks/useClubFavorites";
import { useClubVersions } from "../../src/hooks/useClubVersions";
import { useEditMatch } from "../../src/hooks/useEditMatch";
import { useGroup } from "../../src/hooks/useGroup";
import { useMatch } from "../../src/hooks/useMatches";
import { useNationalTeamsPreference } from "../../src/hooks/useNationalTeamsPreference";
import { usePlayers } from "../../src/hooks/usePlayers";
import { useRecentlyUsedClubs } from "../../src/hooks/useRecentlyUsedClubs";
import { useRecordMatch } from "../../src/hooks/useRecordMatch";
import { confirmAction, notify } from "../../src/lib/confirm";
import { filterClubVersionsForRandomGeneration } from "../../src/lib/clubRepository";
import { matchSideLabel } from "../../src/lib/format";
import { useTranslation } from "../../src/lib/i18n";
import { type MatchPrefillRouteParams, validateMatchPrefill } from "../../src/lib/matchPrefill";
import { EditMatchError } from "../../src/lib/matchService";
import { toPickablePlayer, type PickablePlayer } from "../../src/lib/players";
import { filterValidClubVersions } from "../../src/lib/random/clubs";
import { drawClubsForMatch, type ClubDrawStarMode } from "../../src/lib/random/matchClubDraw";
import { isMatchLinkedToActiveWinnersStaySession } from "../../src/lib/rotation/session";
import type { ClubVersion, MatchType } from "../../src/lib/types/database";
import {
  buildEditableMatchForm,
  canEditMatch,
  compareMatchSnapshots,
  parseMatchDateTime,
  reconcileEditedMatchResult,
  type EditableMatchDraft,
} from "../../src/lib/validation/editMatchForm";
import { validateMatchForm, type ComputedMatchResult } from "../../src/lib/validation/matchForm";
import { useSeasons } from "../../src/hooks/useSeasons";
import { useWinnersStaySession } from "../../src/hooks/useWinnersStaySession";
import { colors, radius, spacing, typography } from "../../src/theme";

const STAR_MODES: ClubDrawStarMode[] = ["sameStar", "similarStrength", "anyStrength"];

const MIN_PLAYERS_TO_RECORD = 2;

/** The untouched starting state of a brand-new match -- see the beforeRemove guard below. */
const BLANK_CREATE_DRAFT: EditableMatchDraft = {
  matchType: "singles",
  side1: { clubVersionId: null, playerIds: [], score: 0 },
  side2: { clubVersionId: null, playerIds: [], score: 0 },
  isOvertime: false,
  isPenalties: false,
  penaltyScore1: null,
  penaltyScore2: null,
  notes: "",
  dateInput: "",
  timeInput: "",
};

function mergePickablePlayers(roster: PickablePlayer[], matchPlayers: PickablePlayer[]): PickablePlayer[] {
  const merged = [...roster];
  const knownIds = new Set(roster.map((p) => p.id));
  for (const player of matchPlayers) {
    if (!knownIds.has(player.id)) {
      merged.push(player);
      knownIds.add(player.id);
    }
  }
  return merged;
}

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
  const matchId = typeof rawParams.matchId === "string" ? rawParams.matchId : undefined;
  const isEditMode = !!matchId;
  const navigation = useNavigation();

  const { currentGroup, currentRole } = useGroup();
  const { user } = useAuth();
  // Editing needs the match's own game version (clubs must match what was
  // actually available then), not the group's *current* default -- the two
  // can differ if the group's default changed since this match was played.
  const matchQuery = useMatch(matchId);
  const editGameVersionId = isEditMode ? matchQuery.data?.game_version_id ?? undefined : currentGroup?.default_game_version_id;
  const { data: players, isLoading: playersLoading } = usePlayers(currentGroup?.id ?? null, isEditMode);
  const { data: clubVersions, isLoading: clubsLoading } = useClubVersions(editGameVersionId);
  const { data: seasons } = useSeasons(currentGroup?.id ?? null);
  const activeSeasonId = (seasons ?? []).find((s) => s.is_active)?.id ?? null;
  const recordMatch = useRecordMatch(currentGroup?.id ?? null);
  const editMatch = useEditMatch(currentGroup?.id ?? null);
  const winnersStaySession = useWinnersStaySession(currentGroup?.id ?? null);
  const { favoriteIds: favoriteClubIds, toggleFavorite: toggleClubFavorite } = useClubFavorites(currentGroup?.id ?? null);
  const { recentIds: recentClubIds, recordUsage: recordClubUsage } = useRecentlyUsedClubs(currentGroup?.id ?? null);
  const { includeNationalTeams, setIncludeNationalTeams } = useNationalTeamsPreference(currentGroup?.id ?? null);
  const [clubPickerSide, setClubPickerSide] = useState<1 | 2 | null>(null);
  // useCallback so MatchSideCard's React.memo actually skips re-rendering
  // the OTHER side when one side's club picker opens -- see MatchSideCard
  // below for the full explanation.
  const openSide1ClubPicker = useCallback(() => setClubPickerSide(1), []);
  const openSide2ClubPicker = useCallback(() => setClubPickerSide(2), []);

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

  // Edit-mode-only fields -- Record Match itself doesn't collect these (a
  // new match is always stamped "now"), so they only exist here.
  const [notes, setNotes] = useState("");
  const [dateInput, setDateInput] = useState("");
  const [timeInput, setTimeInput] = useState("");
  const [dateTimeError, setDateTimeError] = useState<string | null>(null);

  const originalDraftRef = useRef<EditableMatchDraft | null>(null);
  const skipUnsavedGuardRef = useRef(false);

  // "Draw Clubs by Stars" -- only ever touches side1ClubId/side2ClubId, never
  // the players, pairings, score, or waiting queue. Available for every
  // match, not just ones started from Winners Stay.
  const [starMode, setStarMode] = useState<ClubDrawStarMode>("sameStar");
  const [selectedStarLevel, setSelectedStarLevel] = useState<number | null>(null);
  const [hasDrawnClubs, setHasDrawnClubs] = useState(false);
  const [clubDrawFailed, setClubDrawFailed] = useState(false);
  // Local, per-visit draw options -- "Include National Teams" deliberately
  // is NOT one of these: it reuses the same shared, per-group
  // includeNationalTeams/setIncludeNationalTeams preference the Club
  // Picker already uses above, so there is exactly one source of truth
  // (and one persisted preference) for national-teams filtering across
  // Match Setup, the Club Picker, and this draw.
  const [drawIncludeCustomClubs, setDrawIncludeCustomClubs] = useState(true);
  const [drawPreventDuplicates, setDrawPreventDuplicates] = useState(true);

  // Same filterClubVersionsForRandomGeneration engine the standalone Random
  // Club Generator (draw/clubs.tsx, draw/matchup.tsx) filters through --
  // national teams / custom clubs eligibility is decided in exactly one
  // place, not re-implemented per screen.
  const validClubPool = useMemo(
    () => filterClubVersionsForRandomGeneration(filterValidClubVersions(clubVersions ?? []), { includeNationalTeams, includeCustom: drawIncludeCustomClubs }),
    [clubVersions, includeNationalTeams, drawIncludeCustomClubs],
  );
  const availableStarLevels = useMemo(() => Array.from(new Set(validClubPool.map((cv) => cv.star_rating))).sort((a, b) => b - a), [validClubPool]);

  // Default to the highest available star level once clubs load, without stomping on a later user choice.
  const hasSetDefaultStarLevel = useRef(false);
  useEffect(() => {
    if (hasSetDefaultStarLevel.current || availableStarLevels.length === 0) return;
    hasSetDefaultStarLevel.current = true;
    setSelectedStarLevel(availableStarLevels[0]!);
  }, [availableStarLevels]);

  const handleDrawClubs = () => {
    const outcome = drawClubsForMatch({ clubs: validClubPool, starMode, selectedStarLevel, allowDuplicates: !drawPreventDuplicates });
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

  // Loads the saved match's exact current values into the same state the
  // create form uses, exactly once, so nothing is silently reset if the
  // queries backing this effect refetch later.
  const hasAppliedEditSeed = useRef(false);
  useEffect(() => {
    if (!isEditMode || hasAppliedEditSeed.current) return;
    if (!matchQuery.data || !players || !clubVersions) return;
    hasAppliedEditSeed.current = true;
    const draft = buildEditableMatchForm(matchQuery.data);
    originalDraftRef.current = draft;
    setMatchType(draft.matchType);
    setSide1ClubId(draft.side1.clubVersionId);
    setSide2ClubId(draft.side2.clubVersionId);
    setSide1PlayerIds(draft.side1.playerIds);
    setSide2PlayerIds(draft.side2.playerIds);
    setSide1Score(draft.side1.score);
    setSide2Score(draft.side2.score);
    setIsOvertime(draft.isOvertime);
    setIsPenalties(draft.isPenalties);
    setPenaltyScore1(draft.penaltyScore1 ?? 0);
    setPenaltyScore2(draft.penaltyScore2 ?? 0);
    setNotes(draft.notes);
    setDateInput(draft.dateInput);
    setTimeInput(draft.timeInput);
  }, [isEditMode, matchQuery.data, players, clubVersions]);

  const requiredCount = matchType === "singles" ? 1 : 2;
  const scoresLevel = side1Score === side2Score;

  // In edit mode, an archived player who was already part of this match must
  // stay pickable even though usePlayers(groupId, true) already includes
  // archived players -- the extra merge only matters for the defensive edge
  // case where a match's own player somehow isn't in that list at all, so a
  // saved match never loses a chip it should still show.
  const matchOwnPlayers = useMemo(
    () => (matchQuery.data ? matchQuery.data.sides.flatMap((s) => s.players).map(toPickablePlayer) : []),
    [matchQuery.data],
  );
  const pickablePlayers = useMemo(
    () => mergePickablePlayers((players ?? []).map(toPickablePlayer), matchOwnPlayers),
    [players, matchOwnPlayers],
  );

  // Memoized so MatchSideCard's React.memo actually skips re-rendering the
  // untouched side when the other side's score changes -- an inline
  // clubVersions?.find(...) at the JSX call site would return a new
  // reference-equal-but-not-identical result every render regardless of
  // whether side1ClubId/side2ClubId actually changed.
  const side1Club = useMemo(() => clubVersions?.find((cv) => cv.id === side1ClubId) ?? null, [clubVersions, side1ClubId]);
  const side2Club = useMemo(() => clubVersions?.find((cv) => cv.id === side2ClubId) ?? null, [clubVersions, side2ClubId]);

  const pairLabel = (playerIds: string[]): string =>
    matchSideLabel(playerIds.map((id) => pickablePlayers.find((p) => p.id === id)?.displayName ?? "?"));

  const changeMatchType = (type: MatchType) => {
    setMatchType(type);
    setSide1PlayerIds([]);
    setSide2PlayerIds([]);
  };

  // useCallback (not a plain function) so PlayerPicker's React.memo actually
  // skips re-rendering the roster list when unrelated state (score, a
  // Switch, the other side) changes -- a new function reference every
  // render would defeat the memo entirely. Empty deps is correct: both only
  // use the functional setState form, so they never need to close over
  // anything that changes.
  const toggleSide1Player = useCallback((id: string) => {
    setSide1PlayerIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  }, []);
  const toggleSide2Player = useCallback((id: string) => {
    setSide2PlayerIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  }, []);

  const currentDraft: EditableMatchDraft = {
    matchType,
    side1: { clubVersionId: side1ClubId, playerIds: side1PlayerIds, score: side1Score },
    side2: { clubVersionId: side2ClubId, playerIds: side2PlayerIds, score: side2Score },
    isOvertime,
    isPenalties,
    penaltyScore1: isPenalties ? penaltyScore1 : null,
    penaltyScore2: isPenalties ? penaltyScore2 : null,
    notes,
    dateInput,
    timeInput,
  };
  // Refreshed every render (not via an effect) so the beforeRemove listener
  // below always reads the latest form state without needing to
  // resubscribe on every keystroke.
  const currentDraftRef = useRef(currentDraft);
  currentDraftRef.current = currentDraft;

  const isLinkedToWinnersStay = isEditMode && !!matchId && isMatchLinkedToActiveWinnersStaySession(winnersStaySession.session, matchId);

  const handleRecalculateRotation = () => {
    if (!winnersStaySession.session) return;
    winnersStaySession.setSession({ ...winnersStaySession.session, pendingRotation: null });
    notify(t("editMatch.rotationRecalculated"));
  };

  // Hardware/gesture back, the header's back button, and router.back() all
  // funnel through this same "beforeRemove" navigation event -- guarding it
  // once here covers every exit path, not just the button on this screen.
  // In create mode there's no "original" loaded from the server to diff
  // against -- BLANK_CREATE_DRAFT stands in for the untouched starting
  // state, so selecting players/a club, entering a score, or applying a
  // draw prefill and then navigating away without saving prompts the same
  // as it already did in edit mode instead of silently losing the entry.
  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", (e) => {
      if (skipUnsavedGuardRef.current) return;
      const original = isEditMode ? originalDraftRef.current : BLANK_CREATE_DRAFT;
      if (!original || !compareMatchSnapshots(original, currentDraftRef.current).anyChanged) return;
      e.preventDefault();
      confirmAction(
        t("editMatch.unsavedTitle"),
        t("editMatch.unsavedMessage"),
        t("editMatch.leaveWithoutSaving"),
        () => navigation.dispatch(e.data.action),
        t("editMatch.continueEditing"),
      );
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, isEditMode]);

  const isSubmitting = isEditMode ? editMatch.isPending : recordMatch.isPending;

  const saveEdit = async (computed: ComputedMatchResult) => {
    if (!currentGroup || !matchId) return;
    const payload = reconcileEditedMatchResult(matchId, currentGroup.id, currentDraft, computed);
    if (!payload) {
      setDateTimeError(t("editMatch.invalidDateTime"));
      return;
    }
    try {
      await editMatch.mutateAsync(payload);
      skipUnsavedGuardRef.current = true;
      notify(t("editMatch.savedSuccessTitle"));
      router.replace(`/match/${matchId}`);
    } catch (e) {
      if (e instanceof EditMatchError) {
        if (e.code === "not_found") setErrors([t("editMatch.matchNotFound")]);
        else if (e.code === "permission_denied") setErrors([t("editMatch.permissionDenied")]);
        else setErrors([t("editMatch.genericError")]);
      } else {
        setErrors([t("editMatch.networkError")]);
      }
    }
  };

  const handleSubmit = async () => {
    if (!currentGroup || isSubmitting) return;

    const validation = validateMatchForm(
      {
        matchType,
        side1: { clubVersionId: side1ClubId, playerIds: side1PlayerIds, score: side1Score },
        side2: { clubVersionId: side2ClubId, playerIds: side2PlayerIds, score: side2Score },
        isPenalties,
        penaltyScore1: isPenalties ? penaltyScore1 : null,
        penaltyScore2: isPenalties ? penaltyScore2 : null,
      },
      // pickablePlayers (not the raw roster) so a match's own already-selected
      // player is never rejected as "not on this group's roster" -- see the
      // mergePickablePlayers comment above. Identical to the roster in create
      // mode, since there's no match to merge in yet.
      pickablePlayers.map((p) => p.id),
    );

    if (!validation.ok) {
      setErrors(validation.errors);
      setDateTimeError(null);
      return;
    }

    if (isEditMode) {
      if (!parseMatchDateTime(dateInput, timeInput)) {
        setErrors([]);
        setDateTimeError(t("editMatch.invalidDateTime"));
        return;
      }
      setErrors([]);
      setDateTimeError(null);

      const original = originalDraftRef.current;
      const changes = original ? compareMatchSnapshots(original, currentDraft) : null;
      if (changes && (changes.participantsChanged || changes.scoreOrResultChanged)) {
        confirmAction(t("editMatch.confirmTitle"), t("editMatch.confirmMessage"), t("editMatch.saveChanges"), () => saveEdit(validation), t("common.cancel"));
      } else {
        await saveEdit(validation);
      }
      return;
    }

    setErrors([]);

    try {
      const newMatchId = await recordMatch.mutateAsync({
        groupId: currentGroup.id,
        // Tags the match with whichever season is currently active (null if
        // the group has none) -- once a season ends, no later match can
        // ever be assigned to it, since this is the only place season_id is
        // ever set and update_match's RPC has no season_id parameter at
        // all. That's what makes an archived season's match set frozen.
        seasonId: activeSeasonId,
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
      router.replace(`/match/${newMatchId}`);
    } catch (e) {
      setErrors([e instanceof Error ? e.message : "Failed to record match."]);
    }
  };

  if (!currentGroup) return null;

  // Screen/ScrollView below is now ALWAYS mounted -- loading/error/
  // permission-denied/empty states render as its *content*, not as
  // separate early-return trees. Same root cause and fix as the draw
  // screens (see draw/matchup.tsx): a separate early-return tree with no
  // ScrollView at all meant the real ScrollView only mounted once
  // matchQuery/players/clubVersions resolved, racing the push transition
  // on real devices.
  const editLoading = isEditMode && (matchQuery.isLoading || !!(matchQuery.data && (playersLoading || clubsLoading)));
  const editNotFound = isEditMode && !editLoading && (matchQuery.isError || !matchQuery.data);
  const editNotFoundIsMissing = editNotFound ? (matchQuery.error as { code?: string } | null)?.code === "PGRST116" : false;
  const editPermissionDenied =
    isEditMode && !editLoading && !editNotFound && !!matchQuery.data && !canEditMatch(currentRole, user?.id, matchQuery.data.created_by);
  const tooFewPlayers = !isEditMode && !playersLoading && (players ?? []).length < MIN_PLAYERS_TO_RECORD;
  const showForm = !editLoading && !editNotFound && !editPermissionDenied && !tooFewPlayers;

  return (
    <Screen avoidKeyboard>
      {isEditMode && showForm ? <Stack.Screen options={{ title: t("editMatch.entryAction") }} /> : null}
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {editLoading ? (
          <>
            <Skeleton height={100} borderRadius={radius.lg} />
            <Skeleton height={220} borderRadius={radius.lg} />
            <Skeleton height={220} borderRadius={radius.lg} />
          </>
        ) : editNotFound ? (
          <ErrorState
            message={editNotFoundIsMissing ? t("editMatch.matchNotFound") : t("editMatch.networkError")}
            onRetry={editNotFoundIsMissing ? undefined : () => matchQuery.refetch()}
          />
        ) : editPermissionDenied ? (
          <ErrorState message={t("editMatch.permissionDenied")} />
        ) : tooFewPlayers ? (
          <EmptyState
            icon="🧑‍🤝‍🧑"
            title="Not enough players yet"
            message="A match needs at least two players in the group. Add one, then come back here."
            actionLabel="Add player"
            onAction={() => router.push("/player/new")}
          />
        ) : (
          <>
        {showPrefillBanner ? (
          <View style={styles.prefillBanner}>
            <Text style={styles.prefillBannerText}>{t("draw.prefillBannerMessage")}</Text>
          </View>
        ) : null}

        {isLinkedToWinnersStay ? (
          <Card style={styles.clubDrawCard}>
            <InfoBanner tone="warning" message={t("editMatch.winnersStayLinkedMessage")} />
            <Button label={t("editMatch.recalculateRotation")} variant="secondary" onPress={handleRecalculateRotation} />
          </Card>
        ) : null}

        <SegmentedControl
          options={[
            { value: "singles" as const, label: "1 v 1" },
            { value: "doubles" as const, label: "2 v 2" },
          ]}
          value={matchType}
          onChange={changeMatchType}
        />

        <Card style={styles.clubDrawCard}>
          <Text style={styles.sideTitle}>{t("rotation.drawClubsByStars")}</Text>
          <View style={styles.chipRow}>
            <Chip label={t("draw.clubModeRandom")} active={starMode === "anyStrength"} onPress={() => setStarMode("anyStrength")} />
            <Chip label={t("draw.clubModeExactStars")} active={starMode === "sameStar"} onPress={() => setStarMode("sameStar")} />
          </View>

          {starMode === "sameStar" ? (
            clubsLoading ? (
              <Skeleton height={36} />
            ) : availableStarLevels.length === 0 ? (
              <InfoBanner tone="warning" message={t("rotation.noClubsAvailable")} />
            ) : (
              <View style={styles.chipRow}>
                {availableStarLevels.map((stars) => (
                  <Chip
                    key={stars}
                    label={t("draw.exactStarsLabel", { stars: String(stars) })}
                    active={selectedStarLevel === stars}
                    onPress={() => setSelectedStarLevel(stars)}
                  />
                ))}
              </View>
            )
          ) : null}

          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>{t("clubPicker.includeNationalTeams")}</Text>
            <Switch
              value={includeNationalTeams}
              onValueChange={setIncludeNationalTeams}
              trackColor={{ false: colors.border, true: colors.accentMuted }}
              thumbColor={colors.textPrimary}
            />
          </View>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>{t("draw.includeCustomClubs")}</Text>
            <Switch
              value={drawIncludeCustomClubs}
              onValueChange={setDrawIncludeCustomClubs}
              trackColor={{ false: colors.border, true: colors.accentMuted }}
              thumbColor={colors.textPrimary}
            />
          </View>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>{t("rotation.preventDuplicateClubs")}</Text>
            <Switch
              value={drawPreventDuplicates}
              onValueChange={setDrawPreventDuplicates}
              trackColor={{ false: colors.border, true: colors.accentMuted }}
              thumbColor={colors.textPrimary}
            />
          </View>

          {clubDrawFailed ? (
            <InfoBanner
              tone="warning"
              message={
                starMode === "sameStar"
                  ? `${t("rotation.notEnoughClubsAtLevel")} ${t("rotation.chooseAnotherLevel")}`
                  : t("rotation.notEnoughClubsOverall")
              }
            />
          ) : null}

          <Button label={hasDrawnClubs ? t("rotation.drawClubsAgain") : t("rotation.drawClubsByStars")} variant="secondary" onPress={handleDrawClubs} />

          {hasDrawnClubs && side1ClubId && side2ClubId ? (
            <View style={styles.clubDrawResultRow}>
              <ClubDrawResult label={t("rotation.side1Label")} playerNames={pairLabel(side1PlayerIds)} clubVersion={side1Club} />
              <ClubDrawResult label={t("rotation.side2Label")} playerNames={pairLabel(side2PlayerIds)} clubVersion={side2Club} />
            </View>
          ) : null}
        </Card>

        <MatchSideCard
          title={t("rotation.side1Label")}
          clubVersion={side1Club}
          clubsLoading={clubsLoading}
          onClubPress={openSide1ClubPicker}
          playersLoading={playersLoading}
          pickablePlayers={pickablePlayers}
          selectedIds={side1PlayerIds}
          onToggle={toggleSide1Player}
          disabledIds={side2PlayerIds}
          maxSelected={requiredCount}
          score={side1Score}
          onScoreChange={setSide1Score}
        />

        <MatchSideCard
          title={t("rotation.side2Label")}
          clubVersion={side2Club}
          clubsLoading={clubsLoading}
          onClubPress={openSide2ClubPicker}
          playersLoading={playersLoading}
          pickablePlayers={pickablePlayers}
          selectedIds={side2PlayerIds}
          onToggle={toggleSide2Player}
          disabledIds={side1PlayerIds}
          maxSelected={requiredCount}
          score={side2Score}
          onScoreChange={setSide2Score}
        />

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
              <ScoreStepper label={t("rotation.side1PensLabel")} value={penaltyScore1} onChange={setPenaltyScore1} max={20} />
              <ScoreStepper label={t("rotation.side2PensLabel")} value={penaltyScore2} onChange={setPenaltyScore2} max={20} />
            </View>
          ) : null}
        </Card>

        {isEditMode ? (
          <Card style={styles.optionsCard}>
            <View style={styles.dateTimeRow}>
              <View style={styles.dateTimeField}>
                <TextField
                  label={t("editMatch.dateLabel")}
                  placeholder="2026-03-15"
                  value={dateInput}
                  onChangeText={setDateInput}
                  keyboardType="numbers-and-punctuation"
                  autoCorrect={false}
                  autoCapitalize="none"
                  maxLength={10}
                />
              </View>
              <View style={styles.dateTimeField}>
                <TextField
                  label={t("editMatch.timeLabel")}
                  placeholder="18:30"
                  value={timeInput}
                  onChangeText={setTimeInput}
                  keyboardType="numbers-and-punctuation"
                  autoCorrect={false}
                  autoCapitalize="none"
                  maxLength={5}
                />
              </View>
            </View>
            {dateTimeError ? <Text style={styles.dateTimeErrorText}>{dateTimeError}</Text> : null}
            <TextField
              label={t("editMatch.notesLabel")}
              placeholder={t("editMatch.notesPlaceholder")}
              value={notes}
              onChangeText={setNotes}
              multiline
            />
          </Card>
        ) : null}

        {errors.length > 0 ? (
          <View style={styles.errorBox}>
            {errors.map((message) => (
              <Text key={message} style={styles.errorText}>• {message}</Text>
            ))}
          </View>
        ) : null}

        <Button label={isEditMode ? t("editMatch.saveChanges") : "Save match"} onPress={handleSubmit} loading={isSubmitting} disabled={isSubmitting} />

        {isFromWinnersStay ? <Button label={t("rotation.backToHome")} variant="secondary" onPress={() => router.replace("/")} /> : null}
          </>
        )}
      </ScrollView>

      {clubPickerSide !== null && editGameVersionId && currentGroup ? (
        <ClubPickerSheet
          visible
          onClose={() => setClubPickerSide(null)}
          clubVersions={clubVersions ?? []}
          favoriteClubIds={favoriteClubIds}
          recentClubIds={recentClubIds}
          onToggleFavorite={toggleClubFavorite}
          onSelect={(clubVersion) => {
            if (clubPickerSide === 1) setSide1ClubId(clubVersion.id);
            else setSide2ClubId(clubVersion.id);
            recordClubUsage(clubVersion.club_id);
          }}
          disabledClubId={isFromWinnersStay ? (clubPickerSide === 1 ? side2ClubId : side1ClubId) : null}
          includeNationalTeams={includeNationalTeams}
          onToggleIncludeNationalTeams={setIncludeNationalTeams}
          groupId={currentGroup.id}
          gameVersionId={editGameVersionId}
        />
      ) : null}
    </Screen>
  );
}

/** Opens the production ClubPickerSheet -- shows the currently selected club (or a placeholder prompt) as a single tappable row. This is the only club-selection entry point in match setup; there is no other, older selector left in this screen. */
const ClubSelectButton = memo(function ClubSelectButton({ clubVersion, onPress }: { clubVersion: ClubVersion | null; onPress: () => void }) {
  const { t } = useTranslation();
  return (
    <Pressable onPress={onPress} style={styles.clubSelectButton} accessibilityRole="button" accessibilityLabel={clubVersion?.club.name ?? t("clubPicker.title")}>
      {clubVersion ? (
        <ClubBadge name={clubVersion.club.name} starRating={clubVersion.star_rating} size="sm" />
      ) : (
        <Text style={styles.clubSelectPlaceholder}>{t("clubPicker.title")}</Text>
      )}
    </Pressable>
  );
});

interface MatchSideCardProps {
  title: string;
  clubVersion: ClubVersion | null;
  clubsLoading: boolean;
  onClubPress: () => void;
  playersLoading: boolean;
  pickablePlayers: PickablePlayer[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  disabledIds: string[];
  maxSelected: number;
  score: number;
  onScoreChange: (value: number) => void;
}

/**
 * Memoized so changing one side's score (or opening its club picker) no
 * longer re-renders the OTHER side's entire card -- ClubSelectButton did an
 * unmemoized clubVersions.find() on every render of the whole screen, and
 * neither it nor this card's Card/ScoreStepper were memoized at all, so a
 * single ScoreStepper tap on Side 1 previously re-rendered Side 2's club
 * lookup, club button, and score display too, even though nothing about
 * Side 2 had changed. Every prop here is already stable/primitive at the
 * call site (see side1Club/side2Club, openSide1ClubPicker/
 * openSide2ClubPicker, toggleSide1Player/toggleSide2Player in the parent),
 * so this memo actually takes effect.
 */
const MatchSideCard = memo(function MatchSideCard({
  title,
  clubVersion,
  clubsLoading,
  onClubPress,
  playersLoading,
  pickablePlayers,
  selectedIds,
  onToggle,
  disabledIds,
  maxSelected,
  score,
  onScoreChange,
}: MatchSideCardProps) {
  return (
    <Card style={styles.sideCard}>
      <Text style={styles.sideTitle}>{title}</Text>
      {clubsLoading ? <Skeleton height={40} /> : <ClubSelectButton clubVersion={clubVersion} onPress={onClubPress} />}
      {playersLoading ? (
        <Skeleton height={80} />
      ) : (
        <PlayerPicker players={pickablePlayers} selectedIds={selectedIds} onToggle={onToggle} disabledIds={disabledIds} maxSelected={maxSelected} />
      )}
      <ScoreStepper label="Score" value={score} onChange={onScoreChange} />
    </Card>
  );
});

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
  clubSelectButton: {
    alignSelf: "flex-start",
  },
  clubSelectPlaceholder: {
    ...typography.body,
    color: colors.accent,
    fontWeight: "700",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.accentSubtle,
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
  dateTimeRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  dateTimeField: {
    flex: 1,
  },
  dateTimeErrorText: {
    ...typography.caption,
    color: colors.danger,
    marginTop: -spacing.xs,
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
