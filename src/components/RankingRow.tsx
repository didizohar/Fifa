import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../theme";
import { AnimatedNumber } from "./AnimatedNumber";
import { Avatar } from "./Avatar";

const MEDALS = ["🥇", "🥈", "🥉"] as const;

interface RankingRowProps {
  rank: number;
  name: string;
  avatarUrl?: string | null;
  color: string;
  /** Prominent right-aligned metric, e.g. an Elo rating, win %, or goal count. */
  value: number | string;
  /** Secondary line under the name, e.g. "12 played · 60% win". */
  detail: string;
  onPress?: () => void;
  /** Marks this row as belonging to the signed-in user, e.g. in a leaderboard. */
  highlighted?: boolean;
}

export function RankingRow({ rank, name, avatarUrl, color, value, detail, onPress, highlighted = false }: RankingRowProps) {
  const medal = rank >= 1 && rank <= 3 ? MEDALS[rank - 1] : null;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={onPress ? "button" : undefined}
      style={({ pressed }) => [styles.row, highlighted && styles.highlighted, pressed && styles.pressed]}
    >
      {medal ? (
        <Text style={styles.medal}>{medal}</Text>
      ) : (
        <Text style={styles.rank}>{rank}</Text>
      )}
      <Avatar uri={avatarUrl} name={name} color={color} size={40} />
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>{name}</Text>
        <Text style={styles.meta}>{detail}</Text>
      </View>
      <AnimatedNumber value={value} style={styles.elo} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "transparent",
  },
  highlighted: {
    backgroundColor: colors.accentSubtle,
    borderColor: colors.accent,
  },
  pressed: {
    backgroundColor: colors.surfaceElevated,
  },
  rank: {
    ...typography.bodyStrong,
    color: colors.textSecondary,
    width: 24,
    textAlign: "center",
  },
  medal: {
    fontSize: 20,
    width: 24,
    textAlign: "center",
  },
  info: {
    flex: 1,
    gap: 2,
  },
  name: {
    ...typography.bodyStrong,
  },
  meta: {
    ...typography.small,
  },
  elo: {
    ...typography.heading,
    color: colors.accent,
  },
});
