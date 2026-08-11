import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { useMemo } from "react";
import { Text, ViewStyle } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { AnimatedPressable } from "./AnimatedPressable";

interface ChipProps {
  label: string;
  active: boolean;
  onPress: () => void;
  disabled?: boolean;
  /** Rendered before the label on the row's logical start side. Plain flexDirection: "row" -- native RTL mirroring (I18nManager.forceRTL, already active app-wide) handles which physical side that is, no isRTL branching needed here. */
  icon?: ComponentProps<typeof Ionicons>["name"];
  /**
   * Defaults to "button" -- exactly today's behavior, so every existing
   * caller is unaffected. AppChipGroup passes "radio" (single-select) or
   * "checkbox" (multi-select) per its own selection mode, which is the
   * semantically correct role RN offers for those cases.
   */
  accessibilityRole?: "button" | "radio" | "checkbox";
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
export function Chip({ label, active, onPress, disabled = false, icon, accessibilityRole = "button", style }: ChipProps) {
  const { colors, radius, spacing, typography } = useTheme();
  const styles = useMemo(
    () => ({
      chip: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        alignSelf: "flex-start" as const,
        paddingHorizontal: spacing.sm + 4,
        paddingVertical: spacing.xs + 2,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
      },
      icon: { marginEnd: 4 },
      chipActive: { borderColor: colors.accent, backgroundColor: colors.accentSubtle },
      chipDisabled: { opacity: 0.4 },
      chipPressed: { opacity: 0.7 },
      label: { ...typography.caption, fontSize: 12 },
      labelActive: { color: colors.accent, fontWeight: "700" as const },
    }),
    [colors, radius, spacing, typography],
  );

  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={disabled}
      pressedScale={0.96}
      // Compact visual pill stays exactly the size it already is -- the 44pt
      // minimum touch target (Apple HIG / WCAG 2.5.5) comes entirely from
      // this invisible hit-area expansion, never from inflating the chip
      // itself. Left/right kept smaller than top/bottom so tightly-packed
      // adjacent chips (row gap: spacing.sm) never get overlapping hit zones.
      hitSlop={{ top: 8, bottom: 8, left: 2, right: 2 }}
      style={({ pressed }) => [styles.chip, active && styles.chipActive, disabled && styles.chipDisabled, pressed && !disabled && styles.chipPressed, style]}
      accessibilityRole={accessibilityRole}
      // "checkbox" is the one role RN models with "checked" instead of
      // "selected" -- "button" (the unchanged default) and "radio" both use
      // the same accessibilityState shape as before.
      accessibilityState={accessibilityRole === "checkbox" ? { checked: active, disabled } : { selected: active, disabled }}
    >
      {icon ? <Ionicons name={icon} size={14} color={active ? colors.accent : colors.textSecondary} style={styles.icon} /> : null}
      <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}
