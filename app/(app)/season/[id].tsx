import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Badge } from "../../../src/components/Badge";
import { Card } from "../../../src/components/Card";
import { EmptyState } from "../../../src/components/EmptyState";
import { ErrorState } from "../../../src/components/ErrorState";
import { Chip } from "../../../src/components/Chip";
import { InfoBanner } from "../../../src/components/InfoBanner";
import { MatchRow } from "../../../src/components/MatchRow";
import { Screen } from "../../../src/components/Screen";
import { SkeletonList } from "../../../src/components/Skeleton";
import { useGroup } from "../../../src/hooks/useGroup";
import { useSeasonReport } from "../../../src/hooks/useSeasonReport";
import { formatDateTime, formatRelativeDate, matchSideLabel } from "../../../src/lib/format";
import { useTranslation } from "../../../src/lib/i18n";
import { computeIndividualStandings, type LeagueStandingRow } from "../../../src/lib/leagueStandings";
import { DEFAULT_MATCH_FILTERS, filterMatches, type MatchFilters } from "../../../src/lib/matchFilters";
import { getTopRankTone } from "../../../src/lib/rankTone";
import { colors, radius, spacing, typography } from "../../../src/theme";

type SeasonTab = "overview" | "table" | "awards" | "statistics" | "clubs" | "matches";

