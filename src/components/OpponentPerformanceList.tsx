import { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import type { OpponentPerformance } from "../lib/analytics/types";
import { useTranslation } from "../lib/i18n";
import { OPPONENT_SORT_MODES, sortOpponentPerformance, type OpponentSortMode } from "../lib/playerAnalyticsView";
import { colors, radius, spacing, typography } from "../theme";
import { SegmentedControl } from "./SegmentedControl";

interface OpponentPerformanceListProps {
  opponents: OpponentPerformance[];
  emptyMessage: string;
  /** Opens the existing head-to-head view for the tapped opponent, if the caller wired one up. */
  onSelectOpponent?: (opponentId: string) => void;
}

const SORT_LABEL_KEYS: Record<OpponentSortMode, string> = {
  mostPlayed: "playerAnalytics.sortMostPlayed",
  bestWinRate: "playerAnalytics.sortBestWinRate",
  worstMatchup: "playerAnalytics.sortWorstMatchup",
  goalDifference: "playerAnalytics.sortGoalDifference",
};

export function OpponentPerformanceList({ opponents, emptyMessage, onSelectOpponent }: OpponentPerformanceListProps) {
  const { t } = useTranslation();
  const [sortMode, setSortMode] = useState<OpponentSortMode>("mostPlayed");

  const sorted = useMemo(() => sortOpponentPerformance(opponents, sortMode), [opponents, sortMode]);
  const sortOptions = useMemo(() => OPPONENT_SORT_MODES.map((mode) => ({ value: mode, label: t(SORT_LABEL_KEYS[mode]) })), [t]);

  if (opponents.length === 0) {
    return <Text style={styles.empty}>{emptyMessage}</Text>;
  }

  return (
    <View style={styles.container}>
      <SegmentedControl options={sortOptions} value={sortMode} onChange={setSortMode} />
      <FlatList
        data={sorted}
        keyExtractor={(item) => item.opponentId}
        scrollEnabled={false}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => (
          <OpponentRow
            opponent={item}
            onPress={onSelectOpponent ? () => onSelectOpponent(item.opponentId) : undefined}
            winRateLabel={t("playerAnalytics.winRateShort")}
          />
        )}
      />
    </View>
  );
}

function OpponentRow({ opponent, onPress, winRateLabel }: { opponent: OpponentPerformance; onPress?: () => void; winRateLabel: string }) {
  const winRatePct = opponent.winRate !== null ? Math.round(opponent.winRate * 100) : null;
  const diffColor = opponent.goalDifference > 0 ? colors.win : opponent.goalDifference < 0 ? colors.loss : colors.textSecondary;
  const diffLabel = opponent.goalDifference > 0 ? `+${opponent.goalDifference}` : `${opponent.goalDifference}`;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={`${opponent.opponentName}, ${opponent.played} matches, ${opponent.wins}-${opponent.losses}-${opponent.draws}, ${winRatePct ?? 0}% ${winRateLabel}, ${diffLabel} goal difference`}
      style={({ pressed }) => [styles.row, pressed && onPress ? styles.rowPressed : null]}
    >
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {opponent.opponentName}
        </Text>
        <Text style={styles.detail}>
          {opponent.played} · {opponent.wins}-{opponent.losses}-{opponent.draws}
        </Text>
      </View>
      <View style={styles.metrics}>
        <Text style={styles.winRate}>{winRatePct !== null ? `${winRatePct}%` : "–"}</Text>
        <Text style={[styles.goalDiff, { color: diffColor }]}>{diffLabel}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  separator: {
    height: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surface,
  },
  rowPressed: {
    backgroundColor: colors.surfaceElevated,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  name: {
    ...typography.bodyStrong,
  },
  detail: {
    ...typography.small,
  },
  metrics: {
    alignItems: "flex-end",
    gap: 2,
  },
  winRate: {
    ...typography.bodyStrong,
    color: colors.accent,
  },
  goalDiff: {
    ...typography.small,
  },
  empty: {
    ...typography.caption,
  },
});
