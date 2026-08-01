import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { EmptyState } from "../../src/components/EmptyState";
import { FilterChip } from "../../src/components/FilterChip";
import { InfoTooltip } from "../../src/components/InfoTooltip";
import { Screen } from "../../src/components/Screen";
import { SegmentedControl } from "../../src/components/SegmentedControl";
import { SkeletonList } from "../../src/components/Skeleton";
import { TextField } from "../../src/components/TextField";
import { useAuth } from "../../src/hooks/useAuth";
import { useGroup } from "../../src/hooks/useGroup";
import { useGroupMatchHistory } from "../../src/hooks/useMatches";
import { usePlayers } from "../../src/hooks/usePlayers";
import { useSeasons } from "../../src/hooks/useSeasons";
import { useTranslation } from "../../src/lib/i18n";
import {
  computeIndividualStandings,
  computePairStandings,
  filterMatchesForStandings,
  sortStandingsByMetric,
  type LeagueStandingRow,
  type StandingsDateFilter,
  type StandingsSortMetric,
} from "../../src/lib/leagueStandings";
import { colors, radius, spacing, typography } from "../../src/theme";

type FilterMode = "all" | "currentMonth" | "previousMonth" | "custom" | "activeSeason";
type TableMode = "individual" | "pairs";

const ROW_HEIGHT = 44;
const MEDALS = ["🥇", "🥈", "🥉"] as const;

