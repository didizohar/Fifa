import { useMemo, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import { computeIndividualStandings, filterMatchesForStandings } from "../lib/leagueStandings";
import { useTranslation } from "../lib/i18n";
import { matchesInSeasonWindow } from "../lib/seasonReport";
import type { MatchSummary } from "../lib/matches";
import type { PlayerProfile, Season } from "../lib/types/database";
import { colors, spacing, typography } from "../theme";
import { Button } from "./Button";
import { EmptyState } from "./EmptyState";
import { Chip } from "./Chip";
import { RankingRow } from "./RankingRow";

export type LeagueTableCardPeriod = "activeSeason" | "allTime" | "currentMonth";

const TOP_N = 5;

interface LeagueTableCardProps {
  groupName: string | null;
  roster: PlayerProfile[];
  allMatches: MatchSummary[];
  activeSeason: Season | null;
  myPlayerId: string | null;
  period: LeagueTableCardPeriod;
  onChangePeriod: (period: LeagueTableCardPeriod) => void;
  expanded: boolean;
  onToggleExpanded: () => void;
  onPressPlayer: (playerId: string) => void;
  onViewFullTable: () => void;
  onStartMatch: () => void;
}

/**
 * Home's compact League Table preview -- reuses the exact same standings
 * engine (computeIndividualStandings, same points/GD/goals/winRate/wins/
 * name tiebreak order) as the full League Table screen, just filtered to a
 * shorter period and truncated to Top 5 by default. No sorting/points math
 * is duplicated here.
 */
export function LeagueTableCard({
  groupName,
  roster,
  allMatches,
  activeSeason,
  myPlayerId,
  period,
  onChangePeriod,
  expanded,
  onToggleExpanded,
  onPressPlayer,
  onViewFullTable,
  onStartMatch,
}: LeagueTableCardProps) {
  const { t } = useTranslation();

  const filteredMatches = useMemo(() => {
    if (period === "activeSeason") {
      // Falls back to All Time when the group has no active season, per spec.
      return activeSeason ? matchesInSeasonWindow(allMatches, activeSeason) : allMatches;
    }
    if (period === "currentMonth") return filterMatchesForStandings(allMatches, { type: "currentMonth" });
    return allMatches;
  }, [period, activeSeason, allMatches]);

  const standings = useMemo(() => computeIndividualStandings(roster, filteredMatches), [roster, filteredMatches]);
  const lastUpdated = useMemo(() => new Date(), [allMatches]);

  // Compares this render's positions against the previous one (per group,
  // reset if the period changes) so RankingRow can show a movement arrow --
  // "animate ranking changes after new matches" without inventing a new
  // animation system: RankingRow already supports this via `movement`.
  const previousPositionsRef = useRef<Map<string, number>>(new Map());
  const previousPeriodRef = useRef(period);
  if (previousPeriodRef.current !== period) {
    previousPositionsRef.current = new Map();
    previousPeriodRef.current = period;
  }
  const movementByPlayerId = useMemo(() => {
    const previous = previousPositionsRef.current;
    const movements = new Map<string, number>();
    standings.forEach((row, index) => {
      const prevPosition = previous.get(row.id);
      if (prevPosition !== undefined) movements.set(row.id, prevPosition - (index + 1));
    });
    return movements;
  }, [standings]);
  useMemo(() => {
    previousPositionsRef.current = new Map(standings.map((row, index) => [row.id, index + 1]));
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [standings]);

  const visibleRows = expanded ? standings : standings.slice(0, TOP_N);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text style={styles.title}>{t("home.leagueTableCardTitle")}</Text>
          <Text style={styles.subtitle}>
            {groupName ?? ""}
            {activeSeason ? ` · ${activeSeason.name}` : ""} · {t("home.leagueTableCardUpdated", { time: lastUpdated.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) })}
          </Text>
        </View>
      </View>

      <View style={styles.periodRow}>
        <Chip label={t("home.leagueTableCardActiveSeason")} active={period === "activeSeason"} onPress={() => onChangePeriod("activeSeason")} />
        <Chip label={t("home.leagueTableCardAllTime")} active={period === "allTime"} onPress={() => onChangePeriod("allTime")} />
        <Chip label={t("home.leagueTableCardCurrentMonth")} active={period === "currentMonth"} onPress={() => onChangePeriod("currentMonth")} />
      </View>

      {standings.length === 0 ? (
        <EmptyState icon="🏆" title={t("home.leagueTableCardEmptyTitle")} message={t("home.leagueTableCardEmptyMessage")} actionLabel={t("home.leagueTableCardStartMatch")} onAction={onStartMatch} />
      ) : (
        <>
          <View style={styles.columnHeaderRow}>
            <Text style={styles.columnHeaderRank}>{t("leagueTable.colPosition")}</Text>
            <Text style={styles.columnHeaderName}>{t("leagueTable.colPlayer")}</Text>
            <Text style={styles.columnHeaderStat}>{t("leagueTable.colPoints")}</Text>
          </View>
          {visibleRows.map((row, index) => {
            const player = roster.find((p) => p.id === row.id);
            return (
              <RankingRow
                key={row.id}
                playerId={row.id}
                rank={index + 1}
                name={row.name}
                avatarUrl={player?.avatar_url}
                color={player?.custom_color ?? colors.accent}
                value={row.points}
                detail={t("home.leagueTableCardRowDetail", { gd: row.goalDifference > 0 ? `+${row.goalDifference}` : String(row.goalDifference), played: String(row.played) })}
                onPress={onPressPlayer}
                highlighted={myPlayerId !== null && row.id === myPlayerId}
                movement={movementByPlayerId.get(row.id) ?? 0}
              />
            );
          })}

          {standings.length > TOP_N ? (
            <Button label={expanded ? t("home.leagueTableCardShowTop5") : t("home.leagueTableCardShowAll")} variant="ghost" size="sm" onPress={onToggleExpanded} />
          ) : null}

          <Button label={t("home.leagueTableCardViewFullTable")} variant="secondary" onPress={onViewFullTable} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  headerText: {
    gap: 2,
    flex: 1,
  },
  title: {
    ...typography.heading,
  },
  subtitle: {
    ...typography.small,
    color: colors.textSecondary,
  },
  periodRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  columnHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.xs,
  },
  columnHeaderRank: {
    ...typography.small,
    color: colors.textSecondary,
    width: 32,
  },
  columnHeaderName: {
    ...typography.small,
    color: colors.textSecondary,
    flex: 1,
  },
  columnHeaderStat: {
    ...typography.small,
    color: colors.textSecondary,
  },
});
