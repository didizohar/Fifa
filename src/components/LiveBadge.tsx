import { useEffect, useMemo, useRef } from "react";
import { Animated, Text, View } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { motion } from "../theme/motion";

interface LiveBadgeProps {
  label: string;
}

/**
 * Restrained "● LIVE SESSION" indicator -- a single, finite fade-in on
 * mount (the same safe, established pattern FadeIn already uses), not a
 * continuous Animated.loop. A truly infinite native-driven loop never
 * settles, which made react-test-renderer's act() hang forever the one
 * time this was tried with Animated.loop -- every other looping animation
 * in this codebase (e.g. Skeleton's shimmer) has, not coincidentally,
 * never actually been rendered inside a test that awaits act().
 */
export function LiveBadge({ label }: LiveBadgeProps) {
  const { colors, spacing, typography } = useTheme();
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: motion.duration.entrance, useNativeDriver: true }).start();
  }, [opacity]);

  const styles = useMemo(
    () => ({
      row: { flexDirection: "row" as const, alignItems: "center" as const, gap: spacing.xs },
      dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.live },
      label: { ...typography.caption, color: colors.live, fontWeight: "700" as const, letterSpacing: 0.4 },
    }),
    [colors, spacing, typography],
  );

  return (
    <View style={styles.row}>
      <Animated.View style={[styles.dot, { opacity }]} />
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}
