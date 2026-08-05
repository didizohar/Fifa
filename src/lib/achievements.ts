import type { MatchSummary } from "./matches";
import { computeDoublesPartnerships, computeGoalStats, computePlayerStats, computeStreaks, findSides, type GoalStats, type PlayerStats, type StreakStats } from "./stats";

export interface Achievement {
  id: string;
  /** Translation keys for the title/description -- the UI calls t(labelKey)/t(descriptionKey, descriptionParams); this module never produces English text directly. */
  labelKey: string;
  descriptionKey: string;
  descriptionParams: Record<string, string | number>;
  /** When this achievement was unlocked, reconstructed by replaying match history -- not persisted anywhere. */
  unlockedAt: string;
}

interface AchievementDef {
  id: string;
  labelKey: string;
  descriptionKey: string;
  isUnlocked: (stats: PlayerStats, goals: GoalStats, streaks: StreakStats) => boolean;
}

const ACHIEVEMENT_DEFS: AchievementDef[] = [
  { id: "first-match", labelKey: "achievements.firstMatchLabel", descriptionKey: "achievements.firstMatchDescription", isUnlocked: (s) => s.played >= 1 },
  { id: "first-win", labelKey: "achievements.firstWinLabel", descriptionKey: "achievements.firstWinDescription", isUnlocked: (s) => s.wins >= 1 },
  { id: "first-goal", labelKey: "achievements.firstGoalLabel", descriptionKey: "achievements.firstGoalDescription", isUnlocked: (_s, g) => g.goalsScored >= 1 },
  { id: "hundred-matches", labelKey: "achievements.hundredMatchesLabel", descriptionKey: "achievements.hundredMatchesDescription", isUnlocked: (s) => s.played >= 100 },
  { id: "fifty-wins", labelKey: "achievements.fiftyWinsLabel", descriptionKey: "achievements.fiftyWinsDescription", isUnlocked: (s) => s.wins >= 50 },
  { id: "goal-machine", labelKey: "achievements.goalMachineLabel", descriptionKey: "achievements.goalMachineDescription", isUnlocked: (_s, g) => g.goalsScored >= 100 },
  { id: "wall", labelKey: "achievements.wallLabel", descriptionKey: "achievements.wallDescription", isUnlocked: (_s, g) => g.cleanSheets >= 10 },
  { id: "unstoppable", labelKey: "achievements.unstoppableLabel", descriptionKey: "achievements.unstoppableDescription", isUnlocked: (_s, _g, st) => st.longestWinStreak >= 10 },
  { id: "legend", labelKey: "achievements.legendLabel", descriptionKey: "achievements.legendDescription", isUnlocked: (s) => s.played >= 200 },
];

/**
 * Every stat-threshold achievement a player has unlocked, computed fresh
 * from match history each time -- no persistence table, since played_at
 * timestamps are enough to reconstruct exactly when a cumulative stat first
 * crossed its threshold. Deliberately O(n^2) (recomputing stats at every
 * prefix of the player's history): at this app's scale (a friend group's
 * matches, not millions of rows) that's simpler and fast enough, and not
 * worth an incremental algorithm.
 */
export function computePlayerAchievements(playerId: string, matches: MatchSummary[]): Achievement[] {
  const ordered = matches
    .filter((m) => findSides(playerId, m) !== null)
    .slice()
    .sort((a, b) => new Date(a.played_at).getTime() - new Date(b.played_at).getTime());
  if (ordered.length === 0) return [];

  const finalStats = computePlayerStats(playerId, ordered);
  const finalGoals = computeGoalStats(playerId, ordered);
  const finalStreaks = computeStreaks(playerId, ordered);

  const achievements: Achievement[] = [];
  for (const def of ACHIEVEMENT_DEFS) {
    if (!def.isUnlocked(finalStats, finalGoals, finalStreaks)) continue;

    let unlockedAt = ordered[ordered.length - 1]!.played_at;
    for (let i = 0; i < ordered.length; i++) {
      const prefix = ordered.slice(0, i + 1);
      const stats = computePlayerStats(playerId, prefix);
      const goals = computeGoalStats(playerId, prefix);
      const streaks = computeStreaks(playerId, prefix);
      if (def.isUnlocked(stats, goals, streaks)) {
        unlockedAt = prefix[prefix.length - 1]!.played_at;
        break;
      }
    }
    achievements.push({ id: def.id, labelKey: def.labelKey, descriptionKey: def.descriptionKey, descriptionParams: {}, unlockedAt });
  }
  return achievements;
}

const BEST_PARTNERSHIP_MIN_PLAYED = 10;
const BEST_PARTNERSHIP_MIN_WIN_RATE = 0.7;

export interface PartnershipAchievement extends Achievement {
  partnerId: string;
  partnerName: string;
}

/** A standout doubles partnership: at least 10 matches together with a 70%+ win rate. Null if no partnership qualifies. */
export function computeBestPartnershipAchievement(playerId: string, matches: MatchSummary[]): PartnershipAchievement | null {
  const partnerships = computeDoublesPartnerships(playerId, matches).filter(
    (p) => p.played >= BEST_PARTNERSHIP_MIN_PLAYED && (p.winRate ?? 0) >= BEST_PARTNERSHIP_MIN_WIN_RATE,
  );
  if (partnerships.length === 0) return null;
  const best = partnerships.reduce((top, p) => ((p.winRate ?? 0) > (top.winRate ?? 0) ? p : top));

  const shared = matches
    .filter((m) => m.match_type === "doubles" && (findSides(playerId, m)?.own.players.some((p) => p.id === best.teammateId) ?? false))
    .slice()
    .sort((a, b) => new Date(a.played_at).getTime() - new Date(b.played_at).getTime());

  // Find the TRUE first match where both thresholds were met -- assuming
  // it happened exactly at the minimum match count (shared[MIN_PLAYED - 1])
  // is wrong whenever the win rate crossed 70% later than that (e.g. a
  // partnership at 60% through 10 matches that goes on a run to 73% by
  // match 11 unlocks at 10, three matches early). `shared` already contains
  // only this specific partnership's matches, so computePlayerStats over a
  // growing prefix gives that partnership's own record at each point.
  let unlockedAt = shared[shared.length - 1]!.played_at;
  for (let i = BEST_PARTNERSHIP_MIN_PLAYED - 1; i < shared.length; i++) {
    const prefix = shared.slice(0, i + 1);
    const prefixStats = computePlayerStats(playerId, prefix);
    if (prefixStats.played >= BEST_PARTNERSHIP_MIN_PLAYED && (prefixStats.winRate ?? 0) >= BEST_PARTNERSHIP_MIN_WIN_RATE) {
      unlockedAt = prefix[prefix.length - 1]!.played_at;
      break;
    }
  }

  return {
    id: `best-partnership-${best.teammateId}`,
    labelKey: "achievements.bestPartnershipLabel",
    descriptionKey: "achievements.bestPartnershipDescription",
    descriptionParams: { percent: Math.round((best.winRate ?? 0) * 100), partnerName: best.teammateName },
    unlockedAt,
    partnerId: best.teammateId,
    partnerName: best.teammateName,
  };
}

/** Every achievement a player has unlocked, including a standout partnership if they have one. */
export function computeAllAchievements(playerId: string, matches: MatchSummary[]): Achievement[] {
  const achievements = computePlayerAchievements(playerId, matches);
  const partnership = computeBestPartnershipAchievement(playerId, matches);
  return partnership ? [...achievements, partnership] : achievements;
}
