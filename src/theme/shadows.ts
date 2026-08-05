import { Platform } from "react-native";
import { colors } from "./colors";

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

// Opacity here is tuned per-theme, not just per-level: the same 0.18-0.32
// range that reads as a barely-there accent against a near-black backdrop
// (the previous dark theme) reads as a harsh, muddy smudge against white.
// Light-UI soft shadows use much lower opacity and lean on a bigger blur
// radius for softness instead.
export const shadows = {
  sm: shadow(0.05, 6, 2),
  md: shadow(0.08, 14, 4),
  lg: shadow(0.1, 24, 8),
  glow: Platform.select({
    web: { boxShadow: `0px 4px 20px rgba(37, 99, 235, 0.22)` },
    default: {
      shadowColor: colors.accent,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.22,
      shadowRadius: 16,
      elevation: 6,
    },
  }),
} as const;
