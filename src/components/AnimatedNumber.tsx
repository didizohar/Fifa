import { useEffect, useRef, useState } from "react";
import { Animated, Text, TextStyle } from "react-native";

interface AnimatedNumberProps {
  /** Non-numeric values (already-formatted strings like "62%" or "#3 of 12") render statically -- only real numbers animate. */
  value: number | string;
  style?: TextStyle | TextStyle[];
  duration?: number;
}

/** Counts up/down to a new numeric value instead of jumping -- e.g. an Elo rating or stat tile changing after a match. */
export function AnimatedNumber({ value, style, duration = 500 }: AnimatedNumberProps) {
  const isNumeric = typeof value === "number";
  const animated = useRef(new Animated.Value(isNumeric ? value : 0)).current;
  const [display, setDisplay] = useState<number>(isNumeric ? value : 0);
  const previous = useRef(value);

  useEffect(() => {
    if (!isNumeric || previous.current === value) return;
    previous.current = value;
    const id = animated.addListener(({ value: v }) => setDisplay(Math.round(v)));
    Animated.timing(animated, { toValue: value, duration, useNativeDriver: false }).start();
    return () => animated.removeListener(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, isNumeric]);

  return <Text style={style}>{isNumeric ? display : value}</Text>;
}
