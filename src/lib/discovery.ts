import { generateFunFacts } from "./facts";
import { generateInsights } from "./insights";
import type { MatchSidePlayer, MatchSummary } from "./matches";
import { computeAllRecords } from "./records";
import { findSides } from "./stats";

export type DiscoveryItemType = "fact" | "insight" | "record" | "memory";

export interface DiscoveryItem {
  id: string;
  type: DiscoveryItemType;
  text: string;
  /** Rough interestingness score used to rank items -- higher surfaces first. */
  score: number;
}

/** Records whose setAt falls within the last windowDays, framed as "just happened" news. */
function recentlyBrokenRecordItems(roster: MatchSidePlayer[], matches: MatchSummary[], now: Date, windowDays = 14): DiscoveryItem[] {
  const cutoff = now.getTime() - windowDays * 86_400_000;
  return computeAllRecords(roster, matches)
    .filter((r) => new Date(r.setAt).getTime() >= cutoff)
    .map((r) => ({ id: `record-${r.id}`, type: "record" as const, text: `New record: ${r.label} -- ${r.holderName} (${r.valueLabel}).`, score: 80 }));
}

/** A match this player played on today's calendar date in a past year, if one exists -- the most recent such anniversary. */
function todaysFootballMemory(playerId: string, matches: MatchSummary[], now: Date): DiscoveryItem[] {
  const candidates = matches.filter((m) => {
    if (findSides(playerId, m) === null) return false;
    const d = new Date(m.played_at);
    return d.getMonth() === now.getMonth() && d.getDate() === now.getDate() && d.getFullYear() < now.getFullYear();
  });
  if (candidates.length === 0) return [];

  const best = candidates.reduce((latest, m) => (new Date(m.played_at).getFullYear() > new Date(latest.played_at).getFullYear() ? m : latest));
  const sides = findSides(playerId, best)!;
  const yearsAgo = now.getFullYear() - new Date(best.played_at).getFullYear();
  const opponentName = sides.opponent.players.map((p) => p.display_name).join(" & ") || "Unknown";
  const resultWord = sides.own.result === "win" ? "beat" : sides.own.result === "loss" ? "lost to" : "drew with";

  return [
    {
      id: `memory-${best.id}`,
      type: "memory",
      text: `On this day ${yearsAgo === 1 ? "last year" : `${yearsAgo} years ago`}, you ${resultWord} ${opponentName} ${sides.own.score}-${sides.opponent.score}.`,
      score: 85,
    },
  ];
}

/** Every honestly-derivable discovery item for this player right now: facts, trend insights, recently broken records, and an on-this-day memory. */
export function generateDiscoveryItems(playerId: string, roster: MatchSidePlayer[], matches: MatchSummary[], now: Date = new Date()): DiscoveryItem[] {
  return [
    ...generateFunFacts(playerId, roster, matches).map((f) => ({ id: `fact-${f.id}`, type: "fact" as const, text: f.text, score: f.score })),
    ...generateInsights(playerId, roster, matches).map((i) => ({ id: `insight-${i.id}`, type: "insight" as const, text: i.text, score: i.score })),
    ...recentlyBrokenRecordItems(roster, matches, now),
    ...todaysFootballMemory(playerId, matches, now),
  ];
}

/** A seed for the given calendar day (local time) -- stable within a day, different the next. */
function dailySeed(now: Date): number {
  return now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
}

/** Deterministic shuffle (LCG-based) -- not cryptographic, just enough that the same-score tiebreak order changes day to day instead of always favoring whichever generator ran first. */
function seededShuffle<T>(items: T[], seed: number): T[] {
  let state = seed;
  const next = () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Top `count` discovery items for a "Did You Know" / Home-highlights surface.
 * Ranked by score, with a same-day-stable shuffle breaking ties so equally
 * interesting items don't always appear in the same order -- but the result
 * doesn't change on every re-render/navigation within the same day.
 */
export function selectHomeHighlights(playerId: string, roster: MatchSidePlayer[], matches: MatchSummary[], now: Date = new Date(), count = 4): DiscoveryItem[] {
  const items = generateDiscoveryItems(playerId, roster, matches, now);
  return seededShuffle(items, dailySeed(now))
    .sort((a, b) => b.score - a.score)
    .slice(0, count);
}
