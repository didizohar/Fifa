import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { EmptyState } from "../../src/components/EmptyState";
import { ErrorState } from "../../src/components/ErrorState";
import { NextMatchPreviewCard } from "../../src/components/NextMatchPreviewCard";
import { Screen } from "../../src/components/Screen";
import { Skeleton } from "../../src/components/Skeleton";
import { useGroup } from "../../src/hooks/useGroup";
import { useMatch } from "../../src/hooks/useMatches";
import { usePlayers } from "../../src/hooks/usePlayers";
import { useTranslation } from "../../src/lib/i18n";
import { buildMatchPrefillParams } from "../../src/lib/matchPrefill";
import { generateWinnersStayRotation, selectRandomLosingPlayer, startingConsecutiveMatches } from "../../src/lib/rotation/winnersStay";
import type { ActivePair, MatchResult, RotationPlayer, WaitingQueueItem, WinnersStayRotationResult } from "../../src/lib/rotation/types";
import type { MatchSidePlayer } from "../../src/lib/matches";
import { spacing, typography } from "../../src/theme";

function toRotationPlayer(p: MatchSidePlayer): RotationPlayer {
  return { id: p.id, display_name: p.display_name, avatar_url: p.avatar_url, custom_color: p.custom_color };
}

/**
 * Winners Stay is scoped to one rotation cycle per visit: it seeds
 * consecutiveMatchesPlayed at 1 for both sides of the just-finished match
 * (this app doesn't yet persist a running Winners Stay session across
 * matches/screens), and treats every other currently-active roster member
 * as freshly queued in roster order. The underlying engine
 * (generateWinnersStayRotation/updateWaitingQueue) fully supports chaining
 * many rotations end to end -- extending this screen into a persistent
 * multi-round session is a follow-up, not an engine limitation.
 */
export default function WinnersStayScreen() {
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const { currentGroupId } = useGroup();
  const { data: match, isLoading: matchLoading, isError: matchError, refetch } = useMatch(matchId);
  const roster = usePlayers(currentGroupId);
  const [manualLoserPick, setManualLoserPick] = useState<{ selected: RotationPlayer; remaining: RotationPlayer } | null>(null);

  const baseRotation = useMemo<WinnersStayRotationResult | null>(() => {
    if (!match || match.match_type !== "doubles" || !roster.data) return null;

    const [side1, side2] = match.sides;
    if (side1.players.length !== 2 || side2.players.length !== 2) return null;

    const sideA: ActivePair = startingConsecutiveMatches([toRotationPlayer(side1.players[0]!), toRotationPlayer(side1.players[1]!)]);
    const sideB: ActivePair = startingConsecutiveMatches([toRotationPlayer(side2.players[0]!), toRotationPlayer(side2.players[1]!)]);
    const result: MatchResult = side1.result === "win" ? "sideA" : side2.result === "win" ? "sideB" : "draw";

    const playingIds = new Set([...side1.players, ...side2.players].map((p) => p.id));
    const waitingRoster = roster.data.filter((p) => !playingIds.has(p.id));
    const waitingQueue: WaitingQueueItem[] = waitingRoster.map((p, index) => ({ playerId: p.id, enteredQueueAt: index, consecutiveWaitCount: 0 }));
    const playersById: Record<string, RotationPlayer> = Object.fromEntries(roster.data.map((p) => [p.id, toRotationPlayer(p)]));

    return generateWinnersStayRotation({
      matchType: "doubles",
      sideA,
      sideB,
      result,
      waitingQueue,
      playersById,
      activePlayerIds: roster.data.map((p) => p.id),
      sequence: 1,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match, roster.data]);

  const rotation = useMemo<WinnersStayRotationResult | null>(() => {
    if (!baseRotation) return null;
    if (!manualLoserPick || baseRotation.selectionSource !== "randomFromLosers" || !baseRotation.opposingPair) return baseRotation;
    const waitingHalf = baseRotation.opposingPair[0];
    return { ...baseRotation, opposingPair: [waitingHalf, manualLoserPick.selected], rotatedOutPlayers: [manualLoserPick.remaining] };
  }, [baseRotation, manualLoserPick]);

  const playersById: Record<string, RotationPlayer> = useMemo(() => Object.fromEntries((roster.data ?? []).map((p) => [p.id, toRotationPlayer(p)])), [roster.data]);

  const handleRedrawPartner = () => {
    if (!rotation?.opposingPair || rotation.selectionSource !== "randomFromLosers") return;
    // The two current losers are exactly the "entered the match" half of opposingPair and the single rotated-out player -- redrawing only ever picks between these two, never touching the winning pair.
    const currentInMatch = rotation.opposingPair[1];
    const currentWaiting = rotation.rotatedOutPlayers[0]!;
    setManualLoserPick(selectRandomLosingPlayer([currentInMatch, currentWaiting], Math.random));
  };

  const handleAccept = () => {
    if (!rotation?.opposingPair) return;
    router.push({
      pathname: "/record-match",
      params: buildMatchPrefillParams("doubles", [rotation.stayingPair, rotation.opposingPair], null),
    });
  };

  if (matchLoading || roster.isLoading) {
    return (
      <Screen>
        <View style={styles.loading}>
          <Skeleton height={200} borderRadius={16} />
        </View>
      </Screen>
    );
  }

  if (matchError || !match) {
    return (
      <Screen>
        <ErrorState onRetry={refetch} />
      </Screen>
    );
  }

  if (match.match_type !== "doubles" || !rotation) {
    return (
      <Screen>
        <EmptyState icon="🔁" title={t("rotation.notEnoughPlayersTitle")} message={t("rotation.notEnoughPlayersMessage")} />
      </Screen>
    );
  }

  const explanation = t(rotation.reason.key, rotation.reason.params);

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.header}>{t("rotation.title")}</Text>
        <NextMatchPreviewCard
          result={rotation}
          playersById={playersById}
          explanation={explanation}
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
          onRedrawPartner={rotation.selectionSource === "randomFromLosers" ? handleRedrawPartner : undefined}
          onCancel={() => router.back()}
        />
      </ScrollView>
    </Screen>
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
});
