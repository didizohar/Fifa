import { matchSideLabel } from "../format";
import type { MatchSidePlayer, MatchSideSummary, MatchSummary } from "../matches";
import { computeIndividualStandings, computePairStandings } from "../leagueStandings";
import { computeHighestScoringMatchRecord, type RecordEntry } from "../records";

export interface SessionPairRecord {
  name: string;
  wins: number;
  losses: number;
  draws: number;
}

export interface SessionBestClub {
  clubName: string;
  wins: number;
  losses: number;
  draws: number;
  played: number;
  winRate: number | null;
}

export interface SessionUpset {
  matchId: string;
  winnerName: string;
  loserName: string;
  scoreLabel: string;
  /** The winning side's win rate across the whole session (0-1) -- lower than the loser's, which is what makes this an upset. */
  winnerSessionWinRate: number;
  loserSessionWinRate: number;
}

export interface SessionInsights {
  matchesPlayed: number;
  totalGoals: number;
  highestScoringMatch: RecordEntry | null;
  /** The best-record pair this session (by points, then the League Table's usual tiebreakers) -- null if no doubles matches were played. */
  winner: SessionPairRecord | null;
  /** The individual player with the best record this session. */
  mvp: SessionPairRecord | null;
  bestClub: SessionBestClub | null;
  biggestUpset: SessionUpset | null;
}

/** Sorted "playerIdA:playerIdB" -- must match leagueStandings.ts's own pair-id convention exactly, since biggestUpset looks up win rates by this same key in computePairStandings' output. */
function pairIdForSide(side: MatchSideSummary): string | null {
  if (side.players.length !== 2) return null;
  const [a, b] = [...side.players].sort((x, y) => x.id.localeCompare(y.id));
  return `${a!.id}:${b!.id}`;
}

function computeBestClub(matches: MatchSummary[]): SessionBestClub | null {
  const byClub = new Map<string, { wins: number; losses: number; draws: number }>();
  for (const match of matches) {
    for (const side of match.sides) {
      if (!side.club) continue;
      const entry = byClub.get(side.club.name) ?? { wins: 0, losses: 0, draws: 0 };
      if (side.result === "win") entry.wins++;
      else if (side.result === "loss") entry.losses++;
      else entry.draws++;
      byClub.set(side.club.name, entry);
    }
  }

  let best: SessionBestClub | null = null;
  for (const [clubName, e] of byClub) {
    const played = e.wins + e.losses + e.draws;
    const winRate = played === 0 ? null : e.wins / played;
    if (!best || (winRate ?? 0) > (best.winRate ?? 0) || ((winRate ?? 0) === (best.winRate ?? 0) && e.wins > best.wins)) {
      best = { clubName, wins: e.wins, losses: e.losses, draws: e.draws, played, winRate };
    }
  }
  return best;
}

/**
 * The match with the largest "surprise" margin: the losing side had a
 * better overall win rate across the whole session than the side that
 * beat them here. Doubles-only (the notion of a "side" record only makes
 * sense pair-by-pair) -- returns null if there's no such match (including
 * when every result went the way session form would predict).
 */
function computeBiggestUpset(matches: MatchSummary[]): SessionUpset | null {
  const doublesMatches = matches.filter((m) => m.match_type === "doubles");
  if (doublesMatches.length === 0) return null;

  const pairStandings = computePairStandings(doublesMatches);
  const winRateByPairId = new Map(pairStandings.map((row) => [row.id, row.winRate ?? 0]));

  let best: (SessionUpset & { margin: number }) | null = null;
  for (const match of doublesMatches) {
    const [s1, s2] = match.sides;
    if (s1.result === "draw") continue;
    const winnerSide = s1.result === "win" ? s1 : s2;
    const loserSide = s1.result === "win" ? s2 : s1;
    const winnerId = pairIdForSide(winnerSide);
    const loserId = pairIdForSide(loserSide);
    if (!winnerId || !loserId) continue;

    const winnerRate = winRateByPairId.get(winnerId) ?? 0;
    const loserRate = winRateByPairId.get(loserId) ?? 0;
    if (loserRate <= winnerRate) continue;

    const margin = loserRate - winnerRate;
    if (!best || margin > best.margin) {
      best = {
        matchId: match.id,
        winnerName: matchSideLabel(winnerSide.players.map((p) => p.display_name)),
        loserName: matchSideLabel(loserSide.players.map((p) => p.display_name)),
        scoreLabel: `${winnerSide.score}-${loserSide.score}`,
        winnerSessionWinRate: winnerRate,
        loserSessionWinRate: loserRate,
        margin,
      };
    }
  }

  if (!best) return null;
  const { margin: _margin, ...upset } = best;
  return upset;
}

/**
 * Session-scoped highlights for the Winners Stay summary screen --
 * everything here is derived purely from the matches actually played
 * during the session (see winners-stay.tsx's caller, which filters the
 * group's match history down to this session's time window and
 * participants before calling this). Nothing here mutates or reads
 * WinnersStaySession itself, so the core rotation engine (session.ts) is
 * completely untouched.
 */
export function computeSessionInsights(roster: MatchSidePlayer[], matches: MatchSummary[]): SessionInsights {
  const totalGoals = matches.reduce((sum, m) => sum + m.sides[0].score + m.sides[1].score, 0);
  const highestScoringMatch = computeHighestScoringMatchRecord(matches);

  const pairStandings = computePairStandings(matches);
  const winner = pairStandings[0] ? { name: pairStandings[0].name, wins: pairStandings[0].wins, losses: pairStandings[0].losses, draws: pairStandings[0].draws } : null;

  const individualStandings = computeIndividualStandings(roster, matches);
  const mvp = individualStandings[0] ? { name: individualStandings[0].name, wins: individualStandings[0].wins, losses: individualStandings[0].losses, draws: individualStandings[0].draws } : null;

  return {
    matchesPlayed: matches.length,
    totalGoals,
    highestScoringMatch,
    winner,
    mvp,
    bestClub: computeBestClub(matches),
    biggestUpset: computeBiggestUpset(matches),
  };
}
