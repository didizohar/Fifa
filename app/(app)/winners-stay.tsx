import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
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
import { useMatch } from "../../src/hooks/useMatches";
import { usePlayers } from "../../src/hooks/usePlayers";
import { useWinnersStaySession } from "../../src/hooks/useWinnersStaySession";
import { useTranslation } from "../../src/lib/i18n";
import type { MatchSidePlayer } from "../../src/lib/matches";
import { buildMatchPrefillParams } from "../../src/lib/matchPrefill";
import { toPickablePlayer } from "../../src/lib/players";
import {
  acceptPendingRotation,
  addToQueue,
  advanceWinnersStaySession,
  canAdvanceSession,
  cleanupInactiveQueueEntries,
  computeSessionSummary,
  drawRandomInitialPairs,
  endSession,
  moveQueueEntry,
  redrawSessionPartner,
  removeFromQueue,
  retryPendingRotation,
  startWinnersStaySession,
  undoLastRotation,
} from "../../src/lib/rotation/session";
import type { MatchResult, RotationPlayer, WinnersStaySession } from "../../src/lib/rotation/types";
import { colors, radius, spacing, typography } from "../../src/theme";

function toRotationPlayer(p: MatchSidePlayer): RotationPlayer {
  return { id: p.id, display_name: p.display_name, avatar_url: p.avatar_url, custom_color: p.custom_color };
}

function newSessionId(): string {
  return `wss-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export default function WinnersStayScreen() {
  const { matchId } = useLocalSearchParams<{ matchId?: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const { currentGroupId } = useGroup();
  const roster = usePlayers(currentGroupId);
  const { session, isHydrated, isCorrupted, setSession, discardCorrupted } = useWinnersStaySession(currentGroupId);
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

  // Advance the session exactly once per new recorded match id.
  useEffect(() => {
    if (!matchId || !session || !matchQuery.data || matchQuery.data.match_type !== "doubles") return;
    if (!canAdvanceSession(session, matchId)) return;

    const [side1, side2] = matchQuery.data.sides;
    const result: MatchResult = side1.result === "win" ? "sideA" : side2.result === "win" ? "sideB" : "draw";

    const advanced = advanceWinnersStaySession({
      session,
      matchId,
      result,
      playersById,
      activePlayerIds,
      now: new Date(),
    });
    setSession(advanced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId, matchQuery.data, session?.id, session?.lastRecordedMatchId]);

  // Safely drop any waiting-queue player who's since been archived or deleted -- only persists when the roster has actually loaded and something changed, so this never fights the advance effect above.
  useEffect(() => {
    if (!session || !roster.data || session.status !== "active") return;
    const cleaned = cleanupInactiveQueueEntries(session.waitingQueue, activePlayerIds);
    if (cleaned.length !== session.waitingQueue.length) setSession({ ...session, waitingQueue: cleaned });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, session?.waitingQueue, roster.data]);

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

  const handleStartSession = (pairA: [RotationPlayer, RotationPlayer], pairB: [RotationPlayer, RotationPlayer], waiting: RotationPlayer[]) => {
    if (!currentGroupId) return;
    const started = startWinnersStaySession({
      id: newSessionId(),
      groupId: currentGroupId,
      pairA,
      pairB,
      waitingPlayers: waiting,
      activePlayerIds,
      now: new Date(),
    });
    setSession(started);
    router.push({ pathname: "/record-match", params: buildMatchPrefillParams("doubles", [pairA, pairB], null) });
  };

  const handleStartRandom = () => {
    const pool = selectedPoolIds.map((id) => playersById[id]).filter((p): p is RotationPlayer => !!p);
    if (pool.length < 4) return;
    const { pairA, pairB, waiting } = drawRandomInitialPairs(pool);
    handleStartSession(pairA, pairB, waiting);
  };

  const handleStartManual = () => {
    if (manualPairAIds.length !== 2 || manualPairBIds.length !== 2) return;
    const pairA = manualPairAIds.map((id) => playersById[id]!) as [RotationPlayer, RotationPlayer];
    const pairB = manualPairBIds.map((id) => playersById[id]!) as [RotationPlayer, RotationPlayer];
    const waitingIds = selectedPoolIds.filter((id) => !manualPairAIds.includes(id) && !manualPairBIds.includes(id));
    handleStartSession(pairA, pairB, waitingIds.map((id) => playersById[id]!));
  };

  if (!session || session.status === "completed") {
    const summary = session ? computeSessionSummary(session) : null;
    const pickablePool = (roster.data ?? []).map(toPickablePlayer);

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
              <Text style={styles.body}>
                {summary.finalWaitingQueue.length === 0
                  ? t("rotation.emptyQueueMessage")
                  : summary.finalWaitingQueue.map((q) => playersById[q.playerId]?.display_name ?? q.playerId).join(", ")}
              </Text>
            </Card>
          ) : null}

          <Card style={styles.setupCard}>
            <Text style={styles.header}>{t("rotation.selectPlayersTitle")}</Text>
            <Text style={styles.body}>{t("rotation.selectPlayersMessage")}</Text>
            <PlayerPicker players={pickablePool} selectedIds={selectedPoolIds} onToggle={(id) => setSelectedPoolIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))} maxSelected={pickablePool.length} />

            <Text style={styles.subLabel}>{t("rotation.initialPairMode")}</Text>
            <SegmentedControl
              options={[
                { value: "random", label: t("rotation.randomPairs") },
                { value: "manual", label: t("rotation.manualPairs") },
              ]}
              value={pairMode}
              onChange={setPairMode}
            />

            {pairMode === "manual" && selectedPoolIds.length >= 4 ? (
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

            {selectedPoolIds.length < 4 ? <InfoBanner tone="warning" message={t("rotation.notEnoughSelected")} /> : null}

            <Button
              label={t("rotation.startSession")}
              disabled={selectedPoolIds.length < 4 || (pairMode === "manual" && (manualPairAIds.length !== 2 || manualPairBIds.length !== 2))}
              onPress={pairMode === "random" ? handleStartRandom : handleStartManual}
            />
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
    router.push({
      pathname: "/record-match",
      params: buildMatchPrefillParams("doubles", [accepted.currentPairA.players, accepted.currentPairB!.players], null),
    });
  };

  const handleRedraw = () => setSession(redrawSessionPartner(session));

  const handleRetry = () => setSession(retryPendingRotation(session, playersById, new Date()));

  const handleUndo = () => setSession(undoLastRotation(session, new Date()));

  const handleEndSession = () => setSession(endSession(session, new Date()));

  const handleResetSession = () => setSession(null);

  const handleRecordCurrentMatch = () => {
    if (!session.currentPairB) return;
    router.push({
      pathname: "/record-match",
      params: buildMatchPrefillParams("doubles", [session.currentPairA.players, session.currentPairB.players], null),
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

          {isEditingQueue ? (
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

function PairLine({ label, pair }: { label: string; pair: { players: [RotationPlayer, RotationPlayer]; consecutiveMatchesPlayed: number } }) {
  const { t } = useTranslation();
  return (
    <View style={styles.pairLine}>
      <Text style={styles.pairLineLabel}>{label}</Text>
      <Text style={styles.pairLineNames}>{pair.players.map((p) => p.display_name).join(" & ")}</Text>
      <Text style={styles.pairLineStreak}>
        {t("rotation.consecutiveMatches")}: {pair.consecutiveMatchesPlayed}
      </Text>
    </View>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.body}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
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
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  summaryValue: {
    ...typography.bodyStrong,
    color: colors.accent,
  },
});
