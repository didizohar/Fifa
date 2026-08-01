import { Ionicons } from "@expo/vector-icons";
import { memo, useCallback } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../theme";
import { AnimatedNumber } from "./AnimatedNumber";
import { Avatar } from "./Avatar";

const MEDALS = ["🥇", "🥈", "🥉"] as const;

interface RankingRowProps {
  /** Needed so onPress can be a single stable callback shared by every row (see onPress below) instead of each caller inline-binding a fresh closure per row per render, which would defeat this component's memo. */
  playerId: string;
  rank: number;
  name: string;
  avatarUrl?: string | null;
  color: string;
  /** Prominent right-aligned metric, e.g. a win %, goal count, or streak length. */
  value: number | string;
  /** Secondary line under the name, e.g. "12 played · 60% win". */
  detail: string;
  /** Receives this row's playerId -- pass one stable (useCallback'd) function shared across every row, not a per-row inline closure. */
  onPress?: (playerId: string) => void;
  /** Marks this row as belonging to the signed-in user, e.g. in a leaderboard. */
  highlighted?: boolean;
  /** Positions gained (positive) or lost (negative) since this ranking was last shown this session. Omit or 0 to show nothing. */
  movement?: number;
}

// Leaderboards/Home/LeagueTableCard all render one of these per ranked
// player (potentially the whole roster) -- memo means a re-render caused
// by unrelated state (sort mode, filter, a different row's movement)
// only actually re-renders rows whose own props changed, PROVIDED every
// caller passes a stable onPress (see the playerId/onPress doc above).
export const RankingRow = memo(function RankingRow({ playerId, rank, name, avatarUrl, color, value, detail, onPress, highlighted = false, movement = 0 }: RankingRowProps) {
  const medal = rank >= 1 && rank <= 3 ? MEDALS[rank - 1] : null;
  const handlePress = useCallback(() => onPress?.(playerId), [onPress, playerId]);
  return (
    <Pressable
      onPress={onPress ? handlePress : undefined}
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
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
          {movement !== 0 ? (
            <View style={styles.movement} accessibilityLabel={movement > 0 ? `Up ${movement}` : `Down ${Math.abs(movement)}`}>
              <Ionicons name={movement > 0 ? "caret-up" : "caret-down"} size={12} color={movement > 0 ? colors.win : colors.loss} />
              <Text style={[styles.movementLabel, { color: movement > 0 ? colors.win : colors.loss }]}>{Math.abs(movement)}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.meta}>{detail}</Text>
      </View>
      <AnimatedNumber value={value} style={styles.metric} />
    </Pressable>
  );
});

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
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  name: {
    ...typography.bodyStrong,
    flexShrink: 1,
  },
  movement: {
    flexDirection: "row",
    alignItems: "center",
  },
  movementLabel: {
    ...typography.small,
    fontWeight: "700",
  },
  meta: {
    ...typography.small,
  },
  metric: {
    ...typography.heading,
    color: colors.accent,
  },
});
