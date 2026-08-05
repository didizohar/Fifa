import { matchSideLabel } from "./format";
import type { MatchSidePlayer, MatchSideSummary, MatchSummary } from "./matches";
import { computeCleanSheetsLeaderboard, computeWinRateLeaderboard, findSides } from "./stats";

export interface RecordEntry {
  /** Stable slug for this record kind, e.g. "highest-scoring-match". */
  id: string;
  /** Translation key for the record's title -- the UI calls t(labelKey); this module never produces English text directly. */
  labelKey: string;
  holderName: string;
  /** Player ids this record belongs to -- empty for records with no single attributable player/side (e.g. most matches in a day). Use this for matching, never holderName (which can collide with a display name containing " & "). */
  holderIds: string[];
  valueLabelKey: string;
  valueLabelParams: Record<string, string | number>;
  /** The match this record is tied to, if any -- lets a screen link straight to it. */
  matchId: string | null;
  /** When this record was set (or, for cumulative records, the holder's most recent contributing match) -- used to detect "recently broken". */
  setAt: string;
}

function sideLabel(side: MatchSideSummary): string {
  return matchSideLabel(side.players.map((p) => p.display_name));
}

function sideIds(side: MatchSideSummary): string[] {
  return side.players.map((p) => p.id);
}

function totalGoals(match: MatchSummary): number {
  return match.sides[0].score + match.sides[1].score;
}

/** The single match with the most combined goals across both sides. */
export function computeHighestScoringMatchRecord(matches: MatchSummary[]): RecordEntry | null {
  if (matches.length === 0) return null;
  const best = matches.reduce((top, m) => (totalGoals(m) > totalGoals(top) ? m : top));
  const [s1, s2] = best.sides;
  return {
    id: "highest-scoring-match",
    labelKey: "records.highestScoringMatch",
    holderName: `${sideLabel(s1)} vs ${sideLabel(s2)}`,
    holderIds: [...sideIds(s1), ...sideIds(s2)],
    valueLabelKey: "records.valueGoalsWithScore",
    valueLabelParams: { goals: totalGoals(best), score: `${s1.score}-${s2.score}` },
    matchId: best.id,
    setAt: best.played_at,
  };
}

/** The match with the smallest score margin between the two sides. */
export function computeClosestMatchRecord(matches: MatchSummary[]): RecordEntry | null {
  if (matches.length === 0) return null;
  const margin = (m: MatchSummary) => Math.abs(m.sides[0].score - m.sides[1].score);
  const best = matches.reduce((closest, m) => (margin(m) < margin(closest) ? m : closest));
  const [s1, s2] = best.sides;
  return {
    id: "closest-match",
    labelKey: "records.closestMatch",
    holderName: `${sideLabel(s1)} vs ${sideLabel(s2)}`,
    holderIds: [...sideIds(s1), ...sideIds(s2)],
    valueLabelKey: "records.valueScoreWithMargin",
    valueLabelParams: { score: `${s1.score}-${s2.score}`, margin: margin(best) },
    matchId: best.id,
    setAt: best.played_at,
  };
}

/** The single largest winning margin by any side in any match. */
export function computeBiggestVictoryRecord(matches: MatchSummary[]): RecordEntry | null {
  let best: { match: MatchSummary; winner: MatchSideSummary; loser: MatchSideSummary; margin: number } | null = null;
  for (const match of matches) {
    const [s1, s2] = match.sides;
    if (s1.result === "draw") continue;
    const winner = s1.result === "win" ? s1 : s2;
    const loser = s1.result === "win" ? s2 : s1;
    const margin = winner.score - loser.score;
    if (!best || margin > best.margin) best = { match, winner, loser, margin };
  }
  if (!best) return null;
  return {
    id: "biggest-victory",
    labelKey: "records.biggestVictory",
    holderName: sideLabel(best.winner),
    holderIds: sideIds(best.winner),
    valueLabelKey: "records.valueVictoryMargin",
    valueLabelParams: {
      winnerScore: best.winner.score,
      loserScore: best.loser.score,
      loser: sideLabel(best.loser),
      margin: best.margin,
    },
    matchId: best.match.id,
    setAt: best.match.played_at,
  };
}

