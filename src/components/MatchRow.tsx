import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, shadows, spacing, typography } from "../theme";
import { Avatar } from "./Avatar";
import { Badge, type BadgeTone } from "./Badge";

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

const RESULT_COLOR = { win: colors.win, loss: colors.loss, draw: colors.draw };
const RESULT_LABEL = { win: "W", loss: "L", draw: "D" };
const RESULT_TONE: Record<MatchRowSide["result"], BadgeTone> = { win: "win", loss: "loss", draw: "draw" };

export function MatchRow({ matchType, isPenalties, side1, side2, playedAtLabel, onPress }: MatchRowProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={`${side1.label}, ${side1.score}, ${side1.result} against ${side2.label}, ${side2.score}, ${playedAtLabel}`}
    >
      <View style={styles.header}>
        <Badge label={matchType === "singles" ? "1v1" : "2v2"} tone="accent" />
        {isPenalties ? <Badge label="PENS" tone="warning" /> : null}
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
      <Avatar name={side.clubName} size={28} />
      <View style={styles.sideInfo}>
        <Text style={[styles.sideLabel, side.result !== "win" && styles.sideLabelMuted]} numberOfLines={1}>
          {side.label}
        </Text>
        <Text style={styles.clubName} numberOfLines={1}>
          {side.clubName}
        </Text>
      </View>
      <Badge label={RESULT_LABEL[side.result]} tone={RESULT_TONE[side.result]} />
      <Text style={[styles.score, { color: RESULT_COLOR[side.result] }, side.result === "win" && styles.scoreWin]}>{side.score}</Text>
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
    ...shadows.sm,
  },
  pressed: {
    opacity: 0.8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  date: {
    ...typography.small,
    marginStart: "auto",
  },
  sideRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  sideInfo: {
    flex: 1,
    gap: 2,
  },
  sideLabel: {
    ...typography.bodyStrong,
  },
  sideLabelMuted: {
    color: colors.textSecondary,
  },
  clubName: {
    ...typography.small,
  },
  score: {
    ...typography.heading,
    minWidth: 26,
    textAlign: "right",
  },
  scoreWin: {
    fontSize: 20,
  },
});
