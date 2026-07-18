import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../theme";
import { Avatar } from "./Avatar";

export interface PodiumEntry {
  playerId: string;
  name: string;
  avatarUrl: string | null;
  color: string;
  valueLabel: string;
}

interface PodiumProps {
  entries: PodiumEntry[];
  highlightedPlayerId?: string | null;
  onPressEntry?: (playerId: string) => void;
}

const PLACE_STYLE = {
  1: { tone: colors.gold, height: 88, avatarSize: 56, medal: "🥇" },
  2: { tone: colors.silver, height: 68, avatarSize: 48, medal: "🥈" },
  3: { tone: colors.bronze, height: 52, avatarSize: 48, medal: "🥉" },
} as const;

/** Top-3 podium -- rendered as 2nd / 1st / 3rd left-to-right, with 1st visually tallest. */
export function Podium({ entries, highlightedPlayerId, onPressEntry }: PodiumProps) {
  const [first, second, third] = entries;
  if (!first) return null;

  return (
    <View style={styles.row}>
      {second ? (
        <Place entry={second} place={2} highlighted={second.playerId === highlightedPlayerId} onPress={onPressEntry} />
      ) : (
        <View style={styles.spacer} />
      )}
      <Place entry={first} place={1} highlighted={first.playerId === highlightedPlayerId} onPress={onPressEntry} />
      {third ? (
        <Place entry={third} place={3} highlighted={third.playerId === highlightedPlayerId} onPress={onPressEntry} />
      ) : (
        <View style={styles.spacer} />
      )}
    </View>
  );
}

function Place({
  entry,
  place,
  highlighted,
  onPress,
}: {
  entry: PodiumEntry;
  place: 1 | 2 | 3;
  highlighted: boolean;
  onPress?: (playerId: string) => void;
}) {
  const { tone, height, avatarSize, medal } = PLACE_STYLE[place];
  return (
    <Pressable
      onPress={onPress ? () => onPress(entry.playerId) : undefined}
      style={[styles.place, highlighted && styles.placeHighlighted]}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={`${entry.name}, rank ${place}, ${entry.valueLabel}`}
    >
      <Text style={styles.medal}>{medal}</Text>
      <Avatar uri={entry.avatarUrl} name={entry.name} color={entry.color} size={avatarSize} />
      <Text style={styles.name} numberOfLines={1}>
        {entry.name}
      </Text>
      <Text style={[styles.value, { color: tone }]} numberOfLines={1}>
        {entry.valueLabel}
      </Text>
      <View style={[styles.stand, { height, backgroundColor: `${tone}26`, borderColor: tone }]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
  },
  place: {
    flex: 1,
    alignItems: "center",
    gap: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "transparent",
    padding: spacing.xs,
  },
  placeHighlighted: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSubtle,
  },
  spacer: {
    flex: 1,
  },
  medal: {
    fontSize: 20,
  },
  name: {
    ...typography.caption,
    maxWidth: "100%",
  },
  value: {
    ...typography.bodyStrong,
  },
  stand: {
    width: "100%",
    borderRadius: radius.sm,
    borderWidth: 1,
    marginTop: spacing.xs,
  },
});
