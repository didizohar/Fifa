import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, iconSize, radius, spacing, typography } from "../theme";

interface ActionButtonProps {
  icon: ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress: () => void;
}

/** Icon-in-a-circle + label quick action -- Home's row of shortcuts (Record, Add player, Leaderboards, History, Draw). */
export function ActionButton({ icon, label, onPress }: ActionButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={styles.icon}>
        <Ionicons name={icon} size={iconSize.md} color={colors.accent} />
      </View>
      <Text style={styles.label} numberOfLines={2} ellipsizeMode="tail">
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  action: {
    // Fixed-percentage width (not flex: 1) so every button in the wrapped
    // grid gets the same, predictable size regardless of how many share a
    // row or how long a neighboring label is -- 3 per row (Home's 5 Quick
    // Actions land as a balanced 3+2), reflowing naturally on narrower/
    // wider screens since it's a percentage, not a fixed pixel width.
    width: "31%",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  actionPressed: {
    backgroundColor: colors.surfaceElevated,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    ...typography.small,
    textAlign: "center",
    // Reserves space for a second line up front so a short 1-line label
    // and a long 2-line label produce the same button height -- otherwise
    // the grid would look uneven row to row. typography.small has no
    // explicit lineHeight, so this mirrors RN's ~1.25x default rather than
    // reading a field that doesn't exist.
    minHeight: typography.small.fontSize * 1.25 * 2,
  },
});
