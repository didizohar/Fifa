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

export const shadows = {
  sm: shadow(0.18, 6, 2),
  md: shadow(0.24, 12, 5),
  lg: shadow(0.32, 20, 10),
  glow: Platform.select({
    web: { boxShadow: `0px 0px 16px rgba(62, 224, 122, 0.35)` },
    default: {
      shadowColor: colors.accent,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.45,
      shadowRadius: 12,
      elevation: 8,
    },
  }),
} as const;
