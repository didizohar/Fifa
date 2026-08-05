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
 * both clipped text: FilterChip's forced `numberOfLines={1}` on a
 * fixed-width chip, and History's own local ClubChip with a hardcoded
 * `maxWidth: 160`.
 *
 * Always single-line and always sized to its own label (no fixed/max
 * width) -- an oversized chip can never truncate, it just can't exist:
 * the label determines the chip's width, full stop. When a row of chips
 * doesn't fit, the *container*'s `flexWrap: "wrap"` moves a whole chip to
 * the next line, which reads as a clean, modern segmented-control-style
 * layout; wrapping the *text* inside a single chip (an earlier version of
 * this component allowed 2 lines) does not.
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
      <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: "flex-start",
    paddingHorizontal: spacing.sm + 4,
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
