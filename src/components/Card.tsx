import { StyleSheet, View, ViewProps } from "react-native";
import { colors, radius, shadows, spacing } from "../theme";

type CardVariant = "default" | "elevated" | "glow";

interface CardProps extends ViewProps {
  /** default: subtle shadow. elevated: brighter surface + stronger shadow, for standout content. glow: accent-tinted border + glow, for highlighting (e.g. the current user's row). */
  variant?: CardVariant;
  /** Tighter padding for dense list contexts. */
  compact?: boolean;
}

export function Card({ style, variant = "default", compact = false, ...props }: CardProps) {
  return <View style={[styles.card, compact && styles.compact, variantStyles[variant], style]} {...props} />;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing.lg,
  },
  compact: {
    padding: spacing.md,
  },
});

const variantStyles: Record<CardVariant, object> = {
  default: { ...shadows.sm },
  elevated: { ...shadows.md, backgroundColor: colors.surfaceElevated },
  glow: { ...shadows.glow, borderColor: colors.accent },
};
