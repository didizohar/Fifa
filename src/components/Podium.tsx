import { Pressable, StyleSheet, Text, View } from "react-native";
import { getTopRankTone } from "../lib/rankTone";
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

// A wider spread top-to-bottom (was 88/68/52, avatars 56/48/48) so the
// podium reads as three distinct steps at a glance instead of three
// similar-height blocks -- 2nd and 3rd now also differ in avatar size, not
// just stand height and tone. Tone/background itself comes from
// getTopRankTone (shared with RankingRow/League Table) so the gold/silver/
// bronze treatment can't drift between screens.
const PLACE_STYLE = {
  1: { height: 104, avatarSize: 60 },
  2: { height: 72, avatarSize: 50 },
  3: { height: 44, avatarSize: 42 },
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
  const { height, avatarSize } = PLACE_STYLE[place];
  const rankTone = getTopRankTone(place)!;
  return (
    <Pressable
      onPress={onPress ? () => onPress(entry.playerId) : undefined}
      style={[styles.place, highlighted && styles.placeHighlighted]}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={`${entry.name}, rank ${place}, ${entry.valueLabel}`}
    >
      <Text style={[styles.rankBadge, { color: rankTone.color, backgroundColor: rankTone.background }]}>{place}</Text>
      <Avatar uri={entry.avatarUrl} name={entry.name} color={entry.color} size={avatarSize} />
      <Text style={styles.name} numberOfLines={1}>
        {entry.name}
      </Text>
      <Text style={[styles.value, { color: rankTone.color }]} numberOfLines={1}>
        {entry.valueLabel}
      </Text>
      <View style={[styles.stand, { height, backgroundColor: `${rankTone.color}26`, borderColor: rankTone.color }]} />
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
  rankBadge: {
    ...typography.bodyStrong,
    fontWeight: "800",
    width: 26,
    height: 26,
    lineHeight: 26,
    textAlign: "center",
    borderRadius: radius.pill,
    overflow: "hidden",
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
