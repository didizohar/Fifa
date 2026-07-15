import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../theme";

interface MatchRowSide {
  label: string;
  clubName: string;
  score: number;
  result: "win" | "loss" | "draw";
}

interface MatchRowProps {
  matchType: "singles" | "doubles";
  isPenalties: boolean;
  side1: MatchRowSide;
  side2: MatchRowSide;
  playedAtLabel: string;
  onPress?: () => void;
}

const resultColor = { win: colors.win, loss: colors.loss, draw: colors.draw };

export function MatchRow({ matchType, isPenalties, side1, side2, playedAtLabel, onPress }: MatchRowProps) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.header}>
        <Text style={styles.badge}>{matchType === "singles" ? "1v1" : "2v2"}</Text>
        {isPenalties ? <Text style={styles.badge}>PENS</Text> : null}
        <Text style={styles.date}>{playedAtLabel}</Text>
      </View>
      <SideRow side={side1} />
      <SideRow side={side2} />
    </Pressable>
  );
}

function SideRow({ side }: { side: MatchRowSide }) {
  return (
    <View style={styles.sideRow}>
      <View style={[styles.resultDot, { backgroundColor: resultColor[side.result] }]} />
      <View style={styles.sideInfo}>
        <Text style={styles.sideLabel} numberOfLines={1}>{side.label}</Text>
        <Text style={styles.clubName} numberOfLines={1}>{side.clubName}</Text>
      </View>
      <Text style={[styles.score, { color: resultColor[side.result] }]}>{side.score}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing.md,
    gap: spacing.sm,
  },
  pressed: {
    opacity: 0.8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  badge: {
    ...typography.small,
    color: colors.accent,
    backgroundColor: colors.accentSubtle,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    overflow: "hidden",
  },
  date: {
    ...typography.small,
    marginLeft: "auto",
  },
  sideRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  resultDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  sideInfo: {
    flex: 1,
  },
  sideLabel: {
    ...typography.bodyStrong,
  },
  clubName: {
    ...typography.small,
  },
  score: {
    ...typography.heading,
    minWidth: 24,
    textAlign: "right",
  },
});
