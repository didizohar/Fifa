import { StyleSheet, Text, View } from "react-native";
import type { RotationPlayer, WaitingQueueItem, WinnersStayRotationResult } from "../lib/rotation/types";
import { colors, radius, spacing, typography } from "../theme";
import { Avatar } from "./Avatar";
import { Button } from "./Button";
import { Card } from "./Card";
import { InfoBanner } from "./InfoBanner";

interface NextMatchPreviewCardProps {
  result: WinnersStayRotationResult;
  /** Resolves a waiting-queue playerId to its display info. */
  playersById: Record<string, RotationPlayer>;
  labels: {
    title: string;
    winningPair: string;
    incomingPair: string;
    waitingQueue: string;
    emptyQueue: string;
    notEnoughPlayersTitle: string;
    notEnoughPlayersMessage: string;
    drawRotation: string;
    acceptNextMatch: string;
    continueSameMatchup: string;
    redrawPartner: string;
    cancel: string;
  };
  /** Pre-resolved via t(result.reason.key, result.reason.params) -- this component never calls a translation function itself. */
  explanation: string;
  /** Only rendered when result.opposingPair is set -- accepting the queue-based rotation. */
  onAccept: () => void;
  /**
   * Always rendered, regardless of result.opposingPair -- replays the
   * matchup that just finished instead of rotating anyone in. This is the
   * universal continuation action: session progression must never depend
   * on a waiting player being available (Case 4's "not enough players"
   * notice above is informational, not a dead end).
   */
  onContinueSameMatchup: () => void;
  /** Present only when result.selectionSource === "randomFromLosers" -- redrawing only re-picks the randomly-selected losing player, never the winning pair. */
  onRedrawPartner?: () => void;
  onCancel: () => void;
}

/** "Next Match" preview for the Winners Stay rotation mode -- winning pair, incoming pair (or a "not enough players" notice), waiting queue, a plain-language explanation, and the Accept/Redraw/Cancel actions. */
export function NextMatchPreviewCard({ result, playersById, labels, explanation, onAccept, onContinueSameMatchup, onRedrawPartner, onCancel }: NextMatchPreviewCardProps) {
  return (
    <Card style={styles.container}>
      <Text style={styles.title}>{labels.title}</Text>

      <PairRow label={labels.winningPair} players={result.stayingPair} />

      {result.opposingPair ? (
        <PairRow label={labels.incomingPair} players={result.opposingPair} />
      ) : (
        <InfoBanner tone="warning" message={labels.notEnoughPlayersMessage} />
      )}

      {result.drawRotationApplied ? <InfoBanner tone="info" message={labels.drawRotation} /> : null}

      <View style={styles.queueSection}>
        <Text style={styles.queueLabel}>{labels.waitingQueue}</Text>
        {result.waitingPlayers.length === 0 ? (
          <Text style={styles.queueEmpty}>{labels.emptyQueue}</Text>
        ) : (
          <View style={styles.queueList}>
            {result.waitingPlayers.map((item, index) => (
              <QueueChip key={item.playerId} item={item} position={index + 1} player={playersById[item.playerId]} />
            ))}
          </View>
        )}
      </View>

      <Text style={styles.explanation} accessibilityRole="text">
        {explanation}
      </Text>

      <View style={styles.actions}>
        {result.opposingPair ? <Button label={labels.acceptNextMatch} onPress={onAccept} /> : null}
        <Button label={labels.continueSameMatchup} variant={result.opposingPair ? "secondary" : "primary"} onPress={onContinueSameMatchup} />
        {result.opposingPair && onRedrawPartner ? <Button label={labels.redrawPartner} variant="secondary" onPress={onRedrawPartner} /> : null}
        <Button label={labels.cancel} variant="secondary" onPress={onCancel} />
      </View>
    </Card>
  );
}

function PairRow({ label, players }: { label: string; players: RotationPlayer[] }) {
  return (
    <View style={styles.pairRow}>
      <Text style={styles.pairLabel}>{label}</Text>
      <View style={styles.pairPlayers}>
        {players.map((p) => (
          <View key={p.id} style={styles.pairPlayer}>
            <Avatar uri={p.avatar_url} name={p.display_name} color={p.custom_color} size={36} />
            <Text style={styles.pairPlayerName} numberOfLines={1}>
              {p.display_name}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function QueueChip({ item, position, player }: { item: WaitingQueueItem; position: number; player?: RotationPlayer }) {
  return (
    <View style={styles.queueChip} accessibilityRole="text" accessibilityLabel={`${position}. ${player?.display_name ?? item.playerId}`}>
      <Text style={styles.queuePosition}>{position}</Text>
      <Text style={styles.queueName} numberOfLines={1}>
        {player?.display_name ?? item.playerId}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  title: {
    ...typography.title,
  },
  pairRow: {
    gap: spacing.xs,
  },
  pairLabel: {
    ...typography.caption,
  },
  pairPlayers: {
    flexDirection: "row",
    gap: spacing.md,
  },
  pairPlayer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    flex: 1,
  },
  pairPlayerName: {
    ...typography.bodyStrong,
    flexShrink: 1,
  },
  queueSection: {
    gap: spacing.xs,
  },
  queueLabel: {
    ...typography.caption,
  },
  queueEmpty: {
    ...typography.small,
  },
  queueList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  queueChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  queuePosition: {
    ...typography.small,
    color: colors.textMuted,
    fontWeight: "700",
  },
  queueName: {
    ...typography.small,
    maxWidth: 100,
  },
  explanation: {
    ...typography.body,
  },
  actions: {
    gap: spacing.sm,
  },
});
