import { colors, type ThemeColors } from "./colors";

/**
 * Every variant's `color` depends on the active theme, so this is a
 * function of `colors` rather than a static object -- see useTheme() in
 * ThemeContext.tsx for the dark-mode-aware call. The static `typography`
 * export below (built from the light palette) is what every unmigrated
 * component still imports directly and keeps working unchanged.
 */
export function createTypography(colors: ThemeColors) {
  return {
    displayLarge: { fontSize: 40, fontWeight: "800" as const, color: colors.textPrimary, letterSpacing: -0.8 },
    display: { fontSize: 32, fontWeight: "800" as const, color: colors.textPrimary, letterSpacing: -0.5 },
    title: { fontSize: 22, fontWeight: "700" as const, color: colors.textPrimary, letterSpacing: -0.3 },
    heading: { fontSize: 17, fontWeight: "700" as const, color: colors.textPrimary },
    body: { fontSize: 15, fontWeight: "400" as const, color: colors.textPrimary },
    bodyStrong: { fontSize: 15, fontWeight: "600" as const, color: colors.textPrimary },
    caption: { fontSize: 13, fontWeight: "500" as const, color: colors.textSecondary },
    small: { fontSize: 12, fontWeight: "500" as const, color: colors.textMuted },
    stat: { fontSize: 28, fontWeight: "800" as const, color: colors.textPrimary, letterSpacing: -0.5 },
    /** Small-caps section label, e.g. above a hero stat or a card group title. */
    eyebrow: {
      fontSize: 11,
      fontWeight: "700" as const,
      color: colors.textMuted,
      letterSpacing: 1.2,
      textTransform: "uppercase" as const,
    },
  };
}

export const typography = createTypography(colors);
