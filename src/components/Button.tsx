import { ActivityIndicator, StyleSheet, Text, ViewStyle } from "react-native";
import { colors, radius, spacing, typography } from "../theme";
import { AnimatedPressable } from "./AnimatedPressable";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  /** Defaults to "lg" (52pt) -- the original, only size that existed before this was added. */
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}

export function Button({ label, onPress, variant = "primary", size = "lg", loading, disabled, style }: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        sizeStyles[size],
        variantStyles[variant],
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === "primary" ? colors.background : colors.accent} />
      ) : (
        <Text style={[styles.label, labelSizeStyles[size], labelVariantStyles[variant]]}>{label}</Text>
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    ...typography.bodyStrong,
  },
});

const sizeStyles: Record<Size, ViewStyle> = {
  sm: { height: 36, paddingHorizontal: spacing.md },
  md: { height: 44, paddingHorizontal: spacing.md },
  lg: { height: 52, paddingHorizontal: spacing.lg },
};

const labelSizeStyles: Record<Size, { fontSize: number }> = {
  sm: { fontSize: 13 },
  md: { fontSize: 14 },
  lg: { fontSize: 15 },
};

const variantStyles: Record<Variant, ViewStyle> = {
  primary: { backgroundColor: colors.accent },
  secondary: { backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border },
  ghost: { backgroundColor: "transparent" },
  danger: { backgroundColor: colors.dangerSubtle, borderWidth: 1, borderColor: colors.danger },
};

const labelVariantStyles: Record<Variant, { color: string }> = {
  primary: { color: colors.background },
  secondary: { color: colors.textPrimary },
  ghost: { color: colors.accent },
  danger: { color: colors.danger },
};
