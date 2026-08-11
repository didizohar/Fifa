import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Stack, useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { Pressable, ScrollView, Switch, Text, View } from "react-native";
import { AppChipGroup, type ChipOption } from "../../src/components/AppChipGroup";
import { Button } from "../../src/components/Button";
import { Card } from "../../src/components/Card";
import { ClubBadge } from "../../src/components/ClubBadge";
import { ClubPickerSheet } from "../../src/components/ClubPickerSheet";
import { EmptyState } from "../../src/components/EmptyState";
import { ErrorState } from "../../src/components/ErrorState";
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
import { useMatch, useMatches } from "../../src/hooks/useMatches";
import { useNationalTeamsPreference } from "../../src/hooks/useNationalTeamsPreference";
import { usePlayers } from "../../src/hooks/usePlayers";
import { useRecentlyUsedClubs } from "../../src/hooks/useRecentlyUsedClubs";
import { useRecordMatch } from "../../src/hooks/useRecordMatch";
import { useRecordMatchAndAdvanceSession } from "../../src/hooks/useRecordMatchAndAdvanceSession";
import { confirmAction, notify } from "../../src/lib/confirm";
import { filterClubsByPool, type ClubPoolMode } from "../../src/lib/clubPools";
import { filterClubVersionsForRandomGeneration } from "../../src/lib/clubRepository";
import { matchSideLabel } from "../../src/lib/format";
import { useTranslation } from "../../src/lib/i18n";
import { type MatchPrefillRouteParams, validateMatchPrefill } from "../../src/lib/matchPrefill";
import { EditMatchError } from "../../src/lib/matchService";
import { toPickablePlayer, toRotationPlayer, type PickablePlayer } from "../../src/lib/players";
import { getPreviousMatchClubs, swapPreviousMatchClubs } from "../../src/lib/previousMatchClubs";
import { filterValidClubVersions } from "../../src/lib/random/clubs";
import { drawClubsForMatch } from "../../src/lib/random/matchClubDraw";
import { advanceSessionAfterMatch, isMatchLinkedToActiveWinnersStaySession } from "../../src/lib/rotation/session";
import type { MatchResult, RotationPlayer } from "../../src/lib/rotation/types";
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
import type { ThemeColors } from "../../src/theme/colors";
import { useTheme, type ThemeValue } from "../../src/theme/ThemeContext";

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
  const { colors, radius, spacing, typography } = useTheme();
  const styles = useRecordMatchStyles(colors, radius, spacing, typography);
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
  // The concurrency-safe path: used instead of recordMatch whenever this
  // create-mode save is linked to a currently-active Winners Stay session
  // (see handleSubmit) -- see recordMatchAndAdvanceSession's own comment
  // for why a plain record_match call isn't enough there.
  const recordMatchAndAdvance = useRecordMatchAndAdvanceSession(currentGroup?.id ?? null);
  const editMatch = useEditMatch(currentGroup?.id ?? null);
  const winnersStaySession = useWinnersStaySession(currentGroup?.id ?? null);
  // "Same Clubs"/"Swap Clubs" only make sense when starting a brand-new
  // match -- passing null in edit mode (rather than skipping the hook call,
  // which would break the rules of hooks) disables the query entirely via
  // useMatches' own enabled: !!groupId check, so editing a match never
  // fires this extra fetch.
  const previousMatchQuery = useMatches(!isEditMode ? currentGroup?.id ?? null : null, 1);
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
  // Synchronous, closure-independent lock against a rapid double-tap (or two
  // back-to-back presses in a test) both slipping into the actual save call.
  // isSubmitting is only ever as fresh as the last completed render of this
  // component; two calls issued before React has re-rendered would both see
  // the same stale (false) value and both proceed. This ref is authoritative
  // at the instant the save function actually runs, independent of render
  // timing -- set immediately before the mutation, cleared in `finally`
  // regardless of success/failure so a genuinely failed save can be retried.
  const submitGuardRef = useRef(false);

  // "Draw Clubs" -- only ever touches side1ClubId/side2ClubId, never the
  // players, pairings, score, or waiting queue. Available for every match,
  // not just ones started from Winners Stay. Three pools, no per-level
  // picker (see clubPools.ts) -- matches the simplified Dashboard Quick
  // Club Draw card so "Large/Small/Random" means the same thing everywhere.
  const [poolMode, setPoolMode] = useState<ClubPoolMode>("large");
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

  const handleDrawClubs = () => {
    // filterClubsByPool narrows to the selected pool's star-rating band (or
    // returns the pool unfiltered for "random"); drawClubsForMatch then just
    // runs a plain random draw over whatever it's given -- same shared
    // engine every other Club Draw surface uses, no separate pool-aware
    // assignment logic.
    const pool = filterClubsByPool(validClubPool, poolMode);
    const outcome = drawClubsForMatch({ clubs: pool, starMode: "anyStrength", allowDuplicates: !drawPreventDuplicates });
    if (!outcome.ok) {
      setClubDrawFailed(true);
      return;
    }
    setClubDrawFailed(false);
    setHasDrawnClubs(true);
    setSide1ClubId(outcome.result.clubA.id);
    setSide2ClubId(outcome.result.clubB.id);
  };

  // Only offered when the previous match's clubs are still real, selectable
  // options in the CURRENT club list -- e.g. if the group's default game
  // version changed since that match was played, its club_version_id may no
  // longer exist here, and silently applying a stale id would leave the
  // side showing "no club selected" with no visible explanation.
  const previousMatchClubs = useMemo(() => {
    const raw = getPreviousMatchClubs(previousMatchQuery.data?.[0]);
    if (!raw || !clubVersions) return null;
    const stillAvailable = clubVersions.some((cv) => cv.id === raw.side1ClubVersionId) && clubVersions.some((cv) => cv.id === raw.side2ClubVersionId);
    return stillAvailable ? raw : null;
  }, [previousMatchQuery.data, clubVersions]);

  const applySameClubs = () => {
    if (!previousMatchClubs) return;
    setSide1ClubId(previousMatchClubs.side1ClubVersionId);
    setSide2ClubId(previousMatchClubs.side2ClubVersionId);
  };

  const applySwapClubs = () => {
    if (!previousMatchClubs) return;
    const swapped = swapPreviousMatchClubs(previousMatchClubs);
    setSide1ClubId(swapped.side1ClubVersionId);
    setSide2ClubId(swapped.side2ClubVersionId);
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

  const poolOptions = useMemo<ChipOption<ClubPoolMode>[]>(
    () => [
      { id: "large", label: t("home.quickClubDrawPoolLarge") },
      { id: "small", label: t("home.quickClubDrawPoolSmall") },
      { id: "random", label: t("draw.poolRandom") },
    ],
    [t],
  );

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

  // Memoized on its actual primitive fields (not just wrapped in useMemo with
  // no real deps) -- a plain object literal rebuilt every render would give
  // isDirty's useMemo below a new reference on every keystroke/score tap,
  // silently defeating it: compareMatchSnapshots would re-run on every single
  // render instead of only when a tracked field actually changes.
  const currentDraft: EditableMatchDraft = useMemo(
    () => ({
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
    }),
    [matchType, side1ClubId, side1PlayerIds, side1Score, side2ClubId, side2PlayerIds, side2Score, isOvertime, isPenalties, penaltyScore1, penaltyScore2, notes, dateInput, timeInput],
  );
  // In create mode there's no "original" loaded from the server to diff
  // against -- BLANK_CREATE_DRAFT stands in for the untouched starting
  // state. Derived directly from render state (not mirrored into a ref)
  // so there is exactly one place that decides whether the form is dirty,
  // and it's trivially inspectable/testable instead of living inside an
  // event-listener closure.
  const originalDraft = isEditMode ? originalDraftRef.current : BLANK_CREATE_DRAFT;
  const isDirty = useMemo(
    () => (originalDraft ? compareMatchSnapshots(originalDraft, currentDraft).anyChanged : false),
    [originalDraft, currentDraft],
  );

  const isLinkedToWinnersStay = isEditMode && !!matchId && isMatchLinkedToActiveWinnersStaySession(winnersStaySession.session, matchId);

  const handleRecalculateRotation = () => {
    if (!winnersStaySession.session) return;
    winnersStaySession.setSession({ ...winnersStaySession.session, pendingRotation: null });
    notify(t("editMatch.rotationRecalculated"));
  };

  // Hardware/gesture back, the header's back button, and router.back() all
  // funnel through this same "beforeRemove" navigation event -- guarding it
  // once here covers every exit path, not just the button on this screen.
  // Depends on `isDirty` (a plain boolean) rather than reading a ref inside
  // the closure -- React only re-runs this effect when the boolean's VALUE
  // actually flips, so this still doesn't resubscribe on every keystroke
  // (e.g. typing in Notes), but there is no window where the listener could
  // read stale dirty state.
  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", (e) => {
      if (skipUnsavedGuardRef.current || !isDirty) return;
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
  }, [navigation, isDirty, t]);

  // Session-linked create-mode saves go through the atomic RPC instead of
  // the plain recordMatch mutation (see handleSubmit) -- isSubmitting must
  // reflect whichever one is actually in flight.
  const isSessionLinkedCreate = !isEditMode && isFromWinnersStay && !!winnersStaySession.session && winnersStaySession.version !== null;
  const isSubmitting = isEditMode ? editMatch.isPending : isSessionLinkedCreate ? recordMatchAndAdvance.isPending : recordMatch.isPending;

  const saveEdit = async (computed: ComputedMatchResult) => {
    if (!currentGroup || !matchId || submitGuardRef.current) return;
    const payload = reconcileEditedMatchResult(matchId, currentGroup.id, currentDraft, computed);
    if (!payload) {
      setDateTimeError(t("editMatch.invalidDateTime"));
      return;
    }
    submitGuardRef.current = true;
    try {
      await editMatch.mutateAsync(payload);
      // Save succeeded -- this is a programmatic "leave" the user just
      // asked for, not an accidental exit, so the unsaved-changes guard
      // must not intercept the router.replace below. No reset afterward:
      // replace() unmounts this screen (verified against this component's
      // own effect-cleanup behavior), so there's no future render of this
      // instance where a stale `true` could wrongly bypass a *real* future
      // unsaved-exit attempt.
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
    } finally {
      submitGuardRef.current = false;
    }
  };

  const handleSubmit = async () => {
    if (!currentGroup || isSubmitting || submitGuardRef.current) return;

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

      const changes = originalDraft ? compareMatchSnapshots(originalDraft, currentDraft) : null;
      if (changes && (changes.participantsChanged || changes.scoreOrResultChanged)) {
        confirmAction(t("editMatch.confirmTitle"), t("editMatch.confirmMessage"), t("editMatch.saveChanges"), () => saveEdit(validation), t("common.cancel"));
      } else {
        await saveEdit(validation);
      }
      return;
    }

    setErrors([]);
    submitGuardRef.current = true;

    const sides: [
      { clubVersionId: string; score: number; penaltyScore: number | null; result: "win" | "loss" | "draw"; playerIds: string[] },
      { clubVersionId: string; score: number; penaltyScore: number | null; result: "win" | "loss" | "draw"; playerIds: string[] },
    ] = [
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
    ];

    try {
      // Same reasoning as saveEdit above: this is the app navigating away
      // after a save the user just asked for, not an accidental exit --
      // the unsaved-changes guard must not intercept it. This is the exact
      // line that was missing before: without it, isDirty was still true
      // (a brand-new match's originalDraft is permanently BLANK_CREATE_DRAFT,
      // so it never "catches up" to a filled-in form on its own), so
      // router.replace's own beforeRemove event was blocked by the guard
      // and the unsaved-changes dialog appeared immediately on every save.
      if (isSessionLinkedCreate) {
        const session = winnersStaySession.session!;
        // Same computation QuickMatchCard's own handleSave uses, minus the
        // auto-accept of a resulting pendingRotation -- a user who came
        // through the full Winners Stay flow (source=winnersStay) expects
        // to land back on that screen for the normal Accept/Redraw review
        // step, not to have the next matchup silently pre-accepted here.
        const result: MatchResult = validation.side1Result === "win" ? "sideA" : validation.side2Result === "win" ? "sideB" : "draw";
        const playersById: Record<string, RotationPlayer> = {};
        for (const p of players ?? []) playersById[p.id] = toRotationPlayer(p);
        for (const p of [...session.currentPairA.players, ...(session.currentPairB?.players ?? [])]) playersById[p.id] ??= p;
        const activePlayerIds = (players ?? []).map((p) => p.id);
        const proposedNext = advanceSessionAfterMatch({ session, matchId: "pending", result, playersById, activePlayerIds, now: new Date() });

        const outcome = await recordMatchAndAdvance.mutateAsync({
          payload: {
            groupId: currentGroup.id,
            seasonId: activeSeasonId,
            gameVersionId: currentGroup.default_game_version_id!,
            matchType,
            isOvertime,
            isPenalties,
            penaltyWinnerSide: validation.penaltyWinnerSide,
            sides,
          },
          expectedVersion: winnersStaySession.version!,
          nextSession: proposedNext,
        });

        if (outcome.ok === "stale" || outcome.ok === "no_session") {
          // Another member already completed this round (or ended the
          // session) first -- nothing was written for this submission.
          // Converge on the current shared state and leave the form as-is
          // rather than navigating away, so the user can see what happened.
          setErrors([outcome.ok === "stale" ? t("home.quickMatchStaleSubmission") : t("home.quickMatchSessionEnded")]);
          await winnersStaySession.refetch();
          return;
        }

        const finalSession = { ...proposedNext, lastRecordedMatchId: outcome.matchId };
        winnersStaySession.adoptSession(finalSession, outcome.version);
        skipUnsavedGuardRef.current = true;
        router.replace(`/match/${outcome.matchId}`);
        return;
      }

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
        sides,
      });
      skipUnsavedGuardRef.current = true;
      router.replace(`/match/${newMatchId}`);
    } catch (e) {
      setErrors([e instanceof Error ? e.message : "Failed to record match."]);
    } finally {
      submitGuardRef.current = false;
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
    // avoidKeyboard only when there's actually a TextField on screen (the
    // date/time/notes fields, edit-mode only) -- wrapping the ENTIRE screen
    // (ScoreStepper, Club Draw chips, PlayerPicker, every Switch) in
    // TouchableWithoutFeedback's legacy responder just to support a
    // tap-outside-to-dismiss-keyboard gesture that has nothing to dismiss in
    // create mode is exactly the "touch-responder negotiation conflict with
    // modern Pressable/gesture handler components" Screen.tsx's own
    // avoidKeyboard doc already warns about -- a three-way responder race
    // between the outer ScrollView's pan responder, TouchableWithoutFeedback's
    // tap responder, and each button's own Pressable responder, most likely
    // to lose a rapid repeated-tap sequence (exactly the "change score
    // repeatedly" pattern) and only resolve once a scroll gesture forces the
    // ScrollView's responder to definitively win and reset the chain -- which
    // matches the reported "one scroll un-freezes it" behavior exactly. Create
    // mode (the path Winners Stay always uses) never renders a TextField at
    // all, so it never needed this wrapper in the first place.
    <Screen avoidKeyboard={isEditMode}>
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
            title={t("editMatch.tooFewPlayersTitle")}
            message={t("editMatch.tooFewPlayersMessage")}
            actionLabel={t("common.addPlayer")}
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
            { value: "singles" as const, label: t("common.matchTypeSinglesSpaced") },
            { value: "doubles" as const, label: t("common.matchTypeDoublesSpaced") },
          ]}
          value={matchType}
          onChange={changeMatchType}
        />

        <Card variant="elevated" style={styles.clubDrawCard}>
          <Text style={styles.sideTitle}>{t("rotation.drawClubsByStars")}</Text>
          <AppChipGroup
            mode="single"
            options={poolOptions}
            value={poolMode}
            onChange={setPoolMode}
            accessibilityLabel={t("rotation.drawClubsByStars")}
            style={styles.chipRow}
          />

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
                poolMode !== "random"
                  ? `${t("rotation.notEnoughClubsAtLevel")} ${t("rotation.chooseAnotherLevel")}`
                  : t("rotation.notEnoughClubsOverall")
              }
            />
          ) : null}

          <Button label={hasDrawnClubs ? t("rotation.drawClubsAgain") : t("rotation.drawClubsByStars")} onPress={handleDrawClubs} />

          {hasDrawnClubs && side1ClubId && side2ClubId ? (
            <View style={styles.clubDrawResultRow}>
              <ClubDrawResult label={t("rotation.side1Label")} playerNames={pairLabel(side1PlayerIds)} clubVersion={side1Club} />
              <ClubDrawResult label={t("rotation.side2Label")} playerNames={pairLabel(side2PlayerIds)} clubVersion={side2Club} />
            </View>
          ) : null}
        </Card>

        {!isEditMode && previousMatchClubs ? (
          <Card style={styles.quickActionsCard}>
            <Text style={styles.sideTitle}>{t("rotation.quickActionsTitle")}</Text>
            <View style={styles.quickActionsRow}>
              <Button label={t("rotation.sameClubsAction")} variant="secondary" size="md" style={styles.quickActionButton} onPress={applySameClubs} />
              <Button label={t("rotation.swapClubsAction")} variant="secondary" size="md" style={styles.quickActionButton} onPress={applySwapClubs} />
            </View>
            <Text style={styles.previousMatchPreview}>
              {t("rotation.previousMatchPreview", { side1: previousMatchClubs.side1ClubName, side2: previousMatchClubs.side2ClubName })}
            </Text>
          </Card>
        ) : null}

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
          tone="accentOrange"
        />

        <Card style={styles.optionsCard}>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>{t("editMatch.wentToOvertime")}</Text>
            <Switch
              value={isOvertime}
              onValueChange={setIsOvertime}
              trackColor={{ false: colors.border, true: colors.accentMuted }}
              thumbColor={colors.textPrimary}
            />
          </View>
          <View style={styles.switchRow}>
            <Text style={[styles.switchLabel, !scoresLevel && styles.switchLabelDisabled]}>
              {t("editMatch.decidedByPenalties")}
            </Text>
            <Switch
              value={isPenalties && scoresLevel}
              onValueChange={setIsPenalties}
              disabled={!scoresLevel}
              trackColor={{ false: colors.border, true: colors.accentMuted }}
              thumbColor={colors.textPrimary}
            />
          </View>
          {!scoresLevel ? <Text style={styles.hint}>{t("editMatch.penaltiesOnlyWhenLevel")}</Text> : null}
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

        <Button label={isEditMode ? t("editMatch.saveChanges") : t("editMatch.saveMatchAction")} onPress={handleSubmit} loading={isSubmitting} disabled={isSubmitting} />

        {isFromWinnersStay ? (
          <Button
            label={t("rotation.backToHome")}
            variant="secondary"
            // dismissAll (not replace) -- this screen was pushed on top of
            // an active Winners Stay session, which itself may have
            // several earlier Record Match instances stacked underneath it
            // (one per round played). replace() only swaps this one screen
            // for Home, leaving the whole hidden chain mounted -- each
            // still holding live query subscriptions that keep re-rendering
            // in the background on every player/match invalidation,
            // degrading responsiveness more with every session cycled
            // through. dismissAll() actually unmounts the whole chain.
            onPress={() => router.dismissAll()}
          />
        ) : null}
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
  const { colors, radius, spacing, typography } = useTheme();
  const styles = useRecordMatchStyles(colors, radius, spacing, typography);
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
  /** "primary" (default, blue) for side 1, "accentOrange" for side 2 -- matches the concept's two-tone scoreboard split. */
  tone?: "primary" | "accentOrange";
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
  tone = "primary",
}: MatchSideCardProps) {
  const { t } = useTranslation();
  const { colors, radius, spacing, typography } = useTheme();
  const styles = useRecordMatchStyles(colors, radius, spacing, typography);
  return (
    <Card style={styles.sideCard}>
      <Text style={styles.sideTitle}>{title}</Text>
      {clubsLoading ? <Skeleton height={40} /> : <ClubSelectButton clubVersion={clubVersion} onPress={onClubPress} />}
      {playersLoading ? (
        <Skeleton height={80} />
      ) : (
        <PlayerPicker players={pickablePlayers} selectedIds={selectedIds} onToggle={onToggle} disabledIds={disabledIds} maxSelected={maxSelected} />
      )}
      <ScoreStepper label={t("common.scoreLabel")} value={score} onChange={onScoreChange} tone={tone} />
    </Card>
  );
});

