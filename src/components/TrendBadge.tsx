import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { TrendDirection } from "../lib/trends/types";
import { colors, radius, spacing, typography } from "../theme";

interface TrendBadgeProps {
  direction: TrendDirection;
  /** Pre-translated label, e.g. t("trends.direction.rising"). */
  label: string;
}

const DIRECTION_STYLE: Record<TrendDirection, { icon: ComponentProps<typeof Ionicons>["name"]; color: string; bg: string }> = {
  rising: { icon: "trending-up", color: colors.win, bg: colors.accentSubtle },
  falling: { icon: "trending-down", color: colors.loss, bg: colors.dangerSubtle },
  stable: { icon: "remove", color: colors.textSecondary, bg: colors.surfaceElevated },
  insufficientData: { icon: "help-circle-outline", color: colors.textMuted, bg: colors.surfaceElevated },
};

/** Direction pill -- icon + text together, so the meaning never depends on color alone. */
export function TrendBadge({ direction, label }: TrendBadgeProps) {
  const { icon, color, bg } = DIRECTION_STYLE[direction];
  return (
    <View style={[styles.badge, { backgroundColor: bg }]} accessibilityRole="text" accessibilityLabel={label}>
      <Ionicons name={icon} size={14} color={color} />
      <Text style={[styles.label, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    alignSelf: "flex-start",
  },
  label: {
    ...typography.small,
    fontWeight: "700",
  },
});
