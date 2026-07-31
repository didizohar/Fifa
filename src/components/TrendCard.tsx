import { Pressable, StyleSheet, Text, View } from "react-native";
import type { MetricChange } from "../lib/metricPresentation";
import { metricChangeColorKey, metricChangeTone } from "../lib/metricPresentation";
import { colors, radius, spacing, typography } from "../theme";
import { InfoTooltip } from "./InfoTooltip";

const ARROW: Record<MetricChange["direction"], string> = { up: "↑", down: "↓", flat: "→" };

export interface TrendCardInfo {
  title: string;
  howCalculated: string;
  matchesIncluded: string;
  whenUpdates: string;
  whyUseful: string;
}

interface TrendCardProps {
  icon: string;
  title: string;
  /** Already formatted with its unit, e.g. "68%", "11 pts", "3.4 goals/match". */
  valueLabel: string;
  /** null when there's nothing to compare against yet (e.g. no previous period). */
  change: MetricChange | null;
  /** Pre-formatted signed comparison text, e.g. "+12%", "-3 goals" -- required whenever `change` is non-null. */
  changeLabel?: string;
  /** For metrics where a decrease is the good outcome (goals conceded, losing streak length). */
  invert?: boolean;
  /** One-line "what this means" sentence, e.g. "Won 6 of the last 10 matches." */
  explanation: string;
  /** Shown when there's no change to compare (change is null), e.g. "Not enough data to compare yet." */
  noComparisonLabel: string;
  onPress?: () => void;
  info?: TrendCardInfo;
}

/**
 * A self-explanatory trend card: icon + title, a value with its unit, an
 * arrow + colored percentage vs. the previous period (never colored for an
 * insignificant change), and a one-line plain-language explanation. Built
 * to replace a bare unexplained number like "68" or "+49" with something a
 * user can understand at a glance.
 */
export function TrendCard({ icon, title, valueLabel, change, changeLabel, invert = false, explanation, noComparisonLabel, onPress, info }: TrendCardProps) {
  const tone = change ? metricChangeTone(change, invert) : "neutral";
  const toneColor = tone === "positive" ? colors[metricChangeColorKey("positive")] : tone === "negative" ? colors[metricChangeColorKey("negative")] : colors.textSecondary;

  const content = (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.icon}>{icon}</Text>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {info ? <InfoTooltip {...info} /> : null}
      </View>

      <Text style={styles.value}>{valueLabel}</Text>

      {change ? (
        <Text style={[styles.change, { color: toneColor }]}>
          {ARROW[change.direction]} {changeLabel}
        </Text>
      ) : (
        <Text style={styles.noComparison}>{noComparisonLabel}</Text>
      )}

      <Text style={styles.explanation} numberOfLines={2}>
        {explanation}
      </Text>
    </View>
  );

  if (!onPress) return content;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`${title}: ${valueLabel}. ${explanation}`}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surface,
  },
  pressed: {
    opacity: 0.85,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  icon: {
    fontSize: 16,
  },
  title: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
  },
  value: {
    ...typography.display,
    fontSize: 26,
  },
  change: {
    ...typography.bodyStrong,
  },
  noComparison: {
    ...typography.small,
    color: colors.textMuted,
  },
  explanation: {
    ...typography.small,
    color: colors.textSecondary,
  },
});
