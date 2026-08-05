import { Ionicons } from "@expo/vector-icons";
import { ComponentProps, useEffect, useRef } from "react";
import { Animated, ColorValue } from "react-native";
import { motion } from "../theme";

type IconName = ComponentProps<typeof Ionicons>["name"];

interface TabBarIconProps {
  /** Filled glyph shown when this tab is active. */
  name: IconName;
  /** Outline glyph shown when this tab is inactive. */
  outlineName: IconName;
  focused: boolean;
  color: ColorValue;
  size: number;
}

/** Animates a bigger scale-in and a filled/outline glyph swap on tab focus, instead of a flat color-only change. */
export function TabBarIcon({ name, outlineName, focused, color, size }: TabBarIconProps) {
  const scale = useRef(new Animated.Value(focused ? 1 : 0.86)).current;

  useEffect(() => {
    Animated.timing(scale, {
      toValue: focused ? 1 : 0.86,
      duration: motion.duration.press,
      easing: motion.easing.press,
      useNativeDriver: true,
    }).start();
  }, [focused, scale]);

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Ionicons name={focused ? name : outlineName} size={size} color={color} />
    </Animated.View>
  );
}
