import { StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../theme";

interface SparklineProps {
  /** Chronological, oldest first. */
  values: number[];
  height?: number;
}

/** Plain-View column trend chart -- no SVG/chart library dependency. */
export function Sparkline({ values, height = 64 }: SparklineProps) {
  if (values.length === 0) {
    return <Text style={styles.empty}>No history yet</Text>;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  const first = values[0]!;
  const last = values[values.length - 1]!;
  const delta = last - first;

  return (
    <View>
      <View style={styles.header}>
        <Text style={styles.current}>{last}</Text>
        <Text style={[styles.delta, { color: delta > 0 ? colors.win : delta < 0 ? colors.loss : colors.textMuted }]}>
          {delta > 0 ? "+" : ""}
          {delta} since first recorded match
        </Text>
      </View>
      <View style={[styles.track, { height }]}>
        {values.map((value, index) => {
          const pct = range === 0 ? 0.5 : (value - min) / range;
          const barHeight = Math.max(3, pct * height);
          const isLast = index === values.length - 1;
          return (
            <View
              key={index}
              style={[
                styles.bar,
                { height: barHeight, backgroundColor: isLast ? colors.accent : colors.accentMuted },
              ]}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  current: {
    ...typography.heading,
  },
  delta: {
    ...typography.small,
  },
  track: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 2,
  },
  bar: {
    flex: 1,
    borderRadius: radius.sm,
    minWidth: 2,
  },
  empty: {
    ...typography.caption,
  },
});