export default function SeasonDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t, isRTL } = useTranslation();
  const { currentGroupId } = useGroup();
  const { season, roster, seasonMatches, report, isLoading, isError } = useSeasonReport(currentGroupId, id);
  const [tab, setTab] = useState<SeasonTab>("overview");
  const [matchQuery, setMatchQuery] = useState("");

  const standings = useMemo(() => computeIndividualStandings(roster, seasonMatches), [roster, seasonMatches]);

  const filteredMatches = useMemo(() => {
    const filters: MatchFilters = { ...DEFAULT_MATCH_FILTERS, search: matchQuery };
    return filterMatches(seasonMatches, filters);
  }, [seasonMatches, matchQuery]);

  if (isLoading) {
    return (
      <Screen avoidKeyboard>
        <SkeletonList count={5} height={64} />
      </Screen>
    );
  }

  if (isError || !season || !report) {
    return (
      <Screen avoidKeyboard>
        <ErrorState message={t("seasonHistory.noDataYet")} />
      </Screen>
    );
  }

  const { overview, awards, statistics, clubRankings } = report;

  return (
    <Screen padded={false} avoidKeyboard>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.title}>{season.name}</Text>
            {season.is_active ? <Badge label={t("seasonHistory.activeBadge")} tone="win" /> : null}
          </View>
          <Text style={styles.subtitle}>
            {formatDateTime(season.start_date)} – {season.end_date ? formatDateTime(season.end_date) : t("seasonHistory.ongoing")}
          </Text>
          {!season.is_active ? <InfoBanner tone="info" message={t("seasonHistory.frozenNotice")} /> : null}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow}>
          <Chip label={t("seasonHistory.tabOverview")} active={tab === "overview"} onPress={() => setTab("overview")} />
          <Chip label={t("seasonHistory.tabLeagueTable")} active={tab === "table"} onPress={() => setTab("table")} />
          <Chip label={t("seasonHistory.tabAwards")} active={tab === "awards"} onPress={() => setTab("awards")} />
          <Chip label={t("seasonHistory.tabStatistics")} active={tab === "statistics"} onPress={() => setTab("statistics")} />
          <Chip label={t("seasonHistory.tabClubs")} active={tab === "clubs"} onPress={() => setTab("clubs")} />
          <Chip label={t("seasonHistory.tabMatches")} active={tab === "matches"} onPress={() => setTab("matches")} />
        </ScrollView>

        <View style={styles.tabContent}>
          {tab === "overview" ? (
            <>
              <Card style={styles.statsCard}>
                <OverviewRow label={t("seasonHistory.championLabel")} value={overview.champion?.name ?? "–"} />
                <OverviewRow label={t("seasonHistory.runnerUp")} value={overview.runnerUp?.name ?? "–"} />
                <OverviewRow label={t("seasonHistory.thirdPlace")} value={overview.thirdPlace?.name ?? "–"} />
              </Card>
              <Card style={styles.statsCard}>
                <View style={styles.statGrid}>
                  <MiniStat label={t("seasonHistory.totalMatches")} value={String(overview.totalMatches)} />
                  <MiniStat label={t("seasonHistory.totalGoals")} value={String(overview.totalGoals)} />
                  <MiniStat label={t("seasonHistory.avgGoals")} value={overview.averageGoalsPerMatch !== null ? overview.averageGoalsPerMatch.toFixed(2) : "–"} />
                  <MiniStat label={t("seasonHistory.totalPlayers")} value={String(overview.totalPlayers)} />
                  <MiniStat label={t("seasonHistory.totalSessions")} value={String(overview.totalSessions)} />
                </View>
              </Card>
              <Card style={styles.statsCard}>
                <OverviewRow label={t("seasonHistory.longestMatchDay")} value={overview.longestMatchDay ? `${overview.longestMatchDay.dateLabel} (${overview.longestMatchDay.matchesPlayed})` : "–"} />
                <OverviewRow label={t("seasonHistory.highestScoringMatch")} value={overview.highestScoringMatch ? `${overview.highestScoringMatch.holderName} (${t(overview.highestScoringMatch.valueLabelKey, overview.highestScoringMatch.valueLabelParams)})` : "–"} />
                <OverviewRow label={t("seasonHistory.mostPlayedClub")} value={overview.mostPlayedClub ? `${overview.mostPlayedClub.clubName} (${overview.mostPlayedClub.matchesPlayed})` : "–"} />
              </Card>
            </>
          ) : null}

          {tab === "table" ? <SeasonLeagueTable rows={standings} t={t} /> : null}

          {tab === "awards" ? (
            <View style={styles.awardGrid}>
              <AwardCard icon="👑" title={t("seasonHistory.awardPlayerOfSeason")} winner={awards.playerOfTheSeason} noneLabel={t("seasonHistory.noAwardYet")} />
              <AwardCard icon="⚽" title={t("seasonHistory.awardGoldenBoot")} winner={awards.goldenBoot} noneLabel={t("seasonHistory.noAwardYet")} />
              <AwardCard icon="🧱" title={t("seasonHistory.awardBestDefense")} winner={awards.bestDefense} noneLabel={t("seasonHistory.noAwardYet")} />
              <AwardCard icon="📈" title={t("seasonHistory.awardBestWinRate")} winner={awards.bestWinRate} noneLabel={t("seasonHistory.noAwardYet")} />
              <AwardCard icon="🚀" title={t("seasonHistory.awardMostImproved")} winner={awards.mostImproved} noneLabel={t("seasonHistory.noAwardYet")} />
              <AwardCard icon="🎯" title={t("seasonHistory.awardMostConsistent")} winner={awards.mostConsistent} noneLabel={t("seasonHistory.noAwardYet")} />
              <AwardCard icon="🤝" title={t("seasonHistory.awardBestDuo")} winner={awards.bestDuo} noneLabel={t("seasonHistory.noAwardYet")} />
              <AwardCard icon="😲" title={t("seasonHistory.awardBiggestSurprise")} winner={awards.biggestSurprise} noneLabel={t("seasonHistory.noAwardYet")} />
              <AwardCard icon="🔥" title={t("seasonHistory.awardLongestWinStreak")} winner={awards.longestWinStreak} noneLabel={t("seasonHistory.noAwardYet")} />
              <AwardCard icon="❄️" title={t("seasonHistory.awardLongestLosingStreak")} winner={awards.longestLosingStreak} noneLabel={t("seasonHistory.noAwardYet")} />
            </View>
          ) : null}

          {tab === "statistics" ? (
            <>
              <StatsListCard title={t("seasonHistory.matchesOverTime")} rows={statistics.matchesOverTime.map((p) => ({ label: p.label, value: String(p.value) }))} />
              <StatsListCard title={t("seasonHistory.goalsOverTime")} rows={statistics.goalsOverTime.map((p) => ({ label: p.label, value: String(p.value) }))} />
              <Card style={styles.statsCard}>
                <Text style={styles.sectionTitle}>{t("seasonHistory.winRateTrend")}</Text>
                {statistics.winRateTrend.length === 0 ? (
                  <Text style={styles.emptyText}>{t("seasonHistory.noDataYet")}</Text>
                ) : (
                  statistics.winRateTrend.map((row) => (
                    <View key={row.playerId} style={styles.rankRow}>
                      <Text style={styles.rankName}>{row.playerName}</Text>
                      <Text style={[styles.rankValue, { textAlign: isRTL ? "left" : "right" }]}>
                        {row.timeline
                          .filter((p) => p.matchesInBucket > 0)
                          .map((p) => `${p.label}: ${Math.round(p.value * 100)}%`)
                          .join(" · ") || "–"}
                      </Text>
                    </View>
                  ))
                )}
              </Card>
              <StatsListCard title={t("seasonHistory.goalsPerPlayer")} rows={statistics.goalsPerPlayer.map((r) => ({ label: r.playerName, value: r.valueLabel }))} />
              <StatsListCard title={t("seasonHistory.clubRankings") + " (" + t("seasonHistory.tabClubs") + ")"} rows={statistics.clubUsage.map((c) => ({ label: c.clubName, value: String(c.matchesPlayed) }))} />
            </>
          ) : null}

          {tab === "clubs" ? (
            <>
              <StatsListCard title={t("seasonHistory.mostUsedClubs")} rows={clubRankings.mostUsed.slice(0, 10).map((c) => ({ label: c.clubName, value: `${c.matchesPlayed}` }))} />
              <StatsListCard title={t("seasonHistory.highestWinRateClubs")} rows={clubRankings.highestWinRate.slice(0, 10).map((c) => ({ label: c.clubName, value: c.winRate !== null ? `${Math.round(c.winRate * 100)}%` : "–" }))} />
              <StatsListCard title={t("seasonHistory.highestScoringClubs")} rows={clubRankings.highestScoring.slice(0, 10).map((c) => ({ label: c.clubName, value: `${c.goalsFor}` }))} />
              <Card style={styles.statsCard}>
                <Text style={styles.sectionTitle}>{t("seasonHistory.clubRankings")}</Text>
                {clubRankings.allClubs.length === 0 ? (
                  <Text style={styles.emptyText}>{t("seasonHistory.noDataYet")}</Text>
                ) : (
                  clubRankings.allClubs.map((c, i) => (
                    <View key={c.clubId} style={styles.rankRow}>
                      <Text style={styles.rankPosition}>{i + 1}</Text>
                      <Text style={styles.rankName} numberOfLines={1}>
                        {c.clubName}
                      </Text>
                      <Text style={[styles.rankValue, { textAlign: isRTL ? "left" : "right" }]}>
                        {c.matchesPlayed} · {c.winRate !== null ? `${Math.round(c.winRate * 100)}%` : "–"} · {c.goalsFor}⚽
                      </Text>
                    </View>
                  ))
                )}
              </Card>
            </>
          ) : null}

          {tab === "matches" ? (
            <View style={styles.matchesSection}>
              <TextInput
                value={matchQuery}
                onChangeText={setMatchQuery}
                placeholder={t("history.searchPlaceholder")}
                placeholderTextColor={colors.textMuted}
                style={styles.searchInput}
              />
              {filteredMatches.length === 0 ? (
                <EmptyState icon="🔍" title={t("seasonHistory.noDataYet")} />
              ) : (
                filteredMatches.map((match) => {
                  const [s1, s2] = match.sides;
                  return (
                    <MatchRow
                      key={match.id}
                      matchType={match.match_type}
                      isPenalties={match.is_penalties}
                      playedAtLabel={formatRelativeDate(match.played_at, t)}
                      side1={{ label: matchSideLabel(s1.players.map((p) => p.display_name)), clubName: s1.club?.name ?? t("history.unknownClub"), score: s1.score, result: s1.result }}
                      side2={{ label: matchSideLabel(s2.players.map((p) => p.display_name)), clubName: s2.club?.name ?? t("history.unknownClub"), score: s2.score, result: s2.result }}
                      onPress={() => router.push(`/match/${match.id}`)}
                    />
                  );
                })
              )}
            </View>
          ) : null}
        </View>
      </ScrollView>
    </Screen>
  );
}

