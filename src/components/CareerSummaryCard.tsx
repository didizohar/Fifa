import { forwardRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../theme";
import { Avatar } from "./Avatar";

export interface CareerSummaryCardData {
  displayName: string;
  avatarUrl: string | null;
  color: string;
  winRate: number | null;
  played: number;
  wins: number;
  losses: number;
  draws: number;
  currentStreak: { result: "win" | "loss" | "draw" | null; count: number };
  /** A top achievement or record label to feature, if the player has one. */
  headline: string | null;
}

/** A fixed-size, self-contained card meant to be captured as a shareable image -- not a normal flexible-width screen element. */
export const CareerSummaryCard = forwardRef<View, { data: CareerSummaryCardData }>(function CareerSummaryCard({ data }, ref) {
  return (
    <View ref={ref} collapsable={false} style={styles.card}>
      <Text style={styles.brand}>FC RIVAL</Text>
      <Avatar uri={data.avatarUrl} name={data.displayName} color={data.color} size={72} />
      <Text style={styles.name}>{data.displayName}</Text>
      {data.headline ? <Text style={styles.headline}>{data.headline}</Text> : null}
      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{data.winRate !== null ? `${Math.round(data.winRate * 100)}%` : "–"}</Text>
          <Text style={styles.statLabel}>Win Rate</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{data.played}</Text>
          <Text style={styles.statLabel}>Played</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{data.currentStreak.count > 0 ? `${data.currentStreak.count} ${data.currentStreak.result}` : "–"}</Text>
          <Text style={styles.statLabel}>Streak</Text>
        </View>
      </View>
      <Text style={styles.record}>
        {data.wins}W-{data.losses}L-{data.draws}D
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    width: 320,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceElevated,
    alignItems: "center",
    gap: spacing.sm,
  },
  brand: {
    ...typography.eyebrow,
    color: colors.accent,
    letterSpacing: 2,
  },
  name: {
    ...typography.title,
  },
  headline: {
    ...typography.caption,
    color: colors.gold,
    textAlign: "center",
  },
  statsRow: {
    flexDirection: "row",
    gap: spacing.xl,
    marginTop: spacing.sm,
  },
  stat: {
    alignItems: "center",
    gap: 2,
  },
  statValue: {
    ...typography.heading,
    color: colors.accent,
  },
  statLabel: {
    ...typography.small,
  },
  record: {
    ...typography.small,
    marginTop: spacing.xs,
  },
});
