import { StyleSheet, Text, ViewStyle } from "react-native";
import { colors, radius, spacing, typography } from "../theme";

export type BadgeTone = "accent" | "neutral" | "win" | "loss" | "draw" | "warning" | "gold" | "silver" | "bronze";

interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  style?: ViewStyle;
}

/** Small pill label -- match type, result, archived status, streak counts, podium rank, etc. */
export function Badge({ label, tone = "accent", style }: BadgeProps) {
  const { bg, fg } = TONE_COLORS[tone];
  return (
    <Text style={[styles.badge, { backgroundColor: bg, color: fg }, style]} numberOfLines={1}>
      {label}
    </Text>
  );
}

/** Gold/silver/bronze for the top 3, neutral otherwise -- shared by any "rank" badge (Home hero, player profile, leaderboards). */
export function rankBadgeTone(position: number | null): BadgeTone {
  if (position === 1) return "gold";
  if (position === 2) return "silver";
  if (position === 3) return "bronze";
  return "neutral";
}

const TONE_COLORS: Record<BadgeTone, { bg: string; fg: string }> = {
  accent: { bg: colors.accentSubtle, fg: colors.accent },
  neutral: { bg: colors.surfaceElevated, fg: colors.textSecondary },
  win: { bg: colors.accentSubtle, fg: colors.win },
  loss: { bg: colors.dangerSubtle, fg: colors.loss },
  draw: { bg: "rgba(245, 196, 81, 0.14)", fg: colors.draw },
  warning: { bg: "rgba(245, 196, 81, 0.14)", fg: colors.warning },
  gold: { bg: colors.goldSubtle, fg: colors.gold },
  silver: { bg: colors.silverSubtle, fg: colors.silver },
  bronze: { bg: colors.bronzeSubtle, fg: colors.bronze },
};

const styles = StyleSheet.create({
  badge: {
    ...typography.small,
    fontWeight: "700",
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    overflow: "hidden",
  },
});
