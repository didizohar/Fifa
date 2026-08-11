import { useMemo } from "react";
import { Text, ViewStyle } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import type { ThemeColors } from "../theme/colors";

export type BadgeTone = "accent" | "accentOrange" | "neutral" | "win" | "loss" | "draw" | "warning" | "gold" | "silver" | "bronze" | "live";

interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  style?: ViewStyle;
}

/** Gold/silver/bronze for the top 3, neutral otherwise -- shared by any "rank" badge (Home hero, player profile, leaderboards). */
export function rankBadgeTone(position: number | null): BadgeTone {
  if (position === 1) return "gold";
  if (position === 2) return "silver";
  if (position === 3) return "bronze";
  return "neutral";
}

function toneColors(colors: ThemeColors): Record<BadgeTone, { bg: string; fg: string }> {
  return {
    accent: { bg: colors.accentSubtle, fg: colors.accent },
    accentOrange: { bg: colors.accentOrangeSubtle, fg: colors.accentOrange },
    neutral: { bg: colors.surfaceElevated, fg: colors.textSecondary },
    win: { bg: colors.accentSubtle, fg: colors.win },
    live: { bg: colors.accentSubtle, fg: colors.live },
    loss: { bg: colors.dangerSubtle, fg: colors.loss },
    draw: { bg: colors.drawSubtle, fg: colors.draw },
    warning: { bg: colors.warningSubtle, fg: colors.warning },
    gold: { bg: colors.goldSubtle, fg: colors.gold },
    silver: { bg: colors.silverSubtle, fg: colors.silver },
    bronze: { bg: colors.bronzeSubtle, fg: colors.bronze },
  };
}

/** Small pill label -- match type, result, archived status, streak counts, podium rank, etc. */
export function Badge({ label, tone = "accent", style }: BadgeProps) {
  const { colors, radius, spacing, typography } = useTheme();
  const styles = useMemo(
    () => ({
      toneColors: toneColors(colors),
      badge: { ...typography.small, fontWeight: "700" as const, paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.pill, overflow: "hidden" as const },
    }),
    [colors, radius, spacing, typography],
  );
  const { bg, fg } = styles.toneColors[tone];
  return (
    <Text style={[styles.badge, { backgroundColor: bg, color: fg }, style]} numberOfLines={1}>
      {label}
    </Text>
  );
}
