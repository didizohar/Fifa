import type { MatchSidePlayer, MatchSummary } from "./matches";
import { computeDoublesPartnerships, computeGoalStats, computeHeadToHead, computePlayerStats, computeStreaks, findSides, MIN_SAMPLE_SIZE } from "./stats";

export interface FunFact {
  /** Stable id for this fact instance -- lets a caller dedupe or track "already shown". */
  id: string;
  text: string;
  /** Rough interestingness score for ranking when multiple facts are available -- higher surfaces first. Not a probability, just a sort key. */
  score: number;
}

const ROUND_MILESTONES = [10, 25, 50, 100, 150, 200, 250, 300, 400, 500];

function currentStreakFacts(playerId: string, matches: MatchSummary[]): FunFact[] {
  const streaks = computeStreaks(playerId, matches);
  const { result, count } = streaks.currentStreak;
  if (result === "win" && count >= 3) {
    const isCareerBest = count >= streaks.longestWinStreak;
    return [
      {
        id: `streak-win-${count}`,
        text: isCareerBest
          ? `You're on a ${count}-match winning streak -- the longest of your career.`
          : `You're on a ${count}-match winning streak.`,
        score: isCareerBest ? 90 : 70,
      },
    ];
  }
  if (result === "loss" && count >= 3) {
    return [{ id: `streak-loss-${count}`, text: `You've lost ${count} in a row.`, score: 50 }];
  }
  return [];
}

function milestoneFacts(playerId: string, matches: MatchSummary[]): FunFact[] {
  const stats = computePlayerStats(playerId, matches);
  const goals = computeGoalStats(playerId, matches);
  const facts: FunFact[] = [];
  if (ROUND_MILESTONES.includes(stats.played)) {
    facts.push({ id: `milestone-matches-${stats.played}`, text: `You've now played exactly ${stats.played} matches.`, score: 60 });
  }
  if (ROUND_MILESTONES.includes(stats.wins)) {
    facts.push({ id: `milestone-wins-${stats.wins}`, text: `You've now won exactly ${stats.wins} matches.`, score: 60 });
  }
  if (ROUND_MILESTONES.includes(goals.goalsScored)) {
    facts.push({ id: `milestone-goals-${goals.goalsScored}`, text: `You've scored exactly ${goals.goalsScored} goals.`, score: 65 });
  }
  return facts;
}

type HeadToHead = ReturnType<typeof computeHeadToHead>;

function bestQualifyingRival(
  playerId: string,
  roster: MatchSidePlayer[],
  matches: MatchSummary[],
  predicate: (h2h: HeadToHead) => boolean,
): { opponentId: string; opponentName: string; h2h: HeadToHead } | null {
  let best: { opponentId: string; opponentName: string; h2h: HeadToHead } | null = null;
  for (const opponent of roster) {
    if (opponent.id === playerId) continue;
    const h2h = computeHeadToHead(playerId, opponent.id, matches);
    if (h2h.played < MIN_SAMPLE_SIZE || !predicate(h2h)) continue;
    if (!best || h2h.played > best.h2h.played) best = { opponentId: opponent.id, opponentName: opponent.display_name, h2h };
  }
  return best;
}

/** Rivalry facts -- deliberately only "never beaten" and "never lost to", both unambiguous and fully honest from win/loss counts alone. */
function rivalryFacts(playerId: string, roster: MatchSidePlayer[], matches: MatchSummary[]): FunFact[] {
  const facts: FunFact[] = [];

  const neverBeaten = bestQualifyingRival(playerId, roster, matches, (h2h) => h2h.wins === 0);
  if (neverBeaten) {
    facts.push({
      id: `never-beaten-${neverBeaten.opponentId}`,
      text: `You've never beaten ${neverBeaten.opponentName} (0-${neverBeaten.h2h.losses}-${neverBeaten.h2h.draws} in ${neverBeaten.h2h.played} matches).`,
      score: 85,
    });
  }

  const neverLostTo = bestQualifyingRival(playerId, roster, matches, (h2h) => h2h.losses === 0);
  if (neverLostTo) {
    facts.push({
      id: `never-lost-to-${neverLostTo.opponentId}`,
      text: `You've never lost to ${neverLostTo.opponentName} in ${neverLostTo.h2h.played} matches.`,
      score: 80,
    });
  }

  return facts;
}

