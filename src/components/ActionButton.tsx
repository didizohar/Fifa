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
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  action: {
    flex: 1,
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
  },
});
