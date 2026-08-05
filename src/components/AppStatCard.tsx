import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { StyleSheet, Text, View, ViewStyle } from "react-native";
import { colors, radius, spacing, typography } from "../theme";
import { AnimatedNumber } from "./AnimatedNumber";
import { AnimatedPressable } from "./AnimatedPressable";
import { Card } from "./Card";
import { Skeleton } from "./Skeleton";

export type StatCardTone = "neutral" | "positive" | "negative";

const TONE_COLOR: Record<StatCardTone, string> = {
  neutral: colors.textSecondary,
  positive: colors.win,
  negative: colors.loss,
};

const TREND_ARROW: Record<"up" | "down" | "flat", string> = { up: "↑", down: "↓", flat: "→" };

export interface AppStatCardProps {
  /** null renders the empty-state dash instead of a value. */
  value: number | string | null;
  label: string;
  helperText?: string;
  icon?: ComponentProps<typeof Ionicons>["name"];
  /**
   * direction controls ONLY which arrow glyph renders -- it carries no
   * color. tone (below) controls ONLY color. They're deliberately separate:
   * a downward trend can still be a good result (e.g. losing streak length
   * going down), and the caller -- which knows what the metric means, this
   * component doesn't -- decides tone independently. Reuse
   * metricPresentation.ts's metricChangeTone(change, invert) to compute it
   * rather than duplicating that judgment here.
   */
  trend?: { direction: "up" | "down" | "flat"; label: string };
  tone?: StatCardTone;
  loading?: boolean;
  size?: "sm" | "md";
  onPress?: () => void;
  style?: ViewStyle;
  testID?: string;
}

/**
 * Shared "big number + short context" stat display -- StatTile's
 * successor. Value is always the visually dominant element; label stays
 * secondary; helperText/trend are optional and never grow into a
 * sentence-style explanation (that's TrendCard's job, a different, more
 * elaborate component for screens that want the full one-line "what this
 * means" treatment).
 */
export function AppStatCard({ value, label, helperText, icon, trend, tone = "neutral", loading = false, size = "sm", onPress, style, testID }: AppStatCardProps) {
  const valueStyle = size === "md" ? styles.valueMd : styles.valueSm;

  const content = (
    <Card compact style={[styles.card, style]} testID={testID}>
      <View style={styles.headerRow}>
        {icon ? <Ionicons name={icon} size={14} color={colors.textMuted} /> : null}
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
      </View>

      {loading ? (
        <Skeleton height={size === "md" ? 34 : 26} width="60%" />
      ) : value === null ? (
        <Text style={valueStyle}>–</Text>
      ) : typeof value === "number" ? (
        <AnimatedNumber value={value} style={valueStyle} />
      ) : (
        <Text style={valueStyle}>{value}</Text>
      )}

      {!loading && trend ? (
        <Text style={[styles.trend, { color: TONE_COLOR[tone] }]} numberOfLines={1}>
          {TREND_ARROW[trend.direction]} {trend.label}
        </Text>
      ) : null}

      {!loading && helperText ? (
        <Text style={styles.helperText} numberOfLines={2}>
          {helperText}
        </Text>
      ) : null}
    </Card>
  );

  if (!onPress) return content;

  return (
    <AnimatedPressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}: ${value ?? "–"}`} style={({ pressed }) => [pressed && styles.pressed]}>
      {content}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 2,
    minWidth: 96,
    borderRadius: radius.lg,
  },
  pressed: {
    opacity: 0.85,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  label: {
    ...typography.small,
    flexShrink: 1,
  },
  valueSm: {
    ...typography.stat,
    fontSize: 22,
  },
  valueMd: {
    ...typography.displayLarge,
    fontSize: 32,
  },
  trend: {
    ...typography.caption,
    fontWeight: "700",
  },
  helperText: {
    ...typography.small,
    color: colors.textSecondary,
  },
});
