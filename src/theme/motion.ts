import { Easing } from "react-native";

/**
 * Shared timing/easing constants for every hand-rolled `Animated` effect in
 * the app. Before this existed, Button/FadeIn/AnimatedNumber/Skeleton each
 * picked their own duration and curve independently -- three different
 * "subtle motion" moments with three different feels. Pick from here
 * instead of inventing a new duration.
 */
export const motion = {
  duration: {
    /** Instant press feedback (button/chip/card scale). */
    press: 100,
    /** Content entrance (fade/slide-in). */
    entrance: 350,
    /** Value transitions (counters, progress fills). */
    value: 500,
  },
  easing: {
    press: Easing.out(Easing.quad),
    entrance: Easing.out(Easing.cubic),
    value: Easing.out(Easing.quad),
  },
} as const;
