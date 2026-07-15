import { colors } from "./colors";

export const typography = {
  display: { fontSize: 32, fontWeight: "800" as const, color: colors.textPrimary, letterSpacing: -0.5 },
  title: { fontSize: 22, fontWeight: "700" as const, color: colors.textPrimary, letterSpacing: -0.3 },
  heading: { fontSize: 17, fontWeight: "700" as const, color: colors.textPrimary },
  body: { fontSize: 15, fontWeight: "400" as const, color: colors.textPrimary },
  bodyStrong: { fontSize: 15, fontWeight: "600" as const, color: colors.textPrimary },
  caption: { fontSize: 13, fontWeight: "500" as const, color: colors.textSecondary },
  small: { fontSize: 12, fontWeight: "500" as const, color: colors.textMuted },
  stat: { fontSize: 28, fontWeight: "800" as const, color: colors.textPrimary, letterSpacing: -0.5 },
};
