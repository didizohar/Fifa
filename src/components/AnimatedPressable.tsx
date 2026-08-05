import { useRef, useState } from "react";
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
 *
 * `pressed` is tracked with our own state (from the same onPressIn/onPressOut
 * that drives the scale animation) specifically so `style` -- even when the
 * caller passes the `({ pressed }) => [...]` function form -- is resolved to
 * a plain object/array *before* it reaches Animated.createAnimatedComponent.
 * That component's prop pipeline (AnimatedProps) only extracts AnimatedNode
 * values (like our `scale`) out of a style that is itself already an
 * object/array -- a raw function fails that check and gets forwarded
 * untouched, which both silently drops the scale animation AND, because the
 * resulting native view then only ever receives that never-invoked function
 * as its style, leaves it with none of the actual layout/sizing properties
 * (padding, border, alignSelf, ...) a caller like Chip depends on to size
 * itself to its own content. Resolving `pressed` ourselves guarantees the
 * final style is always a real object, so both problems disappear at once.
 */
export function AnimatedPressable({ children, style, pressedScale = 0.97, onPressIn, onPressOut, disabled, ...rest }: AnimatedPressableProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const [pressed, setPressed] = useState(false);
  const animateTo = (toValue: number) =>
    Animated.timing(scale, { toValue, duration: motion.duration.press, easing: motion.easing.press, useNativeDriver: true }).start();

  const resolvedStyle = typeof style === "function" ? style({ pressed }) : style;

  return (
    <AnimatedPressableBase
      disabled={disabled}
      onPressIn={(e: GestureResponderEvent) => {
        if (!disabled) {
          animateTo(pressedScale);
          setPressed(true);
        }
        onPressIn?.(e);
      }}
      onPressOut={(e: GestureResponderEvent) => {
        animateTo(1);
        setPressed(false);
        onPressOut?.(e);
      }}
      style={[resolvedStyle, { transform: [{ scale }] }]}
      {...rest}
    >
      {children}
    </AnimatedPressableBase>
  );
}
