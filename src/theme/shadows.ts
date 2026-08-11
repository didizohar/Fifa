import { Platform } from "react-native";
import { colors, type ThemeColors } from "./colors";

/**
 * RN has no CSS box-shadow -- iOS/Android need shadow* + elevation props,
 * so each level bundles both. Web (react-native-web) reads the shadow*
 * props directly.
 */
function shadow(opacity: number, radius: number, elevation: number) {
  return Platform.select({
    web: { boxShadow: `0px ${Math.round(radius / 2)}px ${radius}px rgba(0, 0, 0, ${opacity})` },
    default: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: Math.round(radius / 2) },
      shadowOpacity: opacity,
      shadowRadius: radius,
      elevation,
    },
  });
}

/**
 * `glow` depends on the active theme's accent color, so this is a function
 * of `colors` -- see useTheme() in ThemeContext.tsx. The static `shadows`
 * export below (built from the light palette) is what every unmigrated
 * component still imports directly and keeps working unchanged.
 *
 * Opacity here is tuned per-theme, not just per-level: the same 0.18-0.32
 * range that reads as a barely-there accent against a near-black backdrop
 * (the previous dark theme) reads as a harsh, muddy smudge against white.
 * Light-UI soft shadows use much lower opacity and lean on a bigger blur
 * radius for softness instead. Dark mode reuses the same sm/md/lg levels --
 * a black shadow blends into a dark surface regardless of opacity, so there
 * is no separate dark-tuned variant needed for those three, only for `glow`
 * (which is colored, not black).
 */
export function createShadows(colors: ThemeColors) {
  return {
    sm: shadow(0.05, 6, 2),
    md: shadow(0.08, 14, 4),
    lg: shadow(0.1, 24, 8),
    glow: Platform.select({
      web: { boxShadow: `0px 4px 20px ${colors.accent}38` },
      default: {
        shadowColor: colors.accent,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.22,
        shadowRadius: 16,
        elevation: 6,
      },
    }),
  } as const;
}

export const shadows = createShadows(colors);
