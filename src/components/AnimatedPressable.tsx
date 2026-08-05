import { useRef } from "react";
import { Animated, GestureResponderEvent, Pressable, PressableProps } from "react-native";
import { motion } from "../theme";

interface AnimatedPressableProps extends Omit<PressableProps, "style"> {
  children: React.ReactNode;
  style?: PressableProps["style"];
  /** Scale applied on press-in. Defaults to 0.97 (Button's original value). */
  pressedScale?: number;
}

const AnimatedPressableBase = Animated.createAnimatedComponent(Pressable);

/**
 * Shared tactile press-scale wrapper -- pulled out of Button (the only
 * place this existed before) so Card/Chip and anything else pressable can
 * opt into the same feedback instead of hand-rolling their own Animated.Value.
 * Accepts the same `style` shapes Pressable does (object, array, or a
 * `({ pressed }) => ...` callback) and merges the animated scale on top.
 */
export function AnimatedPressable({ children, style, pressedScale = 0.97, onPressIn, onPressOut, disabled, ...rest }: AnimatedPressableProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const animateTo = (toValue: number) =>
    Animated.timing(scale, { toValue, duration: motion.duration.press, easing: motion.easing.press, useNativeDriver: true }).start();

  return (
    <AnimatedPressableBase
      disabled={disabled}
      onPressIn={(e: GestureResponderEvent) => {
        if (!disabled) animateTo(pressedScale);
        onPressIn?.(e);
      }}
      onPressOut={(e: GestureResponderEvent) => {
        animateTo(1);
        onPressOut?.(e);
      }}
      style={(state: { pressed: boolean }) => [typeof style === "function" ? style(state) : style, { transform: [{ scale }] }]}
      {...rest}
    >
      {children}
    </AnimatedPressableBase>
  );
}
