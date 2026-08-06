import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Button } from "../../src/components/Button";
import { Card } from "../../src/components/Card";
import { EmptyState } from "../../src/components/EmptyState";
import { ErrorState } from "../../src/components/ErrorState";
import { InfoBanner } from "../../src/components/InfoBanner";
import { NextMatchPreviewCard } from "../../src/components/NextMatchPreviewCard";
import { PlayerPicker } from "../../src/components/PlayerPicker";
import { Screen } from "../../src/components/Screen";
import { SegmentedControl } from "../../src/components/SegmentedControl";
import { Skeleton } from "../../src/components/Skeleton";
import { useGroup } from "../../src/hooks/useGroup";
import { useLastWinnersStayParticipants } from "../../src/hooks/useLastWinnersStayParticipants";
import { useGroupMatchHistory, useMatch } from "../../src/hooks/useMatches";
import { usePlayers } from "../../src/hooks/usePlayers";
import { useWinnersStaySession } from "../../src/hooks/useWinnersStaySession";
import { useWinnersStaySessionHistory } from "../../src/hooks/useWinnersStaySessionHistory";
import { useTranslation } from "../../src/lib/i18n";
import { buildMatchPrefillParams } from "../../src/lib/matchPrefill";
import { toPickablePlayer, toRotationPlayer } from "../../src/lib/players";
import {
  acceptPendingRotation,
  addToQueue,
  advanceSessionAfterMatch,
  canAdvanceSession,
  cleanupInactiveQueueEntries,
  computeSessionSummary,
  drawInitialSingleSides,
  drawRandomInitialPairs,
  endSession,
  getSessionParticipantIds,
  moveQueueEntry,
  redrawSessionPartner,
  removeFromQueue,
  retryPendingRotation,
  startWinnersStaySession,
  undoLastRotation,
} from "../../src/lib/rotation/session";
import { archiveCompletedSession } from "../../src/lib/rotation/sessionHistory";
import { computeSessionInsights } from "../../src/lib/rotation/sessionInsights";
import type { MatchResult, RotationPlayer, SessionFormat, WinnersStaySession } from "../../src/lib/rotation/types";
import { colors, radius, spacing, typography } from "../../src/theme";

