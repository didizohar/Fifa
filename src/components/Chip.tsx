import { StyleSheet, Text, ViewStyle } from "react-native";
import { colors, radius, spacing, typography } from "../theme";
import { AnimatedPressable } from "./AnimatedPressable";

interface ChipProps {
  label: string;
  active: boolean;
  onPress: () => void;
  disabled?: boolean;
  style?: ViewStyle;
}

/**
 * A single selectable pill -- the one shared shape for every filter/mode/
 * category selector in the app (League Table, Trends, Statistics, Draw
 * modes, History, Season tabs). Replaces two divergent predecessors that
 * both clipped text: FilterChip's forced `numberOfLines={1}`, and
 * History's own local ClubChip with a hardcoded `maxWidth: 160`. This
 * sizes itself to its label (padding, not a fixed width) and allows a
 * label to wrap to a second line before it would ever truncate.
 */
export function Chip({ label, active, onPress, disabled = false, style }: ChipProps) {
  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={disabled}
      pressedScale={0.96}
      style={({ pressed }) => [styles.chip, active && styles.chipActive, disabled && styles.chipDisabled, pressed && !disabled && styles.chipPressed, style]}
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled }}
    >
      <Text style={[styles.label, active && styles.labelActive]} numberOfLines={2}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
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
    fontSize: 12,
  },
  labelActive: {
    color: colors.accent,
    fontWeight: "700",
  },
});
