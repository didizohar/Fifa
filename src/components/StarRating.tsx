import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, spacing, typography } from "../theme";

interface StarRatingProps {
  /** 0-5, half-star increments supported for display (club ratings are NUMERIC(2,1)). */
  value: number | null;
  /** Whole-star only (1-5) editing, used for the player Draw Level -- not for displaying club ratings. */
  onChange?: (value: number) => void;
  size?: number;
  /** Shown next to the stars, e.g. "4.5". Defaults to showing the number when not interactive. */
  showValue?: boolean;
}

const MAX_STARS = 5;

/** Read-only (with half-star rendering) or interactive (whole-star tap-to-set) star display. */
export function StarRating({ value, onChange, size = 16, showValue = !onChange }: StarRatingProps) {
  const interactive = !!onChange;

  if (value === null && !interactive) {
    return <Text style={[styles.missing, { fontSize: size * 0.75 }]}>No rating</Text>;
  }

  const rounded = value ?? 0;

  return (
    <View style={styles.row}>
      {Array.from({ length: MAX_STARS }, (_, i) => {
        const position = i + 1;
        const fillAmount = Math.max(0, Math.min(1, rounded - i));
        const iconName = interactive
          ? position <= rounded
            ? "star"
            : "star-outline"
          : fillAmount >= 1
            ? "star"
            : fillAmount >= 0.5
              ? "star-half"
              : "star-outline";

        const star = (
          <Ionicons
            key={position}
            name={iconName}
            size={size}
            color={fillAmount > 0 || (interactive && position <= rounded) ? colors.gold : colors.textMuted}
          />
        );

        if (!interactive) return star;

        return (
          <Pressable
            key={position}
            onPress={() => onChange(position)}
            accessibilityRole="button"
            accessibilityLabel={`Set rating to ${position} star${position > 1 ? "s" : ""}`}
            hitSlop={4}
          >
            {star}
          </Pressable>
        );
      })}
      {showValue && value !== null ? <Text style={[styles.value, { fontSize: size * 0.75 }]}>{value.toFixed(1)}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  value: {
    ...typography.small,
    marginLeft: spacing.xs,
  },
  missing: {
    ...typography.small,
  },
});
