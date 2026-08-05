import { computeAllAchievements } from "./achievements";
import { generateFunFacts } from "./facts";
import { matchSideLabel } from "./format";
import { generateInsights } from "./insights";
import type { MatchSidePlayer, MatchSummary } from "./matches";
import { computeAllRecords } from "./records";
import { computeMostBalancedRivalry, computeOldestRivalry, findSides } from "./stats";

export type DiscoveryItemType = "fact" | "insight" | "record" | "memory";

/** A function that resolves a translation key (+ optional interpolation params) to display text -- passed in rather than imported, since this module has no UI context of its own. */
type TFunction = (key: string, params?: Record<string, string | number>) => string;

export interface DiscoveryItem {
  id: string;
  type: DiscoveryItemType;
  /** Translation key + params -- the UI calls t(textKey, textParams); this module never produces English text directly. */
  textKey: string;
  textParams: Record<string, string | number>;
  /** Rough interestingness score used to rank items -- higher surfaces first. */
  score: number;
}

/**
 * Records whose setAt falls within the last windowDays, framed as "just happened" news.
 * A record's own label/value are themselves translation keys, so this needs `t` to
 * pre-resolve them into plain strings before they can be interpolated into the
 * composite "New record: ..." sentence (the flat {param} interpolation in
 * LocaleProvider.resolve() can't itself resolve a nested key).
 */
function recentlyBrokenRecordItems(roster: MatchSidePlayer[], matches: MatchSummary[], now: Date, t: TFunction, windowDays = 14): DiscoveryItem[] {
  const cutoff = now.getTime() - windowDays * 86_400_000;
  return computeAllRecords(roster, matches)
    .filter((r) => new Date(r.setAt).getTime() >= cutoff)
    .map((r) => ({
      id: `record-${r.id}`,
      type: "record" as const,
      textKey: "discovery.newRecord",
      textParams: { label: t(r.labelKey), holderName: r.holderName, value: t(r.valueLabelKey, r.valueLabelParams) },
      score: 80,
    }));
}

/** A match this player played on today's calendar date in a past year, if one exists -- the most recent such anniversary. */
function todaysFootballMemory(playerId: string, matches: MatchSummary[], now: Date, t: TFunction): DiscoveryItem[] {
  const candidates = matches.filter((m) => {
    if (findSides(playerId, m) === null) return false;
    const d = new Date(m.played_at);
    return d.getMonth() === now.getMonth() && d.getDate() === now.getDate() && d.getFullYear() < now.getFullYear();
  });
  if (candidates.length === 0) return [];

  const best = candidates.reduce((latest, m) => (new Date(m.played_at).getFullYear() > new Date(latest.played_at).getFullYear() ? m : latest));
  const sides = findSides(playerId, best)!;
  const yearsAgo = now.getFullYear() - new Date(best.played_at).getFullYear();
  const opponentName = matchSideLabel(sides.opponent.players.map((p) => p.display_name));
  const resultKey = sides.own.result === "win" ? "discovery.resultWin" : sides.own.result === "loss" ? "discovery.resultLoss" : "discovery.resultDraw";
  const timeText = yearsAgo === 1 ? t("discovery.memoryTimeLastYear") : t("discovery.memoryTimeYearsAgo", { years: yearsAgo });

  return [
    {
      id: `memory-${best.id}`,
      type: "memory",
      textKey: "discovery.memoryTemplate",
      textParams: {
        time: timeText,
        result: t(resultKey),
        opponent: opponentName,
        ownScore: sides.own.score,
        opponentScore: sides.opponent.score,
      },
      score: 85,
    },
  ];
}

/** Achievements this player unlocked within the last windowDays -- the same "just happened" framing as recently broken records. */
function recentlyUnlockedAchievementItems(playerId: string, matches: MatchSummary[], now: Date, t: TFunction, windowDays = 14): DiscoveryItem[] {
  const cutoff = now.getTime() - windowDays * 86_400_000;
  return computeAllAchievements(playerId, matches)
    .filter((a) => new Date(a.unlockedAt).getTime() >= cutoff)
    .map((a) => ({
      id: `achievement-${a.id}`,
      type: "record" as const,
      textKey: "discovery.achievementUnlocked",
      textParams: { label: t(a.labelKey), description: t(a.descriptionKey, a.descriptionParams) },
      score: 82,
    }));
}

/** Group-wide rivalry trivia: the closest-to-50/50 pairing and the longest-running one. Not specific to the viewing player -- these are curiosities about the whole group. */
function rivalryItems(roster: MatchSidePlayer[], matches: MatchSummary[]): DiscoveryItem[] {
  const items: DiscoveryItem[] = [];

  const balanced = computeMostBalancedRivalry(roster, matches);
  if (balanced) {
    items.push({
      id: `rivalry-balanced-${balanced.playerIds.join(":")}`,
      type: "fact",
      textKey: "discovery.balancedRivalry",
      textParams: { nameA: balanced.playerNames[0], nameB: balanced.playerNames[1], played: balanced.played },
      score: 55,
    });
  }

  const oldest = computeOldestRivalry(roster, matches);
  if (oldest && oldest.playerIds.join(":") !== balanced?.playerIds.join(":")) {
    items.push({
      id: `rivalry-oldest-${oldest.playerIds.join(":")}`,
      type: "fact",
      textKey: "discovery.oldestRivalry",
      textParams: { nameA: oldest.playerNames[0], nameB: oldest.playerNames[1] },
      score: 50,
    });
  }

  return items;
}

/** Every honestly-derivable discovery item for this player right now: facts, trend insights, recently broken records/unlocked achievements, group rivalry trivia, and an on-this-day memory. */
export function generateDiscoveryItems(playerId: string, roster: MatchSidePlayer[], matches: MatchSummary[], t: TFunction, now: Date = new Date()): DiscoveryItem[] {
  return [
    ...generateFunFacts(playerId, roster, matches).map((f) => ({ id: `fact-${f.id}`, type: "fact" as const, textKey: f.textKey, textParams: f.textParams, score: f.score })),
    ...generateInsights(playerId, roster, matches).map((i) => ({ id: `insight-${i.id}`, type: "insight" as const, textKey: i.textKey, textParams: i.textParams, score: i.score })),
    ...recentlyBrokenRecordItems(roster, matches, now, t),
    ...recentlyUnlockedAchievementItems(playerId, matches, now, t),
    ...rivalryItems(roster, matches),
    ...todaysFootballMemory(playerId, matches, now, t),
  ];
}

/** A seed for the given calendar day (local time) -- stable within a day, different the next. */
export function dailySeed(now: Date): number {
  return now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
}

/** Deterministic shuffle (LCG-based) -- not cryptographic, just enough that the same-score tiebreak order changes day to day instead of always favoring whichever generator ran first. */
export function seededShuffle<T>(items: T[], seed: number): T[] {
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
export function selectHomeHighlights(playerId: string, roster: MatchSidePlayer[], matches: MatchSummary[], t: TFunction, now: Date = new Date(), count = 4): DiscoveryItem[] {
  const items = generateDiscoveryItems(playerId, roster, matches, t, now);
  return seededShuffle(items, dailySeed(now))
    .sort((a, b) => b.score - a.score)
    .slice(0, count);
}
