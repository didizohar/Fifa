import { Platform, StyleSheet, View, ViewProps } from "react-native";
import { colors, radius, shadows, spacing } from "../theme";

type CardVariant = "default" | "elevated" | "glow";

interface CardProps extends ViewProps {
  /** default: subtle shadow. elevated: brighter surface + stronger shadow, for standout content. glow: accent-tinted border + glow, for highlighting (e.g. the current user's row). */
  variant?: CardVariant;
  /** Tighter padding for dense list contexts. */
  compact?: boolean;
}

export function Card({ style, variant = "default", compact = false, ...props }: CardProps) {
  return (
    <View
      style={[styles.card, compact && styles.compact, variantStyles[variant], style]}
      // Without this, iOS recomputes each Card's drop-shadow mask on the
      // render thread every frame it's on screen (including during scroll)
      // instead of caching it as a bitmap -- costly with several Cards
      // stacked in one scrolling screen (Record Match, Winners Stay).
      shouldRasterizeIOS={Platform.OS === "ios"}
      {...props}
    />
  );
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
