import { StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../theme";

interface TrendScoreCardProps {
  label: string;
  /** 0-100. */
  score: number;
  explanation?: string;
}

/** Compact label + 0-100 bar + optional one-line explanation -- used for consistency/activity/attack/defence, one per card in a grid. */
export function TrendScoreCard({ label, score, explanation }: TrendScoreCardProps) {
  const clamped = Math.max(0, Math.min(100, score));
  const a11yLabel = explanation ? `${label}: ${clamped} out of 100. ${explanation}` : `${label}: ${clamped} out of 100`;

  return (
    <View style={styles.container} accessibilityRole="text" accessibilityLabel={a11yLabel}>
      <View style={styles.headerRow}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.score}>
          {clamped}
          <Text style={styles.scoreMax}>/100</Text>
        </Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${clamped}%` }]} />
      </View>
      {explanation ? (
        <Text style={styles.explanation} numberOfLines={2}>
          {explanation}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
    flexBasis: "47%",
    flexGrow: 1,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  label: {
    ...typography.caption,
  },
  score: {
    ...typography.bodyStrong,
    color: colors.accent,
  },
  scoreMax: {
    ...typography.small,
    color: colors.textSecondary,
  },
  track: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceElevated,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  explanation: {
    ...typography.small,
  },
});
