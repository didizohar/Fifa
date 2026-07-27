import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../theme";

interface SegmentedControlProps<T extends string> {
  options: { value: T; label: string; disabled?: boolean }[];
  value: T;
  onChange: (value: T) => void;
}

/** Row of equal-width pill toggles, single-select -- shared by any "pick one of a few modes" control. */
export function SegmentedControl<T extends string>({ options, value, onChange }: SegmentedControlProps<T>) {
  return (
    <View style={styles.row}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => !opt.disabled && onChange(opt.value)}
            disabled={opt.disabled}
            style={[styles.segment, active && styles.segmentActive, opt.disabled && styles.segmentDisabled]}
            accessibilityRole="button"
            accessibilityState={{ selected: active, disabled: opt.disabled }}
          >
            <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  segment: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  segmentActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSubtle,
  },
  segmentDisabled: {
    opacity: 0.4,
  },
  label: {
    ...typography.caption,
  },
  labelActive: {
    color: colors.accent,
    fontWeight: "700",
  },
});
