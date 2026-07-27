import { FlatList, StyleSheet, Text, View } from "react-native";
import type { ClubUsageStat } from "../lib/analytics/types";
import { colors, radius, spacing, typography } from "../theme";
import { BarChart } from "./BarChart";

interface ClubUsageListProps {
  clubs: ClubUsageStat[];
  emptyMessage: string;
  playedLabel: string;
  goalsLabel: string;
}

/** Compact ranked bar chart up top (reusing BarChart), full per-club detail below -- handles clubs no longer in the current club list fine, since it only ever reads the name/id recorded on the match itself. */
export function ClubUsageList({ clubs, emptyMessage, playedLabel, goalsLabel }: ClubUsageListProps) {
  if (clubs.length === 0) {
    return <Text style={styles.empty}>{emptyMessage}</Text>;
  }

  return (
    <View style={styles.container}>
      <BarChart
        rows={clubs.slice(0, 6).map((c) => ({
          label: c.clubName,
          value: c.matchesPlayed,
          valueLabel: c.winRate !== null ? `${Math.round(c.winRate * 100)}%` : "–",
        }))}
      />

      <FlatList
        data={clubs}
        keyExtractor={(item) => item.clubId}
        scrollEnabled={false}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => <ClubRow club={item} playedLabel={playedLabel} goalsLabel={goalsLabel} />}
      />
    </View>
  );
}

function ClubRow({ club, playedLabel, goalsLabel }: { club: ClubUsageStat; playedLabel: string; goalsLabel: string }) {
  const winRatePct = club.winRate !== null ? Math.round(club.winRate * 100) : null;

  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={`${club.clubName}, ${club.matchesPlayed} ${playedLabel}, ${winRatePct ?? 0}%, ${club.goalsFor} ${goalsLabel} ${club.goalsAgainst}`}
    >
      <Text style={styles.name} numberOfLines={1}>
        {club.clubName}
      </Text>
      <View style={styles.metrics}>
        <Text style={styles.played}>
          {club.matchesPlayed} {playedLabel}
        </Text>
        <Text style={styles.goals}>
          {goalsLabel} {club.goalsFor}-{club.goalsAgainst}
        </Text>
      </View>
      <Text style={styles.winRate}>{winRatePct !== null ? `${winRatePct}%` : "–"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.lg,
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
  name: {
    ...typography.bodyStrong,
    flex: 1,
  },
  metrics: {
    alignItems: "flex-end",
    gap: 2,
  },
  played: {
    ...typography.small,
  },
  goals: {
    ...typography.small,
  },
  winRate: {
    ...typography.bodyStrong,
    color: colors.accent,
    minWidth: 44,
    textAlign: "right",
  },
  empty: {
    ...typography.caption,
  },
});