function OverviewRow({ label, value }: { label: string; value: string }) {
  const { isRTL } = useTranslation();
  return (
    <View style={styles.overviewRow}>
      <Text style={styles.overviewLabel}>{label}</Text>
      <Text style={[styles.overviewValue, { textAlign: isRTL ? "left" : "right" }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.miniStat}>
      <Text style={styles.miniStatValue}>{value}</Text>
      <Text style={styles.miniStatLabel}>{label}</Text>
    </View>
  );
}

function AwardCard({
  icon,
  title,
  winner,
  noneLabel,
}: {
  icon: string;
  title: string;
  winner: { playerName: string; valueLabelKey: string; valueLabelParams: Record<string, string | number>; detailKey: string; detailParams: Record<string, string | number> } | null;
  noneLabel: string;
}) {
  const { t } = useTranslation();
  return (
    <Card style={styles.awardCard} compact>
      <Text style={styles.awardIcon}>{icon}</Text>
      <Text style={styles.awardTitle}>{title}</Text>
      {winner ? (
        <>
          <Text style={styles.awardWinner} numberOfLines={1}>
            {winner.playerName}
          </Text>
          <Text style={styles.awardDetail} numberOfLines={2}>
            {t(winner.valueLabelKey, winner.valueLabelParams)} · {t(winner.detailKey, winner.detailParams)}
          </Text>
        </>
      ) : (
        <Text style={styles.awardEmpty}>{noneLabel}</Text>
      )}
    </Card>
  );
}

function StatsListCard({ title, rows }: { title: string; rows: { label: string; value: string }[] }) {
  const { t, isRTL } = useTranslation();
  return (
    <Card style={styles.statsCard}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {rows.length === 0 ? (
        <Text style={styles.emptyText}>{t("seasonHistory.noDataYet")}</Text>
      ) : (
        rows.slice(0, 12).map((row, i) => (
          <View key={`${row.label}-${i}`} style={styles.rankRow}>
            <Text style={styles.rankName} numberOfLines={1}>
              {row.label}
            </Text>
            <Text style={[styles.rankValue, { textAlign: isRTL ? "left" : "right" }]}>{row.value}</Text>
          </View>
        ))
      )}
    </Card>
  );
}

function SeasonLeagueTable({ rows, t }: { rows: LeagueStandingRow[]; t: (key: string) => string }) {
  if (rows.length === 0) {
    return (
      <Card style={styles.statsCard}>
        <Text style={styles.emptyText}>{t("seasonHistory.noDataYet")}</Text>
      </Card>
    );
  }

  return (
    <View style={styles.tableRow}>
      <View style={styles.stickyColumn}>
        <View style={styles.tableHeaderRow}>
          <Text style={[styles.tableHeaderCell, styles.posCell]}>{t("leagueTable.colPosition")}</Text>
          <Text style={[styles.tableHeaderCell, styles.nameCell]}>{t("leagueTable.colPlayer")}</Text>
        </View>
        {rows.map((row, index) => {
          const topTone = getTopRankTone(index + 1);
          return (
            <View key={row.id} style={styles.stickyRow}>
              <Text style={[styles.tableCellText, styles.posCell, topTone && [styles.posCellTop, { color: topTone.color, backgroundColor: topTone.background }]]}>
                {index + 1}
              </Text>
              <Text style={[styles.tableCellText, styles.nameCell]} numberOfLines={1}>
                {row.name}
              </Text>
            </View>
          );
        })}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.tableHeaderCell, styles.numCell]}>{t("leagueTable.colPlayed")}</Text>
            <Text style={[styles.tableHeaderCell, styles.numCell]}>{t("leagueTable.colWins")}</Text>
            <Text style={[styles.tableHeaderCell, styles.numCell]}>{t("leagueTable.colDraws")}</Text>
            <Text style={[styles.tableHeaderCell, styles.numCell]}>{t("leagueTable.colLosses")}</Text>
            <Text style={[styles.tableHeaderCell, styles.numCell]}>{t("leagueTable.colGoalsFor")}</Text>
            <Text style={[styles.tableHeaderCell, styles.numCell]}>{t("leagueTable.colGoalsAgainst")}</Text>
            <Text style={[styles.tableHeaderCell, styles.numCell]}>{t("leagueTable.colGoalDifference")}</Text>
            <Text style={[styles.tableHeaderCell, styles.ptsCell]}>{t("leagueTable.colPoints")}</Text>
          </View>
          {rows.map((row) => (
            <View key={row.id} style={styles.tableDataRow}>
              <Text style={[styles.tableCellText, styles.numCell]}>{row.played}</Text>
              <Text style={[styles.tableCellText, styles.numCell]}>{row.wins}</Text>
              <Text style={[styles.tableCellText, styles.numCell]}>{row.draws}</Text>
              <Text style={[styles.tableCellText, styles.numCell]}>{row.losses}</Text>
              <Text style={[styles.tableCellText, styles.numCell]}>{row.goalsFor}</Text>
              <Text style={[styles.tableCellText, styles.numCell]}>{row.goalsAgainst}</Text>
              <Text style={[styles.tableCellText, styles.numCell]}>{row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}</Text>
              <Text style={[styles.tableCellText, styles.ptsCell, styles.ptsText]}>{row.points}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
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
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  title: {
    ...typography.title,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  tabRow: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  tabContent: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  statsCard: {
    gap: spacing.sm,
  },
  overviewRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.xs,
  },
  overviewLabel: {
    ...typography.body,
    color: colors.textSecondary,
  },
  overviewValue: {
    ...typography.bodyStrong,
    flexShrink: 1,
  },
  statGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  miniStat: {
    minWidth: 84,
    flex: 1,
    alignItems: "center",
    borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
    paddingVertical: spacing.sm,
  },
  miniStatValue: {
    ...typography.bodyStrong,
    color: colors.accent,
  },
  miniStatLabel: {
    ...typography.small,
    color: colors.textSecondary,
  },
  sectionTitle: {
    ...typography.bodyStrong,
  },
  emptyText: {
    ...typography.small,
    color: colors.textSecondary,
  },
  rankRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    gap: spacing.sm,
  },
  rankPosition: {
    ...typography.caption,
    color: colors.textSecondary,
    width: 20,
  },
  rankName: {
    ...typography.body,
    flex: 1,
  },
  rankValue: {
    ...typography.small,
    color: colors.textSecondary,
  },
  awardGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  awardCard: {
    flexBasis: "47%",
    flexGrow: 1,
    gap: 2,
  },
  awardIcon: {
    fontSize: 20,
  },
  awardTitle: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: "700",
  },
  awardWinner: {
    ...typography.bodyStrong,
  },
  awardDetail: {
    ...typography.small,
    color: colors.textSecondary,
  },
  awardEmpty: {
    ...typography.small,
    color: colors.textMuted,
  },
  matchesSection: {
    gap: spacing.sm,
  },
  searchInput: {
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    color: colors.textPrimary,
  },
  tableRow: {
    flexDirection: "row",
  },
  stickyColumn: {
    borderEndWidth: 1,
    borderEndColor: colors.borderSubtle,
  },
  tableHeaderRow: {
    flexDirection: "row",
    height: 40,
    alignItems: "center",
  },
  tableHeaderCell: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: "700",
    textAlign: "center",
  },
  stickyRow: {
    flexDirection: "row",
    height: 40,
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  tableDataRow: {
    flexDirection: "row",
    height: 40,
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  tableCellText: {
    ...typography.body,
    textAlign: "center",
  },
  posCell: {
    width: 32,
    textAlign: "center",
  },
  posCellTop: {
    fontWeight: "800",
    width: 24,
    height: 24,
    lineHeight: 24,
    alignSelf: "center",
    borderRadius: radius.pill,
    overflow: "hidden",
  },
  nameCell: {
    width: 110,
    textAlign: "auto",
    paddingStart: spacing.sm,
  },
  numCell: {
    width: 44,
  },
  ptsCell: {
    width: 52,
  },
  ptsText: {
    ...typography.bodyStrong,
    color: colors.accent,
  },
});