/** The most goals scored by a single side in a single match. */
export function computeMostGoalsInMatchRecord(matches: MatchSummary[]): RecordEntry | null {
  let best: { side: MatchSideSummary; match: MatchSummary } | null = null;
  for (const match of matches) {
    for (const side of match.sides) {
      if (!best || side.score > best.side.score) best = { side, match };
    }
  }
  if (!best) return null;
  return {
    id: "most-goals-in-match",
    labelKey: "records.mostGoalsInMatch",
    holderName: sideLabel(best.side),
    holderIds: sideIds(best.side),
    valueLabelKey: "records.valueGoalsCount",
    valueLabelParams: { goals: best.side.score },
    matchId: best.match.id,
    setAt: best.match.played_at,
  };
}

const MOST_MATCHES_IN_DAY_LABEL = new Intl.DateTimeFormat(undefined, { month: "long", day: "numeric", year: "numeric" });

/** The calendar day (local time) with the most matches recorded. */
export function computeMostMatchesInOneDayRecord(matches: MatchSummary[]): RecordEntry | null {
  const byDate = new Map<string, MatchSummary[]>();
  for (const match of matches) {
    const dateKey = new Date(match.played_at).toDateString();
    const list = byDate.get(dateKey) ?? [];
    list.push(match);
    byDate.set(dateKey, list);
  }
  // Sorted (not just scanned) so an exact tie between two days always
  // resolves to the earlier date, regardless of Map iteration/insertion
  // order -- matches this file's other deterministic tie-breaks.
  const [bestDate, bestList] = [...byDate.entries()].sort(
    (a, b) => b[1].length - a[1].length || new Date(a[0]).getTime() - new Date(b[0]).getTime(),
  )[0] ?? [null, []];
  if (!bestDate) return null;
  const earliest = bestList.reduce((min, m) => (m.played_at < min ? m.played_at : min), bestList[0]!.played_at);
  return {
    id: "most-matches-in-one-day",
    labelKey: "records.mostMatchesInOneDay",
    holderName: MOST_MATCHES_IN_DAY_LABEL.format(new Date(bestDate)),
    holderIds: [],
    valueLabelKey: bestList.length === 1 ? "records.valueOneMatch" : "records.valueMatchesCount",
    valueLabelParams: { count: bestList.length },
    matchId: null,
    setAt: earliest,
  };
}

/** Longest run of the given result in a player's chronological history, and the date the run last extended. */
function longestRun(playerId: string, matches: MatchSummary[], result: "win" | "loss"): { length: number; endedAt: string } | null {
  const ordered = matches
    .filter((m) => findSides(playerId, m) !== null)
    .slice()
    .sort((a, b) => new Date(a.played_at).getTime() - new Date(b.played_at).getTime());

  let bestLen = 0;
  let bestEndAt: string | null = null;
  let runLen = 0;
  for (const m of ordered) {
    if (findSides(playerId, m)!.own.result === result) {
      runLen++;
      if (runLen > bestLen) {
        bestLen = runLen;
        bestEndAt = m.played_at;
      }
    } else {
      runLen = 0;
    }
  }
  return bestLen > 0 ? { length: bestLen, endedAt: bestEndAt! } : null;
}

