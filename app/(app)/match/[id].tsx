import { useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Avatar } from "../../../src/components/Avatar";
import { Badge, type BadgeTone } from "../../../src/components/Badge";
import { Button } from "../../../src/components/Button";
import { Card } from "../../../src/components/Card";
import { ErrorState } from "../../../src/components/ErrorState";
import { Screen } from "../../../src/components/Screen";
import { Skeleton } from "../../../src/components/Skeleton";
import { useAuth } from "../../../src/hooks/useAuth";
import { useGroup } from "../../../src/hooks/useGroup";
import { useMatch } from "../../../src/hooks/useMatches";
import { formatDateTime } from "../../../src/lib/format";
import { useTranslation } from "../../../src/lib/i18n";
import type { MatchSideSummary } from "../../../src/lib/matches";
import { canEditMatch } from "../../../src/lib/validation/editMatchForm";
import { colors, radius, spacing, typography } from "../../../src/theme";

const resultColor = { win: colors.win, loss: colors.loss, draw: colors.draw };
const resultLabel = { win: "Win", loss: "Loss", draw: "Draw" };
const resultTone: Record<MatchSideSummary["result"], BadgeTone> = { win: "win", loss: "loss", draw: "draw" };

export default function MatchDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const { user } = useAuth();
  const { currentRole } = useGroup();
  const { data: match, isLoading, isError, refetch } = useMatch(id);

  if (isLoading) {
    return (
      <Screen>
        <View style={styles.loading}>
          <Skeleton height={100} borderRadius={radius.lg} />
          <Skeleton height={140} borderRadius={radius.lg} />
          <Skeleton height={140} borderRadius={radius.lg} />
        </View>
      </Screen>
    );
  }

  if (isError || !match) {
    return (
      <Screen>
        <ErrorState message="Couldn't load this match. Check your connection and try again." onRetry={refetch} />
      </Screen>
    );
  }

  const [side1, side2] = match.sides;
  const canEdit = canEditMatch(currentRole, user?.id, match.created_by);
  // updated_at is only ever bumped by update_match -- neither record_match
  // nor the legacy record_match_and_apply_elo touch this column on insert --
  // so this comparison is exact, not a heuristic.
  const wasEdited = !!match.updated_at && !!match.created_at && match.updated_at !== match.created_at;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.badges}>
          <Badge label={match.match_type === "singles" ? "1 v 1" : "2 v 2"} tone="accent" />
          {match.is_overtime ? <Badge label="OT" tone="neutral" /> : null}
          {match.is_penalties ? <Badge label="PENS" tone="warning" /> : null}
          {wasEdited ? <Badge label={t("editMatch.editedBadge")} tone="neutral" /> : null}
          <Text style={styles.date}>{formatDateTime(match.played_at)}</Text>
        </View>

        <Card variant="elevated" style={styles.scoreboard}>
          <View style={styles.scoreboardRow}>
            <ScoreboardSide side={side1} />
            <Text style={styles.scoreboardDivider}>–</Text>
            <ScoreboardSide side={side2} />
          </View>
          {match.is_penalties && side1.penalty_score !== null && side2.penalty_score !== null ? (
            <Text style={styles.penaltyNote}>
              Decided on penalties, {side1.penalty_score}-{side2.penalty_score}
            </Text>
          ) : null}
        </Card>

        <SideCard side={side1} onPlayerPress={(playerId) => router.push(`/player/${playerId}`)} />
        <SideCard side={side2} onPlayerPress={(playerId) => router.push(`/player/${playerId}`)} />

        {canEdit ? (
          <Button
            label={t("editMatch.entryAction")}
            variant="secondary"
            onPress={() => router.push({ pathname: "/record-match", params: { matchId: match.id } })}
          />
        ) : null}

        {match.match_type === "doubles" ? (
          <Button label={t("rotation.title")} variant="secondary" onPress={() => router.push({ pathname: "/winners-stay", params: { matchId: match.id } })} />
        ) : null}

        {match.notes ? (
          <Card>
            <Text style={styles.notesLabel}>Notes</Text>
            <Text style={styles.notesText}>{match.notes}</Text>
          </Card>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function ScoreboardSide({ side }: { side: MatchSideSummary }) {
  return (
    <View style={styles.scoreboardSide}>
      <Text style={styles.scoreboardClub} numberOfLines={1}>
        {side.club?.name ?? "Unknown club"}
      </Text>
      <Text style={[styles.scoreboardScore, { color: resultColor[side.result] }]}>{side.score}</Text>
    </View>
  );
}

function SideCard({ side, onPlayerPress }: { side: MatchSideSummary; onPlayerPress: (id: string) => void }) {
  return (
    <Card style={styles.sideCard}>
      <View style={styles.sideHeader}>
        <Text style={styles.clubName}>{side.club?.name ?? "Unknown club"}</Text>
        <Badge label={resultLabel[side.result]} tone={resultTone[side.result]} />
      </View>
      <View style={styles.playersRow}>
        {side.players.map((player) => (
          <Pressable
            key={player.id}
            style={styles.playerChip}
            onPress={() => onPlayerPress(player.id)}
            accessibilityRole="button"
            accessibilityLabel={player.display_name}
          >
            <Avatar uri={player.avatar_url} name={player.display_name} color={player.custom_color} size={36} />
            <View style={styles.playerInfo}>
              <Text style={styles.playerName} numberOfLines={1}>
                {player.display_name}
              </Text>
            </View>
          </Pressable>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  loading: {
    gap: spacing.md,
    paddingTop: spacing.lg,
  },
  content: {
    gap: spacing.md,
    paddingVertical: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  badges: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  date: {
    ...typography.small,
    marginStart: "auto",
  },
  scoreboard: {
    alignItems: "center",
  },
  scoreboardRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.lg,
  },
  scoreboardSide: {
    flex: 1,
    alignItems: "center",
    gap: spacing.xs,
  },
  scoreboardClub: {
    ...typography.caption,
    textAlign: "center",
  },
  scoreboardScore: {
    ...typography.displayLarge,
  },
  scoreboardDivider: {
    ...typography.title,
    color: colors.textMuted,
  },
  penaltyNote: {
    ...typography.small,
    marginTop: spacing.sm,
  },
  sideCard: {
    gap: spacing.md,
  },
  sideHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  clubName: {
    ...typography.bodyStrong,
  },
  playersRow: {
    gap: spacing.sm,
  },
  playerChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.xs,
    borderRadius: radius.md,
  },
  playerInfo: {
    flex: 1,
    gap: 2,
  },
  playerName: {
    ...typography.body,
    flexShrink: 1,
  },
  notesLabel: {
    ...typography.caption,
    marginBottom: spacing.xs,
  },
  notesText: {
    ...typography.body,
  },
});
