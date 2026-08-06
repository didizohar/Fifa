import { memo, useRef, useState } from "react";
import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { useClubVersions } from "../hooks/useClubVersions";
import { useLastWinnersStayParticipants } from "../hooks/useLastWinnersStayParticipants";
import { useMatches } from "../hooks/useMatches";
import { useNationalTeamsPreference } from "../hooks/useNationalTeamsPreference";
import { usePlayers } from "../hooks/usePlayers";
import { useRecordMatch } from "../hooks/useRecordMatch";
import { useSeasons } from "../hooks/useSeasons";
import { useWinnersStaySession } from "../hooks/useWinnersStaySession";
import { filterClubsByPool } from "../lib/clubPools";
import { filterClubVersionsForRandomGeneration } from "../lib/clubRepository";
import { useTranslation } from "../lib/i18n";
import { matchSideLabel } from "../lib/format";
import { toRotationPlayer } from "../lib/players";
import { getPreviousMatchClubs, swapPreviousMatchClubs } from "../lib/previousMatchClubs";
import { filterValidClubVersions } from "../lib/random/clubs";
import { drawClubsForMatch } from "../lib/random/matchClubDraw";
import { acceptPendingRotation, advanceSessionAfterMatch, canAdvanceSession, getSessionParticipantIds } from "../lib/rotation/session";
import type { MatchResult, RotationPlayer } from "../lib/rotation/types";
import type { MatchType } from "../lib/types/database";
import { validateMatchForm } from "../lib/validation/matchForm";
import { colors, spacing, typography } from "../theme";
import { Button } from "./Button";
import { Card } from "./Card";
import { ClubBadge } from "./ClubBadge";
import { InfoBanner } from "./InfoBanner";
import { ScoreStepper } from "./ScoreStepper";

interface QuickMatchCardProps {
  groupId: string | null;
  gameVersionId: string | null | undefined;
}

/**
 * Compact "record the next Winners Stay matchup" card for the Dashboard --
 * NOT a second match-recording system. Every piece of actual business logic
 * here is the exact same function the full Record Match / Winners Stay
 * screens call: validateMatchForm, drawClubsForMatch, getPreviousMatchClubs/
 * swapPreviousMatchClubs, useRecordMatch's mutation, and
 * advanceSessionAfterMatch/acceptPendingRotation for session rotation. This
 * component only composes them into a smaller UI and decides WHEN to call
 * them -- it never re-implements what they do.
 *
 * Self-contained (owns its own hooks/local state) so its score/club state
 * changing never re-renders the Dashboard or any sibling card -- see
 * index.tsx, which passes only two stable primitive props.
 */