/** The single longest winning streak by any player in the group. */
export function computeLongestWinStreakRecord(roster: MatchSidePlayer[], matches: MatchSummary[]): RecordEntry | null {
  let best: { player: MatchSidePlayer; length: number; endedAt: string } | null = null;
  for (const player of roster) {
    const run = longestRun(player.id, matches, "win");
    if (run && (!best || run.length > best.length)) best = { player, ...run };
  }
  if (!best) return null;
  return {
    id: "longest-win-streak",
    labelKey: "records.longestWinStreak",
    holderName: best.player.display_name,
    holderIds: [best.player.id],
    valueLabelKey: best.length === 1 ? "records.valueOneWinInARow" : "records.valueWinsInARow",
    valueLabelParams: { count: best.length },
    matchId: null,
    setAt: best.endedAt,
  };
}

/** The single longest losing streak by any player in the group. */
export function computeLongestLossStreakRecord(roster: MatchSidePlayer[], matches: MatchSummary[]): RecordEntry | null {
  let best: { player: MatchSidePlayer; length: number; endedAt: string } | null = null;
  for (const player of roster) {
    const run = longestRun(player.id, matches, "loss");
    if (run && (!best || run.length > best.length)) best = { player, ...run };
  }
  if (!best) return null;
  return {
    id: "longest-loss-streak",
    labelKey: "records.longestLossStreak",
    holderName: best.player.display_name,
    holderIds: [best.player.id],
    valueLabelKey: best.length === 1 ? "records.valueOneLossInARow" : "records.valueLossesInARow",
    valueLabelParams: { count: best.length },
    matchId: null,
    setAt: best.endedAt,
  };
}

/** Most recent played_at among this player's matches -- the fallback is unreachable in practice (a leaderboard-topping player always has matches) but keeps this total. */
function mostRecentPlayedAt(playerId: string, matches: MatchSummary[]): string {
  const own = matches.filter((m) => findSides(playerId, m) !== null);
  return own.reduce((max, m) => (m.played_at > max ? m.played_at : max), own[0]?.played_at ?? new Date(0).toISOString());
}

/** The player with the most career clean sheets. */
export function computeMostCleanSheetsRecord(roster: MatchSidePlayer[], matches: MatchSummary[]): RecordEntry | null {
  const top = computeCleanSheetsLeaderboard(roster, matches)[0];
  if (!top) return null;
  return {
    id: "most-clean-sheets",
    labelKey: "records.mostCleanSheets",
    holderName: top.playerName,
    holderIds: [top.playerId],
    // top.valueLabel is already a bare number (see stats.ts) -- language-neutral, just passed through.
    valueLabelKey: "records.valueRaw",
    valueLabelParams: { value: top.valueLabel },
    matchId: null,
    setAt: mostRecentPlayedAt(top.playerId, matches),
  };
}

/** The player leading the qualified win-rate ranking. */
export function computeHighestWinRateRecord(roster: MatchSidePlayer[], matches: MatchSummary[]): RecordEntry | null {
  const top = computeWinRateLeaderboard(roster, matches)[0];
  if (!top) return null;
  return {
    id: "highest-win-rate",
    labelKey: "records.highestWinRate",
    holderName: top.playerName,
    holderIds: [top.playerId],
    // top.valueLabel is already a bare percentage (see stats.ts) -- language-neutral, just passed through.
    valueLabelKey: "records.valueRaw",
    valueLabelParams: { value: top.valueLabel },
    matchId: null,
    setAt: mostRecentPlayedAt(top.playerId, matches),
  };
}

/** Every group-wide record in one pass, skipping any that don't yet have enough data to exist. */
export function computeAllRecords(roster: MatchSidePlayer[], matches: MatchSummary[]): RecordEntry[] {
  return [
    computeHighestScoringMatchRecord(matches),
    computeClosestMatchRecord(matches),
    computeBiggestVictoryRecord(matches),
    computeMostGoalsInMatchRecord(matches),
    computeMostMatchesInOneDayRecord(matches),
    computeLongestWinStreakRecord(roster, matches),
    computeLongestLossStreakRecord(roster, matches),
    computeMostCleanSheetsRecord(roster, matches),
    computeHighestWinRateRecord(roster, matches),
  ].filter((r): r is RecordEntry => r !== null);
}
