import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View, ViewStyle } from "react-native";
import { colors, radius } from "../theme";

interface SkeletonProps {
  width?: number | `${number}%`;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export function Skeleton({ width = "100%", height = 16, borderRadius = radius.sm, style }: SkeletonProps) {
  const pulse = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulse]);

  return (
    <Animated.View
      style={[
        styles.base,
        { width, height, borderRadius, opacity: pulse },
        style,
      ]}
    />
  );
}

interface SkeletonRowProps {
  count?: number;
  height?: number;
  gap?: number;
}

export function SkeletonList({ count = 4, height = 64, gap = 12 }: SkeletonRowProps) {
  return (
    <View style={{ gap }}>
      {Array.from({ length: count }).map((_, index) => (
        <Skeleton key={index} height={height} borderRadius={radius.lg} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.skeleton,
  },
});
