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
import { useWinnersStaySession } from "../../../src/hooks/useWinnersStaySession";
import { formatDateTime } from "../../../src/lib/format";
import { useTranslation } from "../../../src/lib/i18n";
import type { MatchSideSummary } from "../../../src/lib/matches";
import { canAdvanceSession } from "../../../src/lib/rotation/session";
import { canEditMatch } from "../../../src/lib/validation/editMatchForm";
import { colors, radius, spacing, typography } from "../../../src/theme";

const resultColor = { win: colors.win, loss: colors.loss, draw: colors.draw };
const resultTone: Record<MatchSideSummary["result"], BadgeTone> = { win: "win", loss: "loss", draw: "draw" };

export default function MatchDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const { user } = useAuth();
  const { currentGroup, currentRole } = useGroup();
  const { data: match, isLoading, isError, refetch } = useMatch(id);
  const winnersStaySession = useWinnersStaySession(currentGroup?.id ?? null);
  const resultLabel = { win: t("common.resultWin"), loss: t("common.resultLoss"), draw: t("common.resultDraw") };

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
        <ErrorState message={t("editMatch.matchDetailLoadError")} onRetry={refetch} />
      </Screen>
    );
  }

  const [side1, side2] = match.sides;
  const canEdit = canEditMatch(currentRole, user?.id, match.created_by);
  // updated_at is only ever bumped by update_match -- neither record_match
  // nor the legacy record_match_and_apply_elo touch this column on insert --
  // so this comparison is exact, not a heuristic.
  const wasEdited = !!match.updated_at && !!match.created_at && match.updated_at !== match.created_at;

  // Whether THIS match is the one the active Winners Stay session (of any
  // format) is still waiting to advance against -- was previously hardcoded
  // to `match.match_type === "doubles"`, which only ever matched the
  // original 4+ "group" format. A "duo" (2-player) or "trio" (3-player)
  // session records "singles" matches, so that check silently hid this
  // button for them, leaving Edit Match as the only action and breaking the
  // session flow entirely. canAdvanceSession is the exact same eligibility
  // check winners-stay.tsx's own advance-session effect uses -- reusing it
  // here (rather than re-deriving match_type/session-state rules) is what
  // makes this correct for every format, and only for a match this
  // particular session actually still needs.
  const wsSession = winnersStaySession.session;
  const expectedMatchType = wsSession?.format === "group" ? "doubles" : "singles";
  const canContinueSession = !!wsSession && match.match_type === expectedMatchType && canAdvanceSession(wsSession, match.id);
  const continueSessionLabel = wsSession?.format === "duo" ? t("rotation.nextMatchAction") : wsSession?.format === "trio" ? t("rotation.winnerStaysAction") : t("rotation.title");

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.badges}>
          <Badge label={match.match_type === "singles" ? t("common.matchTypeSinglesSpaced") : t("common.matchTypeDoublesSpaced")} tone="accent" />
          {match.is_overtime ? <Badge label={t("common.overtimeAbbr")} tone="neutral" /> : null}
          {match.is_penalties ? <Badge label={t("common.penaltiesAbbr")} tone="warning" /> : null}
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
              {t("editMatch.decidedOnPenalties", { score: `${side1.penalty_score}-${side2.penalty_score}` })}
            </Text>
          ) : null}
        </Card>

        <SideCard side={side1} onPlayerPress={(playerId) => router.push(`/player/${playerId}`)} resultLabel={resultLabel} />
        <SideCard side={side2} onPlayerPress={(playerId) => router.push(`/player/${playerId}`)} resultLabel={resultLabel} />

        {canEdit ? (
          <Button
            label={t("editMatch.entryAction")}
            variant="secondary"
            onPress={() => router.push({ pathname: "/record-match", params: { matchId: match.id } })}
          />
        ) : null}

        {canContinueSession ? (
          <Button
            label={continueSessionLabel}
            variant="secondary"
            // dismissTo (not push) -- when this match was just recorded from an
            // active Winners Stay round (record-match replaces itself with this
            // screen on save), a Winners Stay screen is already sitting lower in
            // the stack. push() would mount a SECOND, independent instance on
            // top of it instead of returning to that one -- and since neither
            // ever gets popped by the normal play loop (each round is
            // record-match -> replace with match/[id] -> push winners-stay
            // again), every round played permanently strands one more hidden
            // Winners Stay screen (plus this match screen) in the stack, each
            // still holding live usePlayers/useGroupMatchHistory/useMatch query
            // subscriptions that re-render on every subsequent match save
            // anywhere in the app -- competing for the JS thread with whatever
            // the CURRENT screen is doing, and compounding every extra round.
            // dismissTo pops back to the existing Winners Stay screen if one is
            // already in the stack (reusing it, updating its matchId param so
            // its round-advance effect still fires), or falls back to a plain
            // replace if there isn't one -- so this is safe for both the
            // mid-session and the "opened from match history" cases.
            onPress={() => router.dismissTo({ pathname: "/winners-stay", params: { matchId: match.id } })}
          />
        ) : null}

        {match.notes ? (
          <Card>
            <Text style={styles.notesLabel}>{t("editMatch.notesLabel")}</Text>
            <Text style={styles.notesText}>{match.notes}</Text>
          </Card>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function ScoreboardSide({ side }: { side: MatchSideSummary }) {
  const { t } = useTranslation();
  return (
    <View style={styles.scoreboardSide}>
      <Text style={styles.scoreboardClub} numberOfLines={1}>
        {side.club?.name ?? t("common.unknownClub")}
      </Text>
      <Text style={[styles.scoreboardScore, { color: resultColor[side.result] }]}>{side.score}</Text>
    </View>
  );
}

function SideCard({
  side,
  onPlayerPress,
  resultLabel,
}: {
  side: MatchSideSummary;
  onPlayerPress: (id: string) => void;
  resultLabel: Record<MatchSideSummary["result"], string>;
}) {
  const { t } = useTranslation();
  return (
    <Card style={styles.sideCard}>
      <View style={styles.sideHeader}>
        <Text style={styles.clubName}>{side.club?.name ?? t("common.unknownClub")}</Text>
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
