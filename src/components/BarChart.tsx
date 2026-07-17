import { StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../theme";

export interface BarChartRow {
  label: string;
  value: number;
  /** Text shown at the end of the row, e.g. "12-3-1". Defaults to the raw value. */
  valueLabel?: string;
}

interface BarChartProps {
  rows: BarChartRow[];
  /** Bars are scaled relative to this. Defaults to the largest row value. */
  maxValue?: number;
}

/** Plain-View horizontal bar list -- no chart library dependency. */
export function BarChart({ rows, maxValue }: BarChartProps) {
  if (rows.length === 0) return null;
  const max = maxValue ?? Math.max(...rows.map((r) => r.value), 1);

  return (
    <View style={styles.container}>
      {rows.map((row) => {
        const pct = max === 0 ? 0 : Math.min(1, row.value / max);
        return (
          <View key={row.label} style={styles.row}>
            <Text style={styles.label} numberOfLines={1}>
              {row.label}
            </Text>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${pct * 100}%` }]} />
            </View>
            <Text style={styles.value}>{row.valueLabel ?? row.value}</Text>
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
    width: 92,
  },
  track: {
    flex: 1,
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceElevated,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  value: {
    ...typography.small,
    width: 56,
    textAlign: "right",
  },
});
