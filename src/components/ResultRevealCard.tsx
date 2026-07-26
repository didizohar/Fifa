import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { colors, radius, shadows, spacing } from "../theme";
import { FadeIn } from "./FadeIn";

interface ResultRevealCardProps {
  children: ReactNode;
  /** Bump this whenever a new result is drawn so the entrance animation replays (FadeIn only runs once per mount otherwise). */
  revealKey?: string | number;
}

/**
 * Wraps a freshly-drawn result (players, a team, a matchup) in the same
 * accent-glow treatment used for "this is the highlight" content elsewhere,
 * plus FadeIn's entrance -- which already respects reduced-motion. Screens
 * are responsible for calling AccessibilityInfo.announceForAccessibility
 * with the specific result text, since the wording differs per draw type.
 */
export function ResultRevealCard({ children, revealKey }: ResultRevealCardProps) {
  return (
    <FadeIn key={revealKey} style={styles.wrapper}>
      <View style={styles.card}>{children}</View>
    </FadeIn>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: "100%",
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.surfaceElevated,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.glow,
  },
});