export default function LeagueTableScreen() {
  const { t } = useTranslation();
  const { currentGroup, currentGroupId } = useGroup();
  const { user } = useAuth();
  const players = usePlayers(currentGroupId);
  const matchHistory = useGroupMatchHistory(currentGroupId);
  const seasonsQuery = useSeasons(currentGroupId);
  const activeSeason = (seasonsQuery.data ?? []).find((s) => s.is_active) ?? null;

  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [tableMode, setTableMode] = useState<TableMode>("individual");
  const [sortMode, setSortMode] = useState<StandingsSortMetric>("points");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [customError, setCustomError] = useState<string | null>(null);
  const [appliedCustomRange, setAppliedCustomRange] = useState<{ start: Date; end: Date } | null>(null);

  const roster = players.data ?? [];
  const allMatches = matchHistory.data ?? [];
  const hasDoubles = useMemo(() => allMatches.some((m) => m.match_type === "doubles"), [allMatches]);
  const myPlayerId = useMemo(() => roster.find((p) => p.linked_user_id === user?.id)?.id ?? null, [roster, user?.id]);

  const standingsFilter: StandingsDateFilter = useMemo(() => {
    if (filterMode === "activeSeason" && activeSeason) {
      return { type: "custom", start: new Date(activeSeason.start_date), end: activeSeason.end_date ? new Date(activeSeason.end_date) : new Date() };
    }
    if (filterMode === "custom" && appliedCustomRange) return { type: "custom", start: appliedCustomRange.start, end: appliedCustomRange.end };
    if (filterMode === "custom" || filterMode === "activeSeason") return { type: "all" };
    return { type: filterMode };
  }, [filterMode, appliedCustomRange, activeSeason]);

  const filteredMatches = useMemo(() => filterMatchesForStandings(allMatches, standingsFilter), [allMatches, standingsFilter]);

  const baseRows: LeagueStandingRow[] = useMemo(
    () => (tableMode === "individual" ? computeIndividualStandings(roster, filteredMatches) : computePairStandings(filteredMatches)),
    [tableMode, roster, filteredMatches],
  );
  const rows = useMemo(() => sortStandingsByMetric(baseRows, sortMode), [baseRows, sortMode]);

  const handleApplyCustomRange = () => {
    const start = new Date(customStart);
    const end = new Date(customEnd);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start.getTime() > end.getTime()) {
      setCustomError(t("leagueTable.invalidCustomRange"));
      return;
    }
    setCustomError(null);
    setAppliedCustomRange({ start, end: new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999) });
  };

  const isLoading = players.isLoading || matchHistory.isLoading;

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{t("leagueTable.title")}</Text>
          <InfoTooltip
            title={t("leagueTable.title")}
            howCalculated={t("leagueTable.infoHowCalculated")}
            matchesIncluded={t("leagueTable.infoMatchesIncluded")}
            whenUpdates={t("leagueTable.infoTiebreakers")}
            whyUseful={t("leagueTable.infoActiveSeason")}
          />
        </View>
        {currentGroup ? <Text style={styles.subtitle}>{t("leagueTable.subtitle", { name: currentGroup.name })}</Text> : null}
      </View>

      <View style={styles.filterRow}>
        <FilterChip label={t("leagueTable.filterAllTime")} active={filterMode === "all"} onPress={() => setFilterMode("all")} />
        <FilterChip label={t("leagueTable.filterCurrentMonth")} active={filterMode === "currentMonth"} onPress={() => setFilterMode("currentMonth")} />
        <FilterChip label={t("leagueTable.filterPreviousMonth")} active={filterMode === "previousMonth"} onPress={() => setFilterMode("previousMonth")} />
        <FilterChip label={t("leagueTable.filterCustom")} active={filterMode === "custom"} onPress={() => setFilterMode("custom")} />
        {activeSeason ? (
          <FilterChip label={t("leagueTable.filterActiveSeason", { name: activeSeason.name })} active={filterMode === "activeSeason"} onPress={() => setFilterMode("activeSeason")} />
        ) : null}
      </View>

      {filterMode === "custom" ? (
        <View style={styles.customRow}>
          <View style={styles.customField}>
            <TextField label={t("leagueTable.customRangeStart")} placeholder="2026-03-01" value={customStart} onChangeText={setCustomStart} keyboardType="numbers-and-punctuation" />
          </View>
          <View style={styles.customField}>
            <TextField label={t("leagueTable.customRangeEnd")} placeholder="2026-03-31" value={customEnd} onChangeText={setCustomEnd} keyboardType="numbers-and-punctuation" />
          </View>
          <Text style={styles.applyLink} onPress={handleApplyCustomRange}>
            {t("leagueTable.applyCustomRange")}
          </Text>
        </View>
      ) : null}
      {customError ? <Text style={styles.errorText}>{customError}</Text> : null}

      {hasDoubles ? (
        <View style={styles.tabsRow}>
          <SegmentedControl
            options={[
              { value: "individual" as const, label: t("leagueTable.individualTab") },
              { value: "pairs" as const, label: t("leagueTable.pairsTab") },
            ]}
            value={tableMode}
            onChange={setTableMode}
          />
        </View>
      ) : null}

      <View style={styles.filterRow}>
        <FilterChip label={t("leagueTable.sortPoints")} active={sortMode === "points"} onPress={() => setSortMode("points")} />
        <FilterChip label={t("leagueTable.sortWins")} active={sortMode === "wins"} onPress={() => setSortMode("wins")} />
        <FilterChip label={t("leagueTable.sortGoals")} active={sortMode === "goals"} onPress={() => setSortMode("goals")} />
        <FilterChip label={t("leagueTable.sortGoalDifference")} active={sortMode === "goalDifference"} onPress={() => setSortMode("goalDifference")} />
        <FilterChip label={t("leagueTable.sortWinRate")} active={sortMode === "winRate"} onPress={() => setSortMode("winRate")} />
      </View>

      {isLoading ? (
        <View style={styles.listPadding}>
          <SkeletonList count={6} height={ROW_HEIGHT} />
        </View>
      ) : rows.length === 0 ? (
        <EmptyState icon="🏆" title={t("leagueTable.emptyTitle")} message={t("leagueTable.emptyMessage")} />
      ) : (
        <View style={styles.tableRow}>
          <View style={styles.stickyColumn}>
            <View style={styles.headerCellRow}>
              <Text style={[styles.headerCell, styles.posCell]}>{t("leagueTable.colPosition")}</Text>
              <Text style={[styles.headerCell, styles.nameCell]}>{tableMode === "individual" ? t("leagueTable.colPlayer") : t("leagueTable.colPair")}</Text>
            </View>
            {rows.map((row, index) => {
              const isMe = myPlayerId !== null && row.playerIds.includes(myPlayerId);
              const medal = sortMode === "points" && index < MEDALS.length ? MEDALS[index] : null;
              return (
                <View key={row.id} style={[styles.stickyRow, isMe && styles.myRow]}>
                  <Text style={[styles.cellText, styles.posCell]}>{medal ?? index + 1}</Text>
                  <Text style={[styles.cellText, styles.nameCell, isMe && styles.myRowText]} numberOfLines={1}>
                    {row.name}
                  </Text>
                </View>
              );
            })}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View>
              <View style={styles.headerCellRow}>
                <Text style={[styles.headerCell, styles.numCell]}>{t("leagueTable.colPlayed")}</Text>
                <Text style={[styles.headerCell, styles.numCell]}>{t("leagueTable.colWins")}</Text>
                <Text style={[styles.headerCell, styles.numCell]}>{t("leagueTable.colDraws")}</Text>
                <Text style={[styles.headerCell, styles.numCell]}>{t("leagueTable.colLosses")}</Text>
                <Text style={[styles.headerCell, styles.numCell]}>{t("leagueTable.colGoalsFor")}</Text>
                <Text style={[styles.headerCell, styles.numCell]}>{t("leagueTable.colGoalsAgainst")}</Text>
                <Text style={[styles.headerCell, styles.numCell]}>{t("leagueTable.colGoalDifference")}</Text>
                <Text style={[styles.headerCell, styles.ptsCell]}>{t("leagueTable.colPoints")}</Text>
              </View>
              {rows.map((row) => {
                const isMe = myPlayerId !== null && row.playerIds.includes(myPlayerId);
                return (
                  <View key={row.id} style={[styles.dataRow, isMe && styles.myRow]}>
                    <Text style={[styles.cellText, styles.numCell]}>{row.played}</Text>
                    <Text style={[styles.cellText, styles.numCell]}>{row.wins}</Text>
                    <Text style={[styles.cellText, styles.numCell]}>{row.draws}</Text>
                    <Text style={[styles.cellText, styles.numCell]}>{row.losses}</Text>
                    <Text style={[styles.cellText, styles.numCell]}>{row.goalsFor}</Text>
                    <Text style={[styles.cellText, styles.numCell]}>{row.goalsAgainst}</Text>
                    <Text style={[styles.cellText, styles.numCell]}>{row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}</Text>
                    <Text style={[styles.cellText, styles.ptsCell, styles.ptsText]}>{row.points}</Text>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.xs,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  title: {
    ...typography.title,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  customRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  customField: {
    flex: 1,
  },
  applyLink: {
    ...typography.bodyStrong,
    color: colors.accent,
    paddingBottom: spacing.sm,
  },
  errorText: {
    ...typography.small,
    color: colors.danger,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  tabsRow: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  listPadding: {
    paddingHorizontal: spacing.lg,
  },
  tableRow: {
    flexDirection: "row",
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  stickyColumn: {
    borderEndWidth: 1,
    borderEndColor: colors.borderSubtle,
  },
  headerCellRow: {
    flexDirection: "row",
    height: ROW_HEIGHT,
    alignItems: "center",
  },
  headerCell: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: "700",
    textAlign: "center",
  },
  stickyRow: {
    flexDirection: "row",
    height: ROW_HEIGHT,
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  dataRow: {
    flexDirection: "row",
    height: ROW_HEIGHT,
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  myRow: {
    backgroundColor: colors.accentSubtle,
  },
  myRowText: {
    fontWeight: "700",
    color: colors.accent,
  },
  cellText: {
    ...typography.body,
    textAlign: "center",
  },
  posCell: {
    width: 26,
    textAlign: "center",
  },
  nameCell: {
    width: 120,
    textAlign: "auto",
    paddingStart: spacing.xs,
  },
  numCell: {
    width: 48,
  },
  ptsCell: {
    width: 56,
  },
  ptsText: {
    ...typography.bodyStrong,
    color: colors.accent,
  },
});