export const QuickMatchCard = memo(function QuickMatchCard({ groupId, gameVersionId }: QuickMatchCardProps) {
  const { t } = useTranslation();
  const router = useRouter();

  const { session, isHydrated, setSession } = useWinnersStaySession(groupId);
  const roster = usePlayers(groupId);
  const { data: clubVersions, isLoading: clubsLoading } = useClubVersions(gameVersionId ?? undefined);
  const previousMatchQuery = useMatches(groupId, 1);
  const { includeNationalTeams } = useNationalTeamsPreference(groupId);
  const { data: seasons } = useSeasons(groupId);
  const activeSeasonId = (seasons ?? []).find((s) => s.is_active)?.id ?? null;
  const recordMatch = useRecordMatch(groupId);
  const { setParticipantIds: setLastParticipants } = useLastWinnersStayParticipants(groupId);

  // Local-only, reset the moment the matchup itself changes (a new round,
  // or a different session entirely) -- see the render-time reset below.
  // Never touches the network until Save is pressed.
  const [side1ClubId, setSide1ClubId] = useState<string | null>(null);
  const [side2ClubId, setSide2ClubId] = useState<string | null>(null);
  const [side1Score, setSide1Score] = useState(0);
  const [side2Score, setSide2Score] = useState(0);
  const [clubDrawFailed, setClubDrawFailed] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  // Synchronous double-tap guard, same pattern as record-match.tsx's submitGuardRef -- isPending is only as fresh as the last render, this ref is authoritative the instant Save actually runs.
  const submitGuardRef = useRef(false);

  const matchupKey = session ? `${session.id}:${session.roundNumber}` : null;
  const [lastMatchupKey, setLastMatchupKey] = useState(matchupKey);
  if (matchupKey !== lastMatchupKey) {
    // A new matchup is on screen (either this session just advanced, or a
    // different session entirely) -- reset every locally-held field. This
    // runs during render (the documented React pattern for "derive state
    // from a changing key"), not in a useEffect, so there's no extra
    // commit where the OLD matchup's clubs/score would flash against the
    // NEW matchup's players.
    setLastMatchupKey(matchupKey);
    setSide1ClubId(null);
    setSide2ClubId(null);
    setSide1Score(0);
    setSide2Score(0);
    setClubDrawFailed(false);
    setErrors([]);
  }

  const rosterIds = new Set((roster.data ?? []).map((p) => p.id));
  const isSessionReady =
    !!session && session.groupId === groupId && session.status === "active" && !session.pendingRotation && session.currentPairB !== null;
  const matchupPlayers: RotationPlayer[] = isSessionReady ? [...session!.currentPairA.players, ...session!.currentPairB!.players] : [];
  const matchupPlayersPresent = isSessionReady && matchupPlayers.every((p) => rosterIds.has(p.id));
  const visible = isHydrated && isSessionReady && matchupPlayersPresent && !!gameVersionId && !clubsLoading;

  if (!visible || !session || !session.currentPairB) return null;

  const side1Players = session.currentPairA.players;
  const side2Players = session.currentPairB.players;
  const side1PlayerIds = side1Players.map((p) => p.id);
  const side2PlayerIds = side2Players.map((p) => p.id);
  const matchType: MatchType = session.format === "group" ? "doubles" : "singles";
  const side1Label = matchSideLabel(side1Players.map((p) => p.display_name));
  const side2Label = matchSideLabel(side2Players.map((p) => p.display_name));

  const side1Club = clubVersions?.find((cv) => cv.id === side1ClubId) ?? null;
  const side2Club = clubVersions?.find((cv) => cv.id === side2ClubId) ?? null;

  const validClubPool = filterClubVersionsForRandomGeneration(filterValidClubVersions(clubVersions ?? []), { includeNationalTeams, includeCustom: true });

  const drawPool = (mode: "large" | "small") => {
    const pool = filterClubsByPool(validClubPool, mode);
    const outcome = drawClubsForMatch({ clubs: pool, starMode: "anyStrength", allowDuplicates: false });
    if (!outcome.ok) {
      setClubDrawFailed(true);
      return;
    }
    setClubDrawFailed(false);
    setSide1ClubId(outcome.result.clubA.id);
    setSide2ClubId(outcome.result.clubB.id);
  };

  const previousMatch = previousMatchQuery.data?.[0];
  const rawPreviousClubs = getPreviousMatchClubs(previousMatch);
  const previousMatchClubs =
    rawPreviousClubs && clubVersions && clubVersions.some((cv) => cv.id === rawPreviousClubs.side1ClubVersionId) && clubVersions.some((cv) => cv.id === rawPreviousClubs.side2ClubVersionId)
      ? rawPreviousClubs
      : null;

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

  const handleSave = async () => {
    if (!groupId || !gameVersionId || recordMatch.isPending || submitGuardRef.current) return;

    const validation = validateMatchForm(
      {
        matchType,
        side1: { clubVersionId: side1ClubId, playerIds: side1PlayerIds, score: side1Score },
        side2: { clubVersionId: side2ClubId, playerIds: side2PlayerIds, score: side2Score },
        isPenalties: false,
        penaltyScore1: null,
        penaltyScore2: null,
      },
      (roster.data ?? []).map((p) => p.id),
    );
    if (!validation.ok) {
      setErrors(validation.errors);
      return;
    }

    setErrors([]);
    submitGuardRef.current = true;
    try {
      const newMatchId = await recordMatch.mutateAsync({
        groupId,
        seasonId: activeSeasonId,
        gameVersionId,
        matchType,
        isOvertime: false,
        isPenalties: false,
        sides: [
          { clubVersionId: side1ClubId!, score: side1Score, penaltyScore: null, result: validation.side1Result, playerIds: side1PlayerIds },
          { clubVersionId: side2ClubId!, score: side2Score, penaltyScore: null, result: validation.side2Result, playerIds: side2PlayerIds },
        ],
      });

      // Reuse the exact same session-advancement engine winners-stay.tsx's
      // own "advance session" effect calls -- this never re-derives
      // rotation/duo logic itself.
      if (!canAdvanceSession(session, newMatchId)) return;
      if (session.roundNumber === 0) {
        // Task 3: a session only becomes "real" (resumable via Continue
        // Previous Session) once its first match actually saves -- same
        // rule, same moment, same helper as winners-stay.tsx.
        setLastParticipants(getSessionParticipantIds(session));
      }

      const result: MatchResult = validation.side1Result === "win" ? "sideA" : validation.side2Result === "win" ? "sideB" : "draw";
      const playersById: Record<string, RotationPlayer> = {};
      for (const p of roster.data ?? []) playersById[p.id] = toRotationPlayer(p);
      for (const p of [...side1Players, ...side2Players]) playersById[p.id] ??= p;
      const activePlayerIds = (roster.data ?? []).map((p) => p.id);

      let advanced = advanceSessionAfterMatch({ session, matchId: newMatchId, result, playersById, activePlayerIds, now: new Date() });
      // Quick Match has no room for a separate "review/redraw next matchup"
      // step -- if a valid next matchup was computed, accept it immediately
      // (the exact same acceptPendingRotation the full Winners Stay screen's
      // own "Accept Next Match" button calls). If there wasn't enough
      // waiting to fill it (Case 4), leave it pending -- the card's own
      // visibility check above will hide it next render (no valid current
      // matchup), and the user can resolve it from the full Winners Stay
      // screen.
      if (advanced.pendingRotation?.opposingPair) {
        advanced = acceptPendingRotation(advanced, new Date());
      }
      setSession(advanced);
    } catch (e) {
      setErrors([e instanceof Error ? e.message : t("editMatch.genericError")]);
    } finally {
      submitGuardRef.current = false;
    }
  };

  const canApplyPreviousClubs = !!previousMatchClubs;
  const canSave = !!side1ClubId && !!side2ClubId && !recordMatch.isPending;

  return (
    <Card variant="elevated" style={styles.card}>
      <Text style={styles.title}>{t("home.quickMatchTitle")}</Text>

      <View style={styles.matchupRow}>
        <Text style={styles.playerName} numberOfLines={1}>
          {side1Label}
        </Text>
        <Text style={styles.vs}>{t("home.quickClubDrawVs")}</Text>
        <Text style={styles.playerName} numberOfLines={1}>
          {side2Label}
        </Text>
      </View>

      <View style={styles.clubRow}>
        <View style={styles.clubCol}>{side1Club ? <ClubBadge name={side1Club.club.name} starRating={side1Club.star_rating} size="sm" /> : <Text style={styles.noClub}>{t("home.quickMatchNoClubSelected")}</Text>}</View>
        <View style={styles.clubCol}>{side2Club ? <ClubBadge name={side2Club.club.name} starRating={side2Club.star_rating} size="sm" /> : <Text style={styles.noClub}>{t("home.quickMatchNoClubSelected")}</Text>}</View>
      </View>

      <View style={styles.scoreRow}>
        <ScoreStepper label={side1Label} value={side1Score} onChange={setSide1Score} />
        <ScoreStepper label={side2Label} value={side2Score} onChange={setSide2Score} />
      </View>

      {clubDrawFailed ? <InfoBanner tone="warning" message={t("rotation.notEnoughClubsOverall")} /> : null}

      <View style={styles.actionsRow}>
        <Button label={t("home.quickClubDrawPoolLarge")} variant="secondary" size="md" style={styles.actionButton} onPress={() => drawPool("large")} />
        <Button label={t("home.quickClubDrawPoolSmall")} variant="secondary" size="md" style={styles.actionButton} onPress={() => drawPool("small")} />
      </View>

      <View style={styles.actionsRow}>
        <Button label={t("rotation.sameClubsAction")} variant="secondary" size="md" style={styles.actionButton} onPress={applySameClubs} disabled={!canApplyPreviousClubs} />
        <Button label={t("rotation.swapClubsAction")} variant="secondary" size="md" style={styles.actionButton} onPress={applySwapClubs} disabled={!canApplyPreviousClubs} />
      </View>

      <Button label={t("rotation.title")} variant="ghost" size="sm" onPress={() => router.push("/winners-stay")} />

      {errors.length > 0 ? <Text style={styles.errorText}>{errors[0]}</Text> : null}

      <Button label={t("editMatch.saveMatchAction")} onPress={handleSave} loading={recordMatch.isPending} disabled={!canSave} />
    </Card>
  );
});

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
  },
  title: {
    ...typography.heading,
  },
  matchupRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  playerName: {
    ...typography.bodyStrong,
    flex: 1,
    textAlign: "center",
  },
  vs: {
    ...typography.small,
    color: colors.textMuted,
  },
  clubRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  clubCol: {
    flex: 1,
    alignItems: "center",
  },
  noClub: {
    ...typography.small,
    color: colors.textMuted,
    paddingVertical: spacing.sm,
  },
  scoreRow: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  actionsRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  actionButton: {
    flex: 1,
  },
  errorText: {
    ...typography.caption,
    color: colors.danger,
    textAlign: "center",
  },
});
