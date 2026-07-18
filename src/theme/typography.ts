import { colors } from "./colors";

export const typography = {
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
