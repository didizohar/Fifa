import { useMemo } from "react";
import { useGroupMatchHistory } from "./useMatches";
import { usePlayers } from "./usePlayers";
import { useSeasons } from "./useSeasons";
import { useWinnersStaySessionHistory } from "./useWinnersStaySessionHistory";
import { computeSeasonAwards, computeSeasonCardSummary, computeSeasonOverview, matchesInSeasonWindow, type SeasonAwards, type SeasonCardSummary, type SeasonOverview } from "../lib/seasonReport";
import { computeSeasonClubRankings, computeSeasonStatistics, type SeasonClubRankings, type SeasonStatistics } from "../lib/seasonStatistics";
import type { MatchSummary } from "../lib/matches";
import type { PlayerProfile, Season } from "../lib/types/database";

const EMPTY_MATCHES: MatchSummary[] = [];
const EMPTY_PLAYERS: PlayerProfile[] = [];

/**
 * Archived seasons are frozen (see Season Archive below) -- their report
 * can never change, so once computed it's kept for the rest of the app
 * session instead of being recomputed every time the screen is revisited.
 * The still-active season is never cached here since its matches keep
 * changing; react-query's own cache already avoids the network round-trip,
 * this only avoids redoing the (cheap but non-trivial) statistics math.
 */
const archivedReportCache = new Map<string, { overview: SeasonOverview; awards: SeasonAwards; statistics: SeasonStatistics; clubRankings: SeasonClubRankings }>();

/** Drops a season's cached report -- used by the "Delete Competition and Data" flow, so a deleted season's computed statistics don't linger in memory even though nothing in the database changes beyond the season row itself. */
export function purgeCachedSeasonReport(seasonId: string): void {
  archivedReportCache.delete(seasonId);
}

/**
 * Drops every cached archived-season report -- used after a match edit
 * succeeds. "Archived seasons are frozen" (see the cache's own docstring
 * above) assumes their matches never change, but nothing actually enforces
 * that: canEditMatch only checks role/creator permissions, not whether the
 * match falls within an already-archived season's date window, and a
 * match's season_id isn't itself editable, so there's no cheap way to know
 * from inside the edit mutation exactly which season (if any) was
 * affected. Clearing everything is the smallest safe fix -- worst case, one
 * archived season recomputes its report once more than strictly necessary
 * the next time it's viewed, which is the same "cheap but non-trivial"
 * computation this cache exists to avoid repeating on every visit, not a
 * network round-trip.
 */
export function clearAllCachedSeasonReports(): void {
  archivedReportCache.clear();
}

/** Card-level summaries for every season in the group, newest first -- deliberately does NOT compute awards/statistics/club rankings for any season (see Season Details' lazy computation below), so listing many seasons stays cheap. */
export function useSeasonHistoryList(groupId: string | null) {
  const seasonsQuery = useSeasons(groupId);
  const rosterQuery = usePlayers(groupId, true);
  const matchHistory = useGroupMatchHistory(groupId);
  const { history: sessionHistory } = useWinnersStaySessionHistory(groupId);

  const seasons = seasonsQuery.data ?? [];
  const roster = rosterQuery.data ?? EMPTY_PLAYERS;
  const allMatches = matchHistory.data ?? EMPTY_MATCHES;
  const sessionEndedAtTimestamps = useMemo(() => sessionHistory.map((r) => r.endedAt), [sessionHistory]);

  const summaries = useMemo<SeasonCardSummary[]>(() => {
    return seasons.map((season) => {
      const seasonMatches = matchesInSeasonWindow(allMatches, season);
      return computeSeasonCardSummary(season, roster, seasonMatches, sessionEndedAtTimestamps);
    });
  }, [seasons, roster, allMatches, sessionEndedAtTimestamps]);

  return {
    summaries,
    isLoading: seasonsQuery.isLoading || rosterQuery.isLoading || matchHistory.isLoading,
    isError: seasonsQuery.isError || rosterQuery.isError || matchHistory.isError,
  };
}

/** The full report for one season -- Overview, Awards, Statistics, and Club Rankings -- computed only when a Season Details screen actually mounts for that season (expo-router doesn't render off-screen routes, so this is naturally lazy-loaded). */
export function useSeasonReport(groupId: string | null, seasonId: string | undefined) {
  const seasonsQuery = useSeasons(groupId);
  const rosterQuery = usePlayers(groupId, true);
  const matchHistory = useGroupMatchHistory(groupId);
  const { history: sessionHistory } = useWinnersStaySessionHistory(groupId);

  const season = (seasonsQuery.data ?? []).find((s) => s.id === seasonId) ?? null;
  const roster = rosterQuery.data ?? EMPTY_PLAYERS;
  const allMatches = matchHistory.data ?? EMPTY_MATCHES;
  const sessionEndedAtTimestamps = useMemo(() => sessionHistory.map((r) => r.endedAt), [sessionHistory]);

  const seasonMatches = useMemo(() => (season ? matchesInSeasonWindow(allMatches, season) : EMPTY_MATCHES), [season, allMatches]);

  const report = useMemo(() => {
    if (!season) return null;

    if (!season.is_active) {
      const cached = archivedReportCache.get(season.id);
      if (cached) return cached;
    }

    const statistics = computeSeasonStatistics(season, roster, seasonMatches);
    const computed = {
      overview: computeSeasonOverview(roster, seasonMatches, sessionEndedAtTimestamps, season),
      awards: computeSeasonAwards(roster, seasonMatches),
      statistics,
      clubRankings: computeSeasonClubRankings(statistics.clubUsage),
    };

    if (!season.is_active) archivedReportCache.set(season.id, computed);
    return computed;
  }, [season, roster, seasonMatches, sessionEndedAtTimestamps]);

  return {
    season,
    roster,
    seasonMatches,
    report,
    isLoading: seasonsQuery.isLoading || rosterQuery.isLoading || matchHistory.isLoading,
    isError: seasonsQuery.isError || rosterQuery.isError || matchHistory.isError,
  };
}
