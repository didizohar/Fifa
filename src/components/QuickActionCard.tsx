import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, iconSize, radius, spacing, typography } from "../theme";
import { AnimatedPressable } from "./AnimatedPressable";

interface QuickActionCardProps {
  icon: ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress: () => void;
}

/**
 * One shared card for every Dashboard Quick Action -- two equal-width
 * columns via flexBasis (not flex: 1, so a row always holds exactly two
 * regardless of label length), fixed minHeight so a one-line and a
 * two-line label produce identically-sized cards instead of an uneven grid.
 */
export function QuickActionCard({ icon, label, onPress }: QuickActionCardProps) {
  return (
    <AnimatedPressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={styles.iconBadge}>
        <Ionicons name={icon} size={iconSize.md} color={colors.accent} />
      </View>
      <Text style={styles.label} numberOfLines={2} ellipsizeMode="tail">
        {label}
      </Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexBasis: "48%",
    flexGrow: 1,
    minHeight: 100,
    alignItems: "flex-start",
    justifyContent: "flex-end",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surface,
  },
  cardPressed: {
    backgroundColor: colors.surfaceElevated,
  },
  iconBadge: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    ...typography.bodyStrong,
  },
});
