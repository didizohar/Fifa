export type MatchType = "singles" | "doubles";

export interface EloResult {
  side1New: number;
  side2New: number;
}

const K_FACTOR = 32;
const DRAW_SCORE = 0.5;
// A shootout only decides a match that was level after regulation/overtime,
// so the reward/penalty is compressed toward a draw instead of a full 1/0.
const PENALTY_WIN_SCORE = 0.6;
const PENALTY_LOSS_SCORE = 0.4;

function average(elos: number[]): number {
  return elos.reduce((sum, elo) => sum + elo, 0) / elos.length;
}

function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
}

// Standard "World Football Elo" goal-difference scaling: bigger wins move
// the rating further, but with diminishing effect.
function goalDifferenceMultiplier(goalDifference: number): number {
  const gd = Math.abs(goalDifference);
  if (gd <= 1) return 1;
  if (gd === 2) return 1.5;
  return (11 + gd) / 8;
}

/**
 * @param penaltyWinnerSide required when isPenalties is true and score1 === score2
 *   (a shootout can only decide a match that finished level; score1/score2 alone
 *   can't tell us who won it).
 */
export function calculateNewRatings(
  matchType: MatchType,
  side1Elos: number[],
  side2Elos: number[],
  score1: number,
  score2: number,
  isPenalties: boolean,
  penaltyWinnerSide?: 1 | 2,
): EloResult {
  void matchType; // reserved for future per-mode tuning; same K-factor today

  const rating1 = average(side1Elos);
  const rating2 = average(side2Elos);
  const expected1 = expectedScore(rating1, rating2);
  const expected2 = 1 - expected1;

  let score1Result: number;
  let multiplier = 1;

  if (score1 === score2) {
    if (isPenalties) {
      if (penaltyWinnerSide === undefined) {
        throw new Error(
          "penaltyWinnerSide is required when isPenalties is true and the score is level",
        );
      }
      score1Result = penaltyWinnerSide === 1 ? PENALTY_WIN_SCORE : PENALTY_LOSS_SCORE;
    } else {
      score1Result = DRAW_SCORE;
    }
  } else {
    score1Result = score1 > score2 ? 1 : 0;
    multiplier = goalDifferenceMultiplier(score1 - score2);
  }
  const score2Result = 1 - score1Result;

  return {
    side1New: Math.round(rating1 + K_FACTOR * multiplier * (score1Result - expected1)),
    side2New: Math.round(rating2 + K_FACTOR * multiplier * (score2Result - expected2)),
  };
}
