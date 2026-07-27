import { useEffect, useRef } from "react";
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from "react-native";
import type { TrendDirection } from "../lib/trends/types";
import { colors, radius, spacing, typography } from "../theme";
import { TrendBadge } from "./TrendBadge";

interface MomentumIndicatorProps {
  /** 0-100. */
  score: number;
  direction: TrendDirection;
  directionLabel: string;
  /** e.g. "Momentum". */
  label: string;
}

/** The headline momentum visual -- a big score, its direction badge, and a filled bar. Bar fill animates unless the OS's reduce-motion setting is on, matching FadeIn's convention. */
export function MomentumIndicator({ score, direction, directionLabel, label }: MomentumIndicatorProps) {
  const progress = useRef(new Animated.Value(0)).current;
  const clamped = Math.max(0, Math.min(100, score));

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduceMotion) => {
      if (cancelled) return;
      if (reduceMotion) {
        progress.setValue(clamped);
        return;
      }
      Animated.timing(progress, { toValue: clamped, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clamped]);

  return (
    <View accessibilityRole="text" accessibilityLabel={`${label}: ${clamped} out of 100, ${directionLabel}`}>
      <View style={styles.headerRow}>
        <Text style={styles.label}>{label}</Text>
        <TrendBadge direction={direction} label={directionLabel} />
      </View>
      <View style={styles.valueRow}>
        <Text style={styles.value}>{clamped}</Text>
        <Text style={styles.valueMax}>/100</Text>
      </View>
      <View style={styles.track}>
        <Animated.View
          style={[
            styles.fill,
            {
              backgroundColor: direction === "falling" ? colors.loss : colors.accent,
              width: progress.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] }),
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  label: {
    ...typography.heading,
  },
  valueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 2,
    marginBottom: spacing.sm,
  },
  value: {
    ...typography.display,
    fontSize: 32,
  },
  valueMax: {
    ...typography.caption,
  },
  track: {
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceElevated,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: radius.pill,
  },
});
