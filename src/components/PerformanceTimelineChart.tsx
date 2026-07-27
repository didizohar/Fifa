import { StyleSheet, Text, View } from "react-native";
import type { PerformanceTimelineBucket } from "../lib/analytics/types";
import { colors, radius, spacing, typography } from "../theme";

interface PerformanceTimelineChartProps {
  buckets: PerformanceTimelineBucket[];
  emptyMessage: string;
  noDataLabel: string;
}

/** One stacked win/draw/loss bar per bucket -- same row layout as BarChart, three segments instead of one. Buckets with no matches render an explicit muted bar, never skipped. */
export function PerformanceTimelineChart({ buckets, emptyMessage, noDataLabel }: PerformanceTimelineChartProps) {
  const withMatches = buckets.filter((b) => b.matches > 0);
  if (buckets.length === 0 || withMatches.length === 0) {
    return <Text style={styles.empty}>{emptyMessage}</Text>;
  }

  return (
    <View style={styles.container}>
      {buckets.map((bucket) => {
        const hasData = bucket.matches > 0;
        return (
          <View
            key={bucket.bucketStart}
            style={styles.row}
            accessible
            accessibilityLabel={hasData ? `${bucket.label}: ${bucket.wins}W ${bucket.draws}D ${bucket.losses}L` : `${bucket.label}: ${noDataLabel}`}
          >
            <Text style={styles.label} numberOfLines={1}>
              {bucket.label}
            </Text>
            <View style={styles.track}>
              {hasData ? (
                <>
                  {bucket.wins > 0 ? <View style={[styles.segment, { flex: bucket.wins, backgroundColor: colors.win }]} /> : null}
                  {bucket.draws > 0 ? <View style={[styles.segment, { flex: bucket.draws, backgroundColor: colors.draw }]} /> : null}
                  {bucket.losses > 0 ? <View style={[styles.segment, { flex: bucket.losses, backgroundColor: colors.loss }]} /> : null}
                </>
              ) : (
                <View style={[styles.segment, { flex: 1, backgroundColor: colors.border }]} />
              )}
            </View>
            <Text style={styles.value} numberOfLines={1}>
              {hasData ? `${bucket.wins}-${bucket.losses}-${bucket.draws}` : "–"}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  label: {
    ...typography.caption,
    flexBasis: "22%",
    maxWidth: 100,
  },
  track: {
    flex: 1,
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceElevated,
    overflow: "hidden",
    flexDirection: "row",
  },
  segment: {
    height: "100%",
  },
  value: {
    ...typography.small,
    minWidth: 64,
    maxWidth: 90,
    textAlign: "right",
  },
  empty: {
    ...typography.caption,
  },
});
