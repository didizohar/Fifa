import { useMemo } from "react";
import { Platform, StyleSheet, View, ViewProps } from "react-native";
import { useTheme } from "../theme/ThemeContext";

type CardVariant = "default" | "elevated" | "glow" | "strong";

interface CardProps extends ViewProps {
  /** default: subtle shadow. elevated: brighter surface + stronger shadow, for standout content. glow: accent-tinted border + glow, for highlighting (e.g. the current user's row). strong: the single most prominent card on a screen (e.g. a live-session hero). */
  variant?: CardVariant;
  /** Tighter padding for dense list contexts. */
  compact?: boolean;
}

export function Card({ style, variant = "default", compact = false, ...props }: CardProps) {
  const { colors, radius, shadows, spacing } = useTheme();
  // StyleSheet.create runs once at module load and can never react to a
  // theme change on its own (see colors.ts's own comment on this) -- built
  // inside the component and memoized on the actual theme values instead,
  // so this only recomputes when the active scheme actually changes, not
  // on every render.
  const styles = useMemo(
    () =>
      StyleSheet.create({
        card: {
          backgroundColor: colors.surface,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: colors.borderSubtle,
          padding: spacing.lg,
        },
        compact: { padding: spacing.md },
        default: { ...shadows.sm },
        elevated: { ...shadows.md, backgroundColor: colors.surfaceElevated },
        glow: { ...shadows.glow, borderColor: colors.accent },
        strong: { ...shadows.md, backgroundColor: colors.surfaceStrong, borderColor: colors.borderStrong },
      }),
    [colors, radius, shadows, spacing],
  );

  return (
    <View
      style={[styles.card, compact && styles.compact, styles[variant], style]}
      // Without this, iOS recomputes each Card's drop-shadow mask on the
      // render thread every frame it's on screen (including during scroll)
      // instead of caching it as a bitmap -- costly with several Cards
      // stacked in one scrolling screen (Record Match, Winners Stay).
      shouldRasterizeIOS={Platform.OS === "ios"}
      {...props}
    />
  );
}
