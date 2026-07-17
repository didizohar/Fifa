import { StyleSheet, Text, ViewStyle } from "react-native";
import { colors, typography } from "../theme";
import { Card } from "./Card";

interface StatTileProps {
  label: string;
  value: number | string;
  style?: ViewStyle;
}

/** Compact metric card -- used in stat-tile rows on Home and the player profile. */
export function StatTile({ label, value, style }: StatTileProps) {
  return (
    <Card compact style={[styles.tile, style]}>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    alignItems: "center",
  },
  value: {
    ...typography.stat,
    fontSize: 22,
    color: colors.accent,
  },
  label: {
    ...typography.small,
    marginTop: 2,
  },
});
