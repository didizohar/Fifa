import { useEffect, useRef } from "react";
import { AccessibilityInfo, Animated, ViewStyle } from "react-native";

interface FadeInProps {
  children: React.ReactNode;
  style?: ViewStyle;
  /** Stagger multiple FadeIns (e.g. a short list) by passing an increasing index. */
  delay?: number;
}

/** Subtle opacity + slide-up entrance for a screen's most prominent content (hero, podium) -- not meant for every list row. */
export function FadeIn({ children, style, delay = 0 }: FadeInProps) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduceMotion) => {
      if (cancelled) return;
      if (reduceMotion) {
        progress.setValue(1);
        return;
      }
      Animated.timing(progress, { toValue: 1, duration: 350, delay, useNativeDriver: true }).start();
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
