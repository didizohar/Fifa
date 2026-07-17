import { StyleSheet, Text, View } from "react-native";
import type { SideResult } from "../lib/types/database";
import { colors, radius, spacing, typography } from "../theme";

const LABEL: Record<SideResult, string> = { win: "W", loss: "L", draw: "D" };
const COLOR: Record<SideResult, string> = { win: colors.win, loss: colors.loss, draw: colors.draw };

interface FormStripProps {
  /** Most recent first. */
  results: SideResult[];
}

export function FormStrip({ results }: FormStripProps) {
  if (results.length === 0) {
    return <Text style={styles.empty}>No matches yet</Text>;
  }

  return (
    <View style={styles.row}>
      {results.map((result, index) => (
        <View key={index} style={[styles.chip, { backgroundColor: `${COLOR[result]}26`, borderColor: COLOR[result] }]}>
          <Text style={[styles.label, { color: COLOR[result] }]}>{LABEL[result]}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  chip: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    ...typography.small,
    fontWeight: "700",
  },
  empty: {
    ...typography.caption,
  },
});
