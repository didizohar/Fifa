import { useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Avatar } from "../../../src/components/Avatar";
import { Badge, type BadgeTone } from "../../../src/components/Badge";
import { Card } from "../../../src/components/Card";
import { ErrorState } from "../../../src/components/ErrorState";
import { Screen } from "../../../src/components/Screen";
import { Skeleton } from "../../../src/components/Skeleton";
import { useMatch } from "../../../src/hooks/useMatches";
import { formatDateTime } from "../../../src/lib/format";
import type { MatchSideSummary } from "../../../src/lib/matches";
import { colors, radius, spacing, typography } from "../../../src/theme";

const resultColor = { win: colors.win, loss: colors.loss, draw: colors.draw };
const resultLabel = { win: "Win", loss: "Loss", draw: "Draw" };
const resultTone: Record<MatchSideSummary["result"], BadgeTone> = { win: "win", loss: "loss", draw: "draw" };

export default function MatchDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: match, isLoading, isError, refetch } = useMatch(id);

  if (isLoading) {
    return (
      <Screen>
        <View style={styles.loading}>
          <Skeleton height={140} borderRadius={radius.lg} />
          <Skeleton height={140} borderRadius={radius.lg} />
        </View>
      </Screen>
    );
  }

  if (isError || !match) {
    return (
      <Screen>
        <ErrorState message="Couldn't load this match." onRetry={refetch} />
      </Screen>
    );
  }

  const [side1, side2] = match.sides;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.badges}>
          <Badge label={match.match_type === "singles" ? "1 v 1" : "2 v 2"} tone="accent" />
          {match.is_overtime ? <Badge label="OT" tone="neutral" /> : null}
          {match.is_penalties ? <Badge label="PENS" tone="warning" /> : null}
        </View>
        <Text style={styles.date}>{formatDateTime(match.played_at)}</Text>

        <SideCard side={side1} onPlayerPress={(id) => router.push(`/player/${id}`)} />
        <View style={styles.vsRow}>
          <Text style={styles.vsText}>vs</Text>
        </View>
        <SideCard side={side2} onPlayerPress={(id) => router.push(`/player/${id}`)} />

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

function SideCard({ side, onPlayerPress }: { side: MatchSideSummary; onPlayerPress: (id: string) => void }) {
  return (
    <Card style={styles.sideCard}>
      <View style={styles.sideHeader}>
        <Text style={styles.clubName}>{side.club?.name ?? "Unknown club"}</Text>
        <View style={styles.scoreGroup}>
          <Text style={[styles.score, { color: resultColor[side.result] }]}>{side.score}</Text>
          {side.penalty_score !== null ? <Text style={styles.penaltyScore}>({side.penalty_score} pens)</Text> : null}
        </View>
      </View>
      <Badge label={resultLabel[side.result]} tone={resultTone[side.result]} style={styles.resultBadge} />
      <View style={styles.playersRow}>
        {side.players.map((player) => (
          <Pressable key={player.id} style={styles.playerChip} onPress={() => onPlayerPress(player.id)}>
            <Avatar uri={player.avatar_url} name={player.display_name} color={player.custom_color} size={32} />
            <Text style={styles.playerName}>{player.display_name}</Text>
          </Pressable>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  loading: {
    gap: spacing.lg,
    paddingTop: spacing.lg,
  },
  content: {
    gap: spacing.md,
    paddingVertical: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  badges: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  date: {
    ...typography.caption,
  },
  sideCard: {
    gap: spacing.sm,
  },
  sideHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  clubName: {
    ...typography.bodyStrong,
  },
  scoreGroup: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.xs,
  },
  score: {
    ...typography.stat,
  },
  penaltyScore: {
    ...typography.small,
  },
  resultBadge: {
    alignSelf: "flex-start",
  },
  playersRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  playerChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  playerName: {
    ...typography.body,
  },
  vsRow: {
    alignItems: "center",
  },
  vsText: {
    ...typography.caption,
    fontWeight: "700",
  },
  notesLabel: {
    ...typography.caption,
    marginBottom: spacing.xs,
  },
  notesText: {
    ...typography.body,
  },
});