function personalRecordFacts(playerId: string, matches: MatchSummary[]): FunFact[] {
  const own = matches
    .map((m) => ({ match: m, sides: findSides(playerId, m) }))
    .filter((r): r is { match: MatchSummary; sides: NonNullable<ReturnType<typeof findSides>> } => r.sides !== null);
  if (own.length === 0) return [];

  const facts: FunFact[] = [];

  const closest = own.reduce((min, r) =>
    Math.abs(r.sides.own.score - r.sides.opponent.score) < Math.abs(min.sides.own.score - min.sides.opponent.score) ? r : min,
  );
  const closestMargin = Math.abs(closest.sides.own.score - closest.sides.opponent.score);
  if (closestMargin <= 1) {
    facts.push({
      id: `closest-match-${closest.match.id}`,
      text: `Your closest-ever match was a ${closest.sides.own.score}-${closest.sides.opponent.score} classic against ${opponentLabel(closest.sides.opponent.players)}.`,
      score: 55,
    });
  }

  const wins = own.filter((r) => r.sides.own.result === "win");
  if (wins.length > 0) {
    const biggest = wins.reduce((max, r) =>
      r.sides.own.score - r.sides.opponent.score > max.sides.own.score - max.sides.opponent.score ? r : max,
    );
    const margin = biggest.sides.own.score - biggest.sides.opponent.score;
    if (margin >= 3) {
      facts.push({
        id: `biggest-win-${biggest.match.id}`,
        text: `Your biggest-ever win was ${biggest.sides.own.score}-${biggest.sides.opponent.score} against ${opponentLabel(biggest.sides.opponent.players)}.`,
        score: 60,
      });
    }
  }

  return facts;
}

function opponentLabel(players: { display_name: string }[]): string {
  return players.map((p) => p.display_name).join(" & ") || "Unknown";
}

/**
 * Doubles-partnership facts. The goal-comparison fact is phrased as "your
 * side" rather than "you" -- the schema only tracks side-level score, so any
 * per-player goal claim in doubles would overstate what's actually known.
 */
function partnershipFacts(playerId: string, matches: MatchSummary[]): FunFact[] {
  const partnerships = computeDoublesPartnerships(playerId, matches);
  const top = partnerships.find((p) => p.played >= MIN_SAMPLE_SIZE);
  if (!top) return [];

  const facts: FunFact[] = [
    { id: `favorite-partner-${top.teammateId}`, text: `Your most frequent doubles partner is ${top.teammateName} (${top.played} matches together).`, score: 45 },
  ];

  const withPartner = matches.filter(
    (m) => m.match_type === "doubles" && (findSides(playerId, m)?.own.players.some((p) => p.id === top.teammateId) ?? false),
  );
  const withoutPartner = matches.filter((m) => {
    if (m.match_type !== "doubles") return false;
    const sides = findSides(playerId, m);
    return sides !== null && !sides.own.players.some((p) => p.id === top.teammateId);
  });

  const avgGoals = (list: MatchSummary[]): number | null => {
    if (list.length === 0) return null;
    const total = list.reduce((sum, m) => sum + findSides(playerId, m)!.own.score, 0);
    return total / list.length;
  };

  const withAvg = avgGoals(withPartner);
  const withoutAvg = avgGoals(withoutPartner);
  if (withAvg !== null && withoutAvg !== null && withoutAvg > 0 && withPartner.length >= MIN_SAMPLE_SIZE && withoutPartner.length >= MIN_SAMPLE_SIZE) {
    const pctDiff = Math.round(((withAvg - withoutAvg) / withoutAvg) * 100);
    if (Math.abs(pctDiff) >= 15) {
      facts.push({
        id: `partner-goal-diff-${top.teammateId}`,
        text:
          pctDiff > 0
            ? `Your side scores ${pctDiff}% more goals per match when you play with ${top.teammateName}.`
            : `Your side scores ${Math.abs(pctDiff)}% fewer goals per match when you play with ${top.teammateName}.`,
        score: 65,
      });
    }
  }

  return facts;
}

/** Every honestly-derivable fun fact currently true for this player. Unsorted -- callers should sort by score descending before display. */
export function generateFunFacts(playerId: string, roster: MatchSidePlayer[], matches: MatchSummary[]): FunFact[] {
  return [
    ...currentStreakFacts(playerId, matches),
    ...milestoneFacts(playerId, matches),
    ...rivalryFacts(playerId, roster, matches),
    ...personalRecordFacts(playerId, matches),
    ...partnershipFacts(playerId, matches),
  ];
}
