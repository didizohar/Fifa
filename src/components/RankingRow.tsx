import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../theme";
import { Avatar } from "./Avatar";

interface RankingRowProps {
  rank: number;
  name: string;
  avatarUrl?: string | null;
  color: string;
  elo: number;
  winRate: number | null;
  matchesPlayed: number;
  onPress?: () => void;
}

export function RankingRow({ rank, name, avatarUrl, color, elo, winRate, matchesPlayed, onPress }: RankingRowProps) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <Text style={styles.rank}>{rank}</Text>
      <Avatar uri={avatarUrl} name={name} color={color} size={40} />
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>{name}</Text>
        <Text style={styles.meta}>
          {matchesPlayed === 0 ? "No matches yet" : `${matchesPlayed} played · ${winRate !== null ? Math.round(winRate * 100) : 0}% win`}
        </Text>
      </View>
      <Text style={styles.elo}>{elo}</Text>
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
  },
  pressed: {
    backgroundColor: colors.surfaceElevated,
  },
  rank: {
    ...typography.bodyStrong,
    color: colors.textSecondary,
    width: 20,
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
