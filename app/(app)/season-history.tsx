import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Badge } from "../../src/components/Badge";
import { Card } from "../../src/components/Card";
import { EmptyState } from "../../src/components/EmptyState";
import { ErrorState } from "../../src/components/ErrorState";
import { Screen } from "../../src/components/Screen";
import { SkeletonList } from "../../src/components/Skeleton";
import { useGroup } from "../../src/hooks/useGroup";
import { useSeasonHistoryList } from "../../src/hooks/useSeasonReport";
import { formatDateTime } from "../../src/lib/format";
import { useTranslation } from "../../src/lib/i18n";
import { colors, radius, spacing, typography } from "../../src/theme";

export default function SeasonHistoryScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { currentGroupId } = useGroup();
  const { summaries, isLoading, isError } = useSeasonHistoryList(currentGroupId);

  // Active season pinned first, then every other season newest-started-first
  // (useSeasonHistoryList/useSeasons already return seasons newest-first).
  const ordered = [...summaries].sort((a, b) => {
    if (a.season.is_active !== b.season.is_active) return a.season.is_active ? -1 : 1;
    return new Date(b.season.start_date).getTime() - new Date(a.season.start_date).getTime();
  });

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>{t("seasonHistory.title")}</Text>
          <Text style={styles.subtitle}>{t("seasonHistory.subtitle")}</Text>
        </View>

        {isLoading ? (
          <View style={styles.listPadding}>
            <SkeletonList count={3} height={160} />
          </View>
        ) : isError ? (
          <View style={styles.listPadding}>
            <ErrorState />
          </View>
        ) : ordered.length === 0 ? (
          <View style={styles.listPadding}>
            <EmptyState icon="🏆" title={t("seasonHistory.emptyTitle")} message={t("seasonHistory.emptyMessage")} />
          </View>
        ) : (
          <View style={styles.listPadding}>
            {ordered.map((summary) => (
              <Card key={summary.season.id} style={styles.seasonCard} compact>
                <Pressable
                  style={styles.pressableCard}
                  onPress={() => router.push(`/season/${summary.season.id}`)}
                  accessibilityRole="button"
                  accessibilityLabel={summary.season.name}
                >
                  <View style={styles.cardTitleRow}>
                    <Text style={styles.seasonName}>{summary.season.name}</Text>
                    {summary.season.is_active ? <Badge label={t("seasonHistory.activeBadge")} tone="win" /> : null}
                  </View>

                  <Text style={styles.champion}>
                    {summary.championName ? t("seasonHistory.champion", { name: summary.championName }) : t("seasonHistory.noChampionYet")}
                  </Text>

                  <Text style={styles.dateRange}>
                    {formatDateTime(summary.season.start_date)} – {summary.season.end_date ? formatDateTime(summary.season.end_date) : t("seasonHistory.ongoing")}
                  </Text>

                  <View style={styles.statGrid}>
                    <SeasonStat label={t("seasonHistory.totalMatches")} value={String(summary.totalMatches)} />
                    <SeasonStat label={t("seasonHistory.totalGoals")} value={String(summary.totalGoals)} />
                    <SeasonStat label={t("seasonHistory.totalPlayers")} value={String(summary.totalPlayers)} />
                    <SeasonStat label={t("seasonHistory.totalSessions")} value={String(summary.totalSessions)} />
                    <SeasonStat label={t("seasonHistory.avgGoals")} value={summary.averageGoalsPerMatch !== null ? summary.averageGoalsPerMatch.toFixed(1) : "–"} />
                  </View>
                </Pressable>
              </Card>
            ))}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

function SeasonStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCell}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing.xxl,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.xs,
  },
  title: {
    ...typography.title,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  listPadding: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  seasonCard: {
    marginBottom: spacing.md,
  },
  pressableCard: {
    gap: spacing.xs,
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  seasonName: {
    ...typography.heading,
  },
  champion: {
    ...typography.bodyStrong,
    color: colors.accent,
  },
  dateRange: {
    ...typography.small,
    color: colors.textSecondary,
  },
  statGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  statCell: {
    minWidth: 84,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    alignItems: "center",
  },
  statValue: {
    ...typography.bodyStrong,
    color: colors.accent,
  },
  statLabel: {
    ...typography.small,
    color: colors.textSecondary,
    textAlign: "center",
  },
});
