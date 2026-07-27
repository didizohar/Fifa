import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { TimelinePoint } from "../lib/analytics/types";
import { selectTimelineAxisLabelIndices, summarizeTimelineTrend } from "../lib/playerAnalyticsView";
import { colors, radius, spacing, typography } from "../theme";

interface TimelineChartProps {
  /** Buckets straight from the analytics engine (analytics/dateRange.ts) -- rendered as-is, one bar per bucket, no smoothing or skipping. */
  points: TimelinePoint[];
  formatValue: (value: number) => string;
  /** Shown instead of the chart when there isn't a single usable data point. */
  emptyMessage: string;
  /** Appended (for screen readers) to a bucket that has no usable value. */
  noDataLabel: string;
  /** One precomputed sentence describing the overall trend, read by screen readers. Omit if there's nothing meaningful to say yet. */
  accessibilitySummary?: string | null;
  color?: string;
  height?: number;
  /** Rank-style metrics: a smaller number is "better", so shorter bars would read backwards -- inverts the visual mapping only. */
  invert?: boolean;
  /** Defaults to "this bucket had a match" -- override for metrics with a sentinel value (e.g. NOT_RANKED) that isn't a real value even though matches happened. */
  isValueValid?: (point: TimelinePoint) => boolean;
}

const DEFAULT_IS_VALID = (point: TimelinePoint) => point.matchesInBucket > 0;

/** Generic bucketed timeline chart -- no charting library, same plain-View technique as Sparkline/BarChart. One bar per bucket, tap a bar for its exact value. */
export function TimelineChart({
  points,
  formatValue,
  emptyMessage,
  noDataLabel,
  accessibilitySummary,
  color = colors.accent,
  height = 96,
  invert = false,
  isValueValid = DEFAULT_IS_VALID,
}: TimelineChartProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const validPoints = useMemo(() => points.filter(isValueValid), [points, isValueValid]);
  const trend = useMemo(() => summarizeTimelineTrend(validPoints), [validPoints]);
  const labelIndices = useMemo(() => new Set(selectTimelineAxisLabelIndices(points.length)), [points.length]);

  if (points.length === 0 || !trend) {
    return <Text style={styles.empty}>{emptyMessage}</Text>;
  }

  const { min, max } = trend;
  const range = max - min;

  const activeIndex = selectedIndex ?? points.length - 1;
  const activePoint = points[activeIndex]!;
  const activeIsValid = isValueValid(activePoint);

  return (
    <View>
      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>{activePoint.label}</Text>
        <Text style={[styles.detailValue, { color }]}>{activeIsValid ? formatValue(activePoint.value) : noDataLabel}</Text>
      </View>

      <View
        style={[styles.track, { height }]}
        accessibilityRole={accessibilitySummary ? "text" : undefined}
        accessibilityLabel={accessibilitySummary ?? undefined}
      >
        {points.map((point, index) => {
          const isValid = isValueValid(point);
          const pct = !isValid ? 0 : range === 0 ? 0.5 : (point.value - min) / range;
          const visualPct = invert && isValid ? 1 - pct : pct;
          const barHeight = isValid ? Math.max(4, visualPct * height) : 3;
          const isSelected = index === activeIndex;

          return (
            <Pressable
              key={point.bucketStart}
              style={styles.barColumn}
              onPress={() => setSelectedIndex(index)}
              accessibilityRole="button"
              accessibilityLabel={`${point.label}: ${isValid ? formatValue(point.value) : noDataLabel}`}
              accessibilityState={{ selected: isSelected }}
            >
              <View
                style={[
                  styles.bar,
                  {
                    height: barHeight,
                    backgroundColor: !isValid ? colors.border : isSelected ? color : `${color}88`,
                  },
                ]}
              />
            </Pressable>
          );
        })}
      </View>

      <View style={styles.axisRow}>
        {points.map((point, index) => (
          <View key={point.bucketStart} style={styles.axisSlot}>
            {labelIndices.has(index) ? (
              <Text style={styles.axisLabel} numberOfLines={1}>
                {point.label}
              </Text>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: spacing.sm,
  },
  detailLabel: {
    ...typography.caption,
  },
  detailValue: {
    ...typography.heading,
  },
  track: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 2,
  },
  barColumn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    minHeight: 44, // comfortable touch target even when the bar itself is a thin sliver
  },
  bar: {
    width: "100%",
    borderRadius: radius.sm,
    minWidth: 2,
  },
  axisRow: {
    flexDirection: "row",
    marginTop: spacing.xs,
  },
  axisSlot: {
    flex: 1,
    alignItems: "center",
  },
  axisLabel: {
    ...typography.small,
  },
  empty: {
    ...typography.caption,
  },
});
