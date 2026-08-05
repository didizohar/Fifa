import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { useTranslation } from "../lib/i18n";
import { colors, spacing, typography } from "../theme";

interface TrendComparisonRowProps {
  label: string;
  previousLabel: string;
  recentLabel: string;
  /** true = recent is better, false = recent is worse, null = no meaningful change/direction (e.g. equal values). */
  improved: boolean | null;
}

/** "{label}: {previous} -> {recent}" with a directional arrow -- the arrow is decoration only, the actual previous/recent numbers always render as text either way. */
export function TrendComparisonRow({ label, previousLabel, recentLabel, improved }: TrendComparisonRowProps) {
  const { isRTL } = useTranslation();
  const arrowColor = improved === true ? colors.win : improved === false ? colors.loss : colors.textSecondary;
  const arrowIcon = improved === true ? "arrow-up" : improved === false ? "arrow-down" : "remove";

  return (
    <View
      style={styles.row}
      accessibilityRole="text"
      accessibilityLabel={`${label}: ${previousLabel} to ${recentLabel}${improved === true ? ", improved" : improved === false ? ", declined" : ""}`}
    >
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.valuesRow}>
        <Text style={styles.value}>{previousLabel}</Text>
        <Ionicons name={arrowIcon} size={14} color={arrowColor} />
        <Text style={[styles.value, styles.valueRecent, { color: arrowColor, textAlign: isRTL ? "left" : "right" }]}>{recentLabel}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.xs,
  },
  label: {
    ...typography.caption,
    flex: 1,
  },
  valuesRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  value: {
    ...typography.bodyStrong,
  },
  valueRecent: {
    minWidth: 40,
  },
});