function newSessionId(): string {
  return `wss-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export default function WinnersStayScreen() {
  const { matchId, preselectPlayerIds } = useLocalSearchParams<{ matchId?: string; preselectPlayerIds?: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const { currentGroupId } = useGroup();
  const roster = usePlayers(currentGroupId);
  const groupHistory = useGroupMatchHistory(currentGroupId);
  const { session, isHydrated, isCorrupted, setSession, discardCorrupted } = useWinnersStaySession(currentGroupId);
  const { history: sessionHistory, setHistory: setSessionHistory } = useWinnersStaySessionHistory(currentGroupId);
  const { setParticipantIds: setLastParticipants } = useLastWinnersStayParticipants(currentGroupId);
  const matchQuery = useMatch(matchId);
  const [isEditingQueue, setIsEditingQueue] = useState(false);

  // Setup-screen state (only relevant while there's no active session).
  const [selectedPoolIds, setSelectedPoolIds] = useState<string[]>([]);
  const [pairMode, setPairMode] = useState<"random" | "manual">("random");
  const [manualPairAIds, setManualPairAIds] = useState<string[]>([]);
  const [manualPairBIds, setManualPairBIds] = useState<string[]>([]);

  const activePlayerIds = useMemo(() => (roster.data ?? []).map((p) => p.id), [roster.data]);

  const playersById = useMemo(() => {
    const map: Record<string, RotationPlayer> = {};
    for (const p of roster.data ?? []) map[p.id] = toRotationPlayer(p);
    if (session) {
      for (const p of session.currentPairA.players) map[p.id] ??= p;
      if (session.currentPairB) for (const p of session.currentPairB.players) map[p.id] ??= p;
    }
    return map;
  }, [roster.data, session]);

  // The Start Evening choice screen (app/(app)/start-evening.tsx) links here
  // with ?preselectPlayerIds=... when the user picked "Continue Previous
  // Session" -- pre-checks those players on the normal setup screen below
  // (never skips it -- the user still reviews/confirms and taps Start
  // Session themselves). Only fires once (hasAppliedPreselectRef), only
  // while there's no session already in progress (never stomps an active
  // session just because the param is still in the URL), and re-validates
  // against the current roster itself (defense in depth -- the choice
  // screen already filtered out archived/deleted players before building
  // this param, but a stale id slipping through here should be dropped,
  // not silently pre-select a player who can't actually be selected).
  const hasAppliedPreselectRef = useRef(false);
  useEffect(() => {
    if (hasAppliedPreselectRef.current || !preselectPlayerIds) return;
    if (!isHydrated || !roster.data) return;
    if (session && session.status !== "completed") return;

    hasAppliedPreselectRef.current = true;
    const activeIds = new Set(activePlayerIds);
    const ids = preselectPlayerIds.split(",").filter((id) => activeIds.has(id));
    if (ids.length > 0) setSelectedPoolIds(ids);
  }, [preselectPlayerIds, isHydrated, roster.data, session, activePlayerIds]);

  // Advance the session exactly once per new recorded match id.
  useEffect(() => {
    if (!matchId || !session || !matchQuery.data) return;
    const expectedMatchType = session.format === "group" ? "doubles" : "singles";
    if (matchQuery.data.match_type !== expectedMatchType) return;
    if (!canAdvanceSession(session, matchId)) return;

    // Task 3: a session only becomes "real" -- eligible for Continue
    // Previous Session, session history, etc. -- once its first match has
    // actually been saved. This is exactly that moment (roundNumber is
    // still 0, about to become 1), so the participant snapshot is captured
    // here and NOT at session-start time (see handleStartSession, which
    // deliberately skips this). Read from the pre-advance session so this
    // reflects the session's ORIGINAL starting lineup, not whatever the
    // rotation has since shuffled currentPairA/currentPairB/waitingQueue into.
    if (session.roundNumber === 0) {
      setLastParticipants(getSessionParticipantIds(session));
    }

    const [side1, side2] = matchQuery.data.sides;
    const result: MatchResult = side1.result === "win" ? "sideA" : side2.result === "win" ? "sideB" : "draw";

    setSession(advanceSessionAfterMatch({ session, matchId, result, playersById, activePlayerIds, now: new Date() }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId, matchQuery.data, session?.id, session?.lastRecordedMatchId]);

  // Safely drop any waiting-queue player who's since been archived or deleted -- only persists when the roster has actually loaded and something changed, so this never fights the advance effect above.
  useEffect(() => {
    if (!session || !roster.data || session.status !== "active") return;
    const cleaned = cleanupInactiveQueueEntries(session.waitingQueue, activePlayerIds);
    if (cleaned.length !== session.waitingQueue.length) setSession({ ...session, waitingQueue: cleaned });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, session?.waitingQueue, roster.data]);

  // Session-scoped highlights (winner, MVP, biggest upset, etc.) computed
  // from the group's actual recorded matches -- WinnersStaySession itself
  // only tracks round-by-round rotation state, not a full match log, so
  // this reconstructs "this session's matches" from the group's match
  // history by time window + participants. Only ever read for display;
  // nothing about the rotation engine itself depends on this. Must be an
  // unconditional top-level hook -- declared before EVERY early return in
  // this component (the hydration/corrupted-session guards below, and the
  // `!session` guard further down), not just the last of them, so the
  // exact same hooks run in the exact same order on every single render.
  const sessionInsights = useMemo(() => {
    // Only ever rendered in the completed-session summary below, but this
    // hook must stay unconditional (Rules of Hooks) -- so the early return
    // is what actually matters for performance: without it, every accept /
    // redraw / undo / queue edit during ACTIVE play would re-filter the
    // group's entire match history and recompute standings on every
    // render, just to throw the result away unused until the session ends.
    if (!session || session.status !== "completed") return null;
    const allMatches = groupHistory.data ?? [];
    const participantIds = new Set(session.activePlayerIds);
    const sessionMatches = allMatches.filter((m) => {
      if (m.match_type !== "doubles") return false;
      const playedAt = new Date(m.played_at).getTime();
      if (Number.isNaN(playedAt) || playedAt < new Date(session.startedAt).getTime()) return false;
      return m.sides.every((side) => side.players.every((p) => participantIds.has(p.id)));
    });
    const sessionRoster = (roster.data ?? []).filter((p) => participantIds.has(p.id));
    return computeSessionInsights(sessionRoster, sessionMatches);
  }, [session, groupHistory.data, roster.data]);

  // Same "declared before every early return" requirement as sessionInsights
  // above -- these two are plain useRefs, but a useRef declared after an
  // early return is exactly as much a Rules-of-Hooks violation as a useState
  // or useMemo would be.
  //
  // hasHandledBackToHomeRef guards against a rapid double-press (or a
  // synthetic double-fire in tests) running this twice before router.replace
  // unmounts the screen -- archiveCompletedSession is already idempotent by
  // session id, but this makes "exactly once" true of the handler itself,
  // not just of its eventual on-disk result.
  const hasHandledBackToHomeRef = useRef(false);
  const handleBackToHome = () => {
    if (hasHandledBackToHomeRef.current) return;
    hasHandledBackToHomeRef.current = true;
    if (session && session.roundNumber > 0) {
      // Archive first so the completed session's summary stays reachable
      // via history, THEN clear the active slot -- never the other way
      // around, or a crash between the two steps would lose the summary.
      // A session with zero recorded matches (roundNumber === 0) is only
      // ever a local draft -- per Task 3 it must never appear in session
      // history, so it's silently discarded instead of archived.
      setSessionHistory(archiveCompletedSession(sessionHistory, session, new Date().toISOString()));
    }
    setSession(null);
    // dismissAll (not replace) -- a session can rack up several pushed
    // screens underneath this one (each accept/redraw/record pushes a new
    // Record Match on top: see handleStartSession/handleAccept below), and
    // replace() only swaps the CURRENT top-of-stack screen, leaving every
    // earlier one mounted-but-hidden. Those hidden instances keep their own
    // live query subscriptions and re-render on every player/match
    // invalidation happening anywhere in the app for as long as they stay
    // mounted -- invisible work that was making Record Match feel slower
    // and slower each time you cycled through a session, since it never
    // got cleaned up. dismissAll() pops all the way back to Home, actually
    // unmounting the whole chain instead of leaving it buried in the stack.
    router.dismissAll();
  };

  // Same archive-then-clear data steps as handleBackToHome, but stays on
  // this screen -- clearing the session slot alone is enough to fall
  // through to the setup UI below (the same "!session" branch), so the
  // user lands straight back in session setup instead of at Home.
  const hasHandledStartNewRef = useRef(false);
  const handleStartNewSession = () => {
    if (hasHandledStartNewRef.current) return;
    hasHandledStartNewRef.current = true;
    // Same zero-match-draft guard as handleBackToHome above.
    if (session && session.roundNumber > 0) {
      setSessionHistory(archiveCompletedSession(sessionHistory, session, new Date().toISOString()));
    }
    setSession(null);
  };

  if (!isHydrated || roster.isLoading) {
    return (
      <Screen>
        <View style={styles.loading}>
          <Skeleton height={200} borderRadius={16} />
        </View>
      </Screen>
    );
  }

  if (isCorrupted) {
    return (
      <Screen>
        <EmptyState
          icon="⚠️"
          title={t("rotation.corruptedSessionTitle")}
          message={t("rotation.corruptedSessionMessage")}
          actionLabel={t("rotation.discardPreviousSession")}
          onAction={discardCorrupted}
        />
      </Screen>
    );
  }

  const handleStartSession = (pairA: RotationPlayer[], pairB: RotationPlayer[], waiting: RotationPlayer[], format: SessionFormat) => {
    if (!currentGroupId) return;
    const started = startWinnersStaySession({
      id: newSessionId(),
      groupId: currentGroupId,
      format,
      pairA,
      pairB,
      waitingPlayers: waiting,
      activePlayerIds,
      now: new Date(),
    });
    setSession(started);
    // Deliberately NOT calling setLastParticipants here -- see the "advance
    // session" effect above. Task 3: a session (and its participant list)
    // only becomes what "Continue Previous Session" can resume once its
    // first match is actually saved, not merely started -- otherwise an
    // abandoned zero-match draft would silently become the "previous
    // session" the moment its participants were picked.
    const matchType = format === "group" ? "doubles" : "singles";
    router.push({ pathname: "/record-match", params: { ...buildMatchPrefillParams(matchType, [pairA, pairB], null), source: "winnersStay" } });
  };

  const handleStartRandom = () => {
    const pool = selectedPoolIds.map((id) => playersById[id]).filter((p): p is RotationPlayer => !!p);
    if (pool.length < 2) return;
    if (pool.length < 4) {
      const { sideA, sideB, waiting } = drawInitialSingleSides(pool);
      handleStartSession(sideA, sideB, waiting, pool.length === 2 ? "duo" : "trio");
      return;
    }
    const { pairA, pairB, waiting } = drawRandomInitialPairs(pool);
    handleStartSession(pairA, pairB, waiting, "group");
  };

  const handleStartManual = () => {
    if (manualPairAIds.length !== 2 || manualPairBIds.length !== 2) return;
    const pairA = manualPairAIds.map((id) => playersById[id]!);
    const pairB = manualPairBIds.map((id) => playersById[id]!);
    const waitingIds = selectedPoolIds.filter((id) => !manualPairAIds.includes(id) && !manualPairBIds.includes(id));
    handleStartSession(pairA, pairB, waitingIds.map((id) => playersById[id]!), "group");
  };

  if (!session || session.status === "completed") {
    const summary = session ? computeSessionSummary(session) : null;
    const pickablePool = (roster.data ?? []).map(toPickablePlayer);
    // Manual pairing only makes sense once there are two full pairs to
    // choose (4+ players) -- for 2/3 selected players the format is fixed
    // (duo/trio), so the segmented control is hidden and this always
    // resolves to "random" regardless of any stale manual selection left
    // over from a previous, larger selection.
    const effectivePairMode = selectedPoolIds.length >= 4 ? pairMode : "random";

    return (
      <Screen>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {summary ? (
            <Card style={styles.summaryCard}>
              <Text style={styles.header}>{t("rotation.sessionSummary")}</Text>
              <SummaryRow label={t("rotation.roundsPlayed")} value={String(summary.roundsPlayed)} />
              <SummaryRow label={t("rotation.sessionDuration")} value={formatDuration(summary.durationMs)} />
              <SummaryRow label={t("rotation.playersUsed")} value={String(summary.playersUsedCount)} />
              <SummaryRow label={t("rotation.longestWinningRun")} value={String(summary.longestWinningRun)} />
              <Text style={styles.subLabel}>{t("rotation.finalQueue")}</Text>
              <Text style={styles.body} numberOfLines={3}>
                {summary.finalWaitingQueue.length === 0
                  ? t("rotation.emptyQueueMessage")
                  : summary.finalWaitingQueue.map((q) => playersById[q.playerId]?.display_name ?? q.playerId).join(", ")}
              </Text>

              {sessionInsights && sessionInsights.matchesPlayed > 0 ? (
                <View style={styles.sessionInsightsBlock}>
                  <Text style={styles.subLabel}>{t("rotation.sessionHighlights")}</Text>
                  <SummaryRow label={t("rotation.matchesPlayed")} value={String(sessionInsights.matchesPlayed)} />
                  <SummaryRow label={t("rotation.totalGoals")} value={String(sessionInsights.totalGoals)} />
                  {sessionInsights.winner ? (
                    <SummaryRow
                      label={t("rotation.sessionWinner")}
                      value={`${sessionInsights.winner.name} (${sessionInsights.winner.wins}W-${sessionInsights.winner.losses}L-${sessionInsights.winner.draws}D)`}
                    />
                  ) : null}
                  {sessionInsights.mvp ? (
                    <SummaryRow
                      label={t("rotation.sessionMvp")}
                      value={`${sessionInsights.mvp.name} (${sessionInsights.mvp.wins}W-${sessionInsights.mvp.losses}L-${sessionInsights.mvp.draws}D)`}
                    />
                  ) : null}
                  {sessionInsights.highestScoringMatch ? (
                    <SummaryRow
                      label={t("rotation.highestScoringMatch")}
                      value={`${sessionInsights.highestScoringMatch.holderName} (${t(sessionInsights.highestScoringMatch.valueLabelKey, sessionInsights.highestScoringMatch.valueLabelParams)})`}
                    />
                  ) : null}
                  {sessionInsights.bestClub ? (
                    <SummaryRow
                      label={t("rotation.bestClub")}
                      value={`${sessionInsights.bestClub.clubName} (${sessionInsights.bestClub.wins}W-${sessionInsights.bestClub.losses}L-${sessionInsights.bestClub.draws}D)`}
                    />
                  ) : null}
                  {sessionInsights.biggestUpset ? (
                    <SummaryRow
                      label={t("rotation.biggestUpset")}
                      value={t("rotation.biggestUpsetValue", {
                        winner: sessionInsights.biggestUpset.winnerName,
                        loser: sessionInsights.biggestUpset.loserName,
                        score: sessionInsights.biggestUpset.scoreLabel,
                      })}
                    />
                  ) : null}
                </View>
              ) : null}

              <View style={styles.summaryActionsRow}>
                <Button label={t("rotation.backToHomeFromSummary")} size="md" onPress={handleBackToHome} />
                <Button label={t("leagueTable.title")} variant="secondary" size="md" onPress={() => router.push("/league-table")} />
                <Button label={t("rotation.startNewSession")} variant="secondary" size="md" onPress={handleStartNewSession} />
              </View>
            </Card>
          ) : null}

          {sessionHistory.length > 0 ? (
            <Card style={styles.summaryCard}>
              <Text style={styles.header}>{t("rotation.pastSessions")}</Text>
              {sessionHistory.slice(0, 5).map((record) => (
                <View key={record.id} style={styles.pastSessionRow}>
                  <Text style={styles.body}>{new Date(record.endedAt).toLocaleDateString()}</Text>
                  <Text style={styles.pastSessionDetail}>
                    {t("rotation.roundsPlayed")}: {record.summary.roundsPlayed} · {formatDuration(record.summary.durationMs)}
                  </Text>
                </View>
              ))}
            </Card>
          ) : null}

          <Card style={styles.setupCard}>
            <Text style={styles.header}>{t("rotation.selectPlayersTitle")}</Text>
            <Text style={styles.body}>{t("rotation.selectPlayersMessage")}</Text>
            <PlayerPicker players={pickablePool} selectedIds={selectedPoolIds} onToggle={(id) => setSelectedPoolIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))} maxSelected={pickablePool.length} />

            {selectedPoolIds.length >= 4 ? (
              <>
                <Text style={styles.subLabel}>{t("rotation.initialPairMode")}</Text>
                <SegmentedControl
                  options={[
                    { value: "random", label: t("rotation.randomPairs") },
                    { value: "manual", label: t("rotation.manualPairs") },
                  ]}
                  value={pairMode}
                  onChange={setPairMode}
                />
              </>
            ) : null}

            {selectedPoolIds.length === 2 || selectedPoolIds.length === 3 ? (
              <InfoBanner tone="info" message={t(selectedPoolIds.length === 2 ? "rotation.formatLabelDuo" : "rotation.formatLabelTrio")} />
            ) : null}

            {effectivePairMode === "manual" && selectedPoolIds.length >= 4 ? (
              <>
                <Text style={styles.subLabel}>{t("rotation.winningPairLabel")} A</Text>
                <PlayerPicker
                  players={pickablePool.filter((p) => selectedPoolIds.includes(p.id))}
                  selectedIds={manualPairAIds}
                  onToggle={(id) => setManualPairAIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 2 ? [...prev, id] : prev))}
                  disabledIds={manualPairBIds}
                  maxSelected={2}
                />
                <Text style={styles.subLabel}>{t("rotation.winningPairLabel")} B</Text>
                <PlayerPicker
                  players={pickablePool.filter((p) => selectedPoolIds.includes(p.id))}
                  selectedIds={manualPairBIds}
                  onToggle={(id) => setManualPairBIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 2 ? [...prev, id] : prev))}
                  disabledIds={manualPairAIds}
                  maxSelected={2}
                />
              </>
            ) : null}

            {selectedPoolIds.length < 2 ? <InfoBanner tone="warning" message={t("rotation.notEnoughSelected")} /> : null}

            <Button
              label={t("rotation.startSession")}
              disabled={selectedPoolIds.length < 2 || (effectivePairMode === "manual" && (manualPairAIds.length !== 2 || manualPairBIds.length !== 2))}
              onPress={effectivePairMode === "random" ? handleStartRandom : handleStartManual}
            />
            <Button label={t("rotation.moreDrawOptions")} variant="ghost" size="sm" onPress={() => router.push("/draw")} />
          </Card>
        </ScrollView>
      </Screen>
    );
  }

  // From here on, session is active.
  const canUndo = session.previousSnapshot !== null;

  const handleAccept = () => {
    if (!session.pendingRotation?.opposingPair) return;
    const accepted = acceptPendingRotation(session, new Date());
    setSession(accepted);
    const matchType = session.format === "group" ? "doubles" : "singles";
    router.push({
      pathname: "/record-match",
      params: { ...buildMatchPrefillParams(matchType, [accepted.currentPairA.players, accepted.currentPairB!.players], null), source: "winnersStay" },
    });
  };

  const handleRedraw = () => setSession(redrawSessionPartner(session));

  const handleRetry = () => setSession(retryPendingRotation(session, playersById, new Date()));

  const handleUndo = () => setSession(undoLastRotation(session, new Date()));

  const handleEndSession = () => setSession(endSession(session, new Date()));

  const handleResetSession = () => setSession(null);

  const handleRecordCurrentMatch = () => {
    if (!session.currentPairB) return;
    const matchType = session.format === "group" ? "doubles" : "singles";
    router.push({
      pathname: "/record-match",
      params: { ...buildMatchPrefillParams(matchType, [session.currentPairA.players, session.currentPairB.players], null), source: "winnersStay" },
    });
  };

  const queuePlayers = session.waitingQueue.map((q) => ({ item: q, player: playersById[q.playerId] })).filter((row): row is { item: (typeof session.waitingQueue)[number]; player: RotationPlayer } => !!row.player);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.sessionHeader}>
          <Text style={styles.header}>{t("rotation.title")}</Text>
          <Text style={styles.roundLabel}>
            {t("rotation.round")} {session.roundNumber + 1}
          </Text>
        </View>

        {matchQuery.isError ? <ErrorState /> : null}

        {session.pendingRotation ? (
          <NextMatchPreviewCard
            result={session.pendingRotation}
            playersById={playersById}
            explanation={t(session.pendingRotation.reason.key, session.pendingRotation.reason.params)}
            labels={{
              title: t("rotation.nextMatchLabel"),
              winningPair: t("rotation.winningPairLabel"),
              incomingPair: t("rotation.incomingPairLabel"),
              waitingQueue: t("rotation.waitingQueueLabel"),
              emptyQueue: t("rotation.emptyQueueMessage"),
              notEnoughPlayersTitle: t("rotation.notEnoughPlayersTitle"),
              notEnoughPlayersMessage: t("rotation.notEnoughPlayersMessage"),
              drawRotation: t("rotation.drawRotationLabel"),
              acceptNextMatch: t("rotation.acceptNextMatch"),
              redrawPartner: t("rotation.redrawPartnerLabel"),
              cancel: t("common.cancel"),
            }}
            onAccept={handleAccept}
            onRedrawPartner={session.pendingRotation.selectionSource === "randomFromLosers" ? handleRedraw : undefined}
            onCancel={() => router.back()}
          />
        ) : session.currentPairB ? (
          <Card style={styles.matchCard}>
            <Text style={styles.subLabel}>{t("rotation.currentMatch")}</Text>
            <PairLine label={t("rotation.winningPairLabel")} pair={session.currentPairA} />
            <PairLine label={t("rotation.incomingPairLabel")} pair={session.currentPairB} />
            <Text style={styles.body}>{t("rotation.waitingForResult")}</Text>
            <Button label={t("rotation.recordResult")} onPress={handleRecordCurrentMatch} />
          </Card>
        ) : (
          <Card style={styles.matchCard}>
            <InfoBanner tone="warning" message={t("rotation.notEnoughPlayersMessage")} />
            <Button label={t("common.retry")} variant="secondary" onPress={handleRetry} />
          </Card>
        )}

        {session.format !== "duo" ? (
          <Card style={styles.queueCard}>
            <View style={styles.queueHeader}>
              <Text style={styles.subLabel}>{t("rotation.waitingQueueLabel")}</Text>
              <Text style={styles.linkAction} onPress={() => setIsEditingQueue((prev) => !prev)}>
                {isEditingQueue ? t("rotation.doneEditingQueue") : t("rotation.editQueue")}
              </Text>
            </View>

            {queuePlayers.length === 0 ? (
              <Text style={styles.body}>{t("rotation.emptyQueueMessage")}</Text>
            ) : (
              queuePlayers.map(({ item, player }, index) => (
                <View key={item.playerId} style={styles.queueRow}>
                  <Text style={styles.queuePosition}>{index + 1}</Text>
                  <Text style={styles.queueName} numberOfLines={1}>
                    {player.display_name}
                  </Text>
                  {isEditingQueue ? (
                    <View style={styles.queueActions}>
                      <Text
                        style={[styles.linkAction, index === 0 && styles.linkActionDisabled]}
                        onPress={() => index > 0 && setSession({ ...session, waitingQueue: moveQueueEntry(session.waitingQueue, item.playerId, "up") })}
                      >
                        {t("rotation.moveUp")}
                      </Text>
                      <Text
                        style={[styles.linkAction, index === queuePlayers.length - 1 && styles.linkActionDisabled]}
                        onPress={() => index < queuePlayers.length - 1 && setSession({ ...session, waitingQueue: moveQueueEntry(session.waitingQueue, item.playerId, "down") })}
                      >
                        {t("rotation.moveDown")}
                      </Text>
                      <Text style={styles.linkActionDanger} onPress={() => setSession({ ...session, waitingQueue: removeFromQueue(session.waitingQueue, item.playerId) })}>
                        {t("rotation.removeFromQueue")}
                      </Text>
                    </View>
                  ) : null}
                </View>
              ))
            )}

            {isEditingQueue && session.format === "group" ? (
              // Adding a brand-new player to the queue only makes sense for
              // "group" sessions -- duo/trio's format is fixed for the
              // session's lifetime (exactly 2 or exactly 3 participants), so
              // growing the queue here would silently change what kind of
              // session this is, which nothing downstream expects.
              <PlayerPicker
                players={(roster.data ?? [])
                  .filter((p) => !session.waitingQueue.some((q) => q.playerId === p.id))
                  .filter((p) => !session.currentPairA.players.some((pl) => pl.id === p.id))
                  .filter((p) => !session.currentPairB || !session.currentPairB.players.some((pl) => pl.id === p.id))
                  .map(toPickablePlayer)}
                selectedIds={[]}
                onToggle={(id) => {
                  const p = playersById[id];
                  if (p) setSession({ ...session, waitingQueue: addToQueue(session.waitingQueue, p) });
                }}
                maxSelected={1}
              />
            ) : null}
          </Card>
        ) : null}

        <Card style={styles.actionsCard}>
          {canUndo ? (
            <>
              <Button label={t("rotation.undoRotation")} variant="secondary" onPress={handleUndo} />
              <Text style={styles.footnote}>{t("rotation.matchNotDeleted")}</Text>
            </>
          ) : null}
          <Button label={t("rotation.endSession")} variant="secondary" onPress={handleEndSession} />
          <Button label={t("rotation.resetSession")} variant="danger" onPress={handleResetSession} />
        </Card>
      </ScrollView>
    </Screen>
  );
}

function PairLine({ label, pair }: { label: string; pair: { players: RotationPlayer[]; consecutiveMatchesPlayed: number } }) {
  const { t } = useTranslation();
  return (
    <View style={styles.pairLine}>
      <Text style={styles.pairLineLabel}>{label}</Text>
      <Text style={styles.pairLineNames} numberOfLines={1} ellipsizeMode="tail">
        {pair.players.map((p) => p.display_name).join(" & ")}
      </Text>
      <Text style={styles.pairLineStreak}>
        {t("rotation.consecutiveMatches")}: {pair.consecutiveMatchesPlayed}
      </Text>
    </View>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  const { isRTL } = useTranslation();
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.body}>{label}</Text>
      <Text style={[styles.summaryValue, { textAlign: isRTL ? "left" : "right" }]} numberOfLines={2} ellipsizeMode="tail">
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    padding: spacing.lg,
  },
  content: {
    gap: spacing.md,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  header: {
    ...typography.title,
  },
  body: {
    ...typography.body,
  },
  subLabel: {
    ...typography.caption,
  },
  sessionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  roundLabel: {
    ...typography.bodyStrong,
    color: colors.accent,
  },
  matchCard: {
    gap: spacing.sm,
  },
  pairLine: {
    gap: 2,
  },
  pairLineLabel: {
    ...typography.small,
  },
  pairLineNames: {
    ...typography.bodyStrong,
  },
  pairLineStreak: {
    ...typography.small,
    color: colors.textSecondary,
  },
  queueCard: {
    gap: spacing.sm,
  },
  queueHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  queueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  queuePosition: {
    ...typography.small,
    color: colors.textMuted,
    width: 20,
  },
  queueName: {
    ...typography.body,
    flex: 1,
  },
  queueActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  linkAction: {
    ...typography.small,
    color: colors.accent,
    fontWeight: "600",
  },
  linkActionDisabled: {
    opacity: 0.3,
  },
  linkActionDanger: {
    ...typography.small,
    color: colors.danger,
    fontWeight: "600",
  },
  actionsCard: {
    gap: spacing.sm,
  },
  footnote: {
    ...typography.small,
    textAlign: "center",
  },
  setupCard: {
    gap: spacing.md,
  },
  summaryCard: {
    gap: spacing.sm,
  },
  sessionInsightsBlock: {
    gap: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    paddingTop: spacing.sm,
    marginTop: spacing.xs,
  },
  summaryActionsRow: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  pastSessionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.xs,
  },
  pastSessionDetail: {
    ...typography.small,
    color: colors.textSecondary,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  summaryValue: {
    ...typography.bodyStrong,
    color: colors.accent,
    flex: 1,
    flexShrink: 1,
  },
});
