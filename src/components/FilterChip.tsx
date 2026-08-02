import { Pressable, StyleSheet, Text } from "react-native";
import { colors, radius, spacing, typography } from "../theme";

interface FilterChipProps {
  label: string;
  active: boolean;
  onPress: () => void;
  disabled?: boolean;
}

/** A single selectable pill -- shared shape for category/mode/preset selectors (Leaderboards categories, History club filter, Draw modes). */
export function FilterChip({ label, active, onPress, disabled = false }: FilterChipProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.chip, active && styles.chipActive, disabled && styles.chipDisabled, pressed && !disabled && styles.chipPressed]}
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled }}
    >
      <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSubtle,
  },
  chipDisabled: {
    opacity: 0.4,
  },
  chipPressed: {
    opacity: 0.7,
  },
  label: {
    ...typography.caption,
  },
  labelActive: {
    color: colors.accent,
    fontWeight: "700",
  },
});
