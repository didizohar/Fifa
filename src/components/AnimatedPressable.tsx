import { useRef } from "react";
import { Animated, GestureResponderEvent, Pressable, PressableProps, PressableStateCallbackType } from "react-native";
import { motion } from "../theme";

interface AnimatedPressableProps extends Omit<PressableProps, "style"> {
  children: React.ReactNode;
  style?: PressableProps["style"];
  /** Scale applied on press-in. Defaults to 0.97 (Button's original value). */
  pressedScale?: number;
}

/**
 * Shared tactile press-scale wrapper -- pulled out of Button (the only
 * place this existed before) so Card/Chip and anything else pressable can
 * opt into the same feedback instead of hand-rolling their own Animated.Value.
 *
 * Deliberately a plain Pressable (not Animated.createAnimatedComponent(
 * Pressable)) with the animated scale applied to a plain-object-styled
 * inner Animated.View: `Animated.createAnimatedComponent` only extracts
 * AnimatedNode values out of a `style` that is itself a plain object/array
 * (see react-native's AnimatedProps.js -- it checks `typeof value ===
 * "object"` before looking inside). Button/Chip both pass a *function*
 * style (`({ pressed }) => [...]`) to get Pressable's own pressed-state
 * styling, which fails that check and forwards the function untouched --
 * so the `scale` Animated.Value inside it would never actually be wired
 * to native updates, and the animation would silently never play. Using
 * Pressable's `children` render-prop for the same pressed-state instead
 * keeps `style` a real object every time.
 */
export function AnimatedPressable({ children, style, pressedScale = 0.97, onPressIn, onPressOut, disabled, ...rest }: AnimatedPressableProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const animateTo = (toValue: number) =>
    Animated.timing(scale, { toValue, duration: motion.duration.press, easing: motion.easing.press, useNativeDriver: true }).start();

  return (
    <Pressable
      disabled={disabled}
      onPressIn={(e: GestureResponderEvent) => {
        if (!disabled) animateTo(pressedScale);
        onPressIn?.(e);
      }}
      onPressOut={(e: GestureResponderEvent) => {
        animateTo(1);
        onPressOut?.(e);
      }}
      {...rest}
    >
      {(state: PressableStateCallbackType) => (
        <Animated.View style={[typeof style === "function" ? style(state) : style, { transform: [{ scale }] }]}>{children}</Animated.View>
      )}
    </Pressable>
  );
}
