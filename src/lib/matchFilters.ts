import type { MatchSummary } from "./matches";
import { findSides } from "./stats";
import type { MatchType, SideResult } from "./types/database";

export type DateRangeFilter = "all" | "7" | "30" | "90" | "month";

export interface MatchFilters {
  playerId: string | null;
  /** Only applied when playerId is also set -- restricts to matches played directly against this player. */
  opponentId: string | null;
  clubId: string | null;
  dateRange: DateRangeFilter;
  matchType: "all" | MatchType;
  /** "win"/"loss" are relative to playerId (ignored if playerId isn't set); "draw" is absolute. */
  result: "all" | SideResult;
  search: string;
}

export const DEFAULT_MATCH_FILTERS: MatchFilters = {
  playerId: null,
  opponentId: null,
  clubId: null,
  dateRange: "all",
  matchType: "all",
  result: "all",
  search: "",
};

export function hasActiveFilters(filters: MatchFilters): boolean {
  return (
    filters.playerId !== null ||
    filters.opponentId !== null ||
    filters.clubId !== null ||
    filters.dateRange !== "all" ||
    filters.matchType !== "all" ||
    filters.result !== "all" ||
    filters.search.trim() !== ""
  );
}

function dateRangeCutoff(range: Exclude<DateRangeFilter, "all">, now: Date): Date {
  if (range === "month") return new Date(now.getFullYear(), now.getMonth(), 1);
  const days = range === "7" ? 7 : range === "30" ? 30 : 90;
  return new Date(now.getTime() - days * 86_400_000);
}

function matchPasses(match: MatchSummary, filters: MatchFilters, now: Date): boolean {
  if (filters.matchType !== "all" && match.match_type !== filters.matchType) return false;

  const ownSide = filters.playerId ? findSides(filters.playerId, match) : null;
  if (filters.playerId && !ownSide) return false;

  if (filters.opponentId && filters.playerId) {
    if (!ownSide || !ownSide.opponent.players.some((p) => p.id === filters.opponentId)) return false;
  }

  if (filters.result !== "all") {
    if (filters.result === "draw") {
      if (match.sides[0].result !== "draw") return false;
    } else if (filters.playerId) {
      if (!ownSide || ownSide.own.result !== filters.result) return false;
    }
  }

  if (filters.clubId && !match.sides.some((s) => s.club?.id === filters.clubId)) return false;

  if (filters.dateRange !== "all") {
    const playedAt = new Date(match.played_at);
    if (playedAt < dateRangeCutoff(filters.dateRange, now)) return false;
  }

  const query = filters.search.trim().toLowerCase();
  if (query) {
    const haystack = match.sides
      .flatMap((s) => [...s.players.map((p) => p.display_name), s.club?.name ?? ""])
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(query)) return false;
  }

  return true;
}

/** Applies every active filter as a combined AND -- all filters stack together. */
export function filterMatches(matches: MatchSummary[], filters: MatchFilters, now: Date = new Date()): MatchSummary[] {
  return matches.filter((m) => matchPasses(m, filters, now));
}

/** Distinct clubs that appear in the given matches, sorted by name -- used to populate the club filter without a separate fetch. */
export function distinctClubs(matches: MatchSummary[]): { id: string; name: string }[] {
  const byId = new Map<string, string>();
  for (const match of matches) {
    for (const side of match.sides) {
      if (side.club) byId.set(side.club.id, side.club.name);
    }
  }
  return [...byId.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}