function ClubDrawResult({ label, playerNames, clubVersion }: { label: string; playerNames: string; clubVersion: ClubVersion | null }) {
  const { colors, radius, spacing, typography } = useTheme();
  const styles = useRecordMatchStyles(colors, radius, spacing, typography);
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

function useRecordMatchStyles(colors: ThemeColors, radius: ThemeValue["radius"], spacing: ThemeValue["spacing"], typography: ThemeValue["typography"]) {
  return useMemo(
    () => ({
      content: { gap: spacing.lg, paddingVertical: spacing.lg, paddingBottom: spacing.xxl },
      prefillBanner: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.accent, backgroundColor: colors.accentSubtle, padding: spacing.md },
      prefillBannerText: { ...typography.small, color: colors.accent, textAlign: "center" as const },
      sideCard: { gap: spacing.md },
      sideTitle: { ...typography.heading },
      clubSelectButton: { alignSelf: "flex-start" as const },
      clubSelectPlaceholder: {
        ...typography.body,
        color: colors.accent,
        fontWeight: "700" as const,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.accent,
        backgroundColor: colors.accentSubtle,
      },
      clubDrawCard: { gap: spacing.md },
      chipRow: { gap: spacing.sm },
      quickActionsCard: { gap: spacing.sm },
      quickActionsRow: { flexDirection: "row" as const, gap: spacing.sm },
      quickActionButton: { flex: 1 },
      previousMatchPreview: { ...typography.small, color: colors.textSecondary, textAlign: "center" as const },
      clubDrawResultRow: { flexDirection: "row" as const, gap: spacing.md },
      clubDrawResult: { flex: 1, alignItems: "center" as const, gap: spacing.xs, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surfaceElevated },
      clubDrawResultLabel: { ...typography.small, color: colors.textSecondary },
      clubDrawResultNames: { ...typography.bodyStrong, textAlign: "center" as const },
      optionsCard: { gap: spacing.md },
      switchRow: { flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "space-between" as const },
      switchLabel: { ...typography.body },
      switchLabelDisabled: { color: colors.textMuted },
      hint: { ...typography.small, marginTop: -spacing.xs },
      penaltyRow: { flexDirection: "row" as const, justifyContent: "space-around" as const, paddingTop: spacing.sm },
      dateTimeRow: { flexDirection: "row" as const, gap: spacing.md },
      dateTimeField: { flex: 1 },
      dateTimeErrorText: { ...typography.caption, color: colors.danger, marginTop: -spacing.xs },
      errorBox: { backgroundColor: colors.dangerSubtle, borderRadius: radius.md, padding: spacing.md, gap: spacing.xs },
      errorText: { ...typography.caption, color: colors.danger },
    }),
    [colors, radius, spacing, typography],
  );
}
