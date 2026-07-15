import type { MatchType, SideResult } from "../types/database";

export interface MatchSideDraft {
  clubVersionId: string | null;
  playerIds: string[];
  score: number;
}

export interface MatchFormDraft {
  matchType: MatchType;
  side1: MatchSideDraft;
  side2: MatchSideDraft;
  isPenalties: boolean;
  penaltyScore1: number | null;
  penaltyScore2: number | null;
}

export interface ComputedMatchResult {
  side1Result: SideResult;
  side2Result: SideResult;
  penaltyWinnerSide?: 1 | 2;
}

export type MatchFormValidation =
  | ({ ok: true } & ComputedMatchResult)
  | { ok: false; errors: string[] };

const REQUIRED_PLAYERS: Record<MatchType, number> = { singles: 1, doubles: 2 };

/**
 * Shared by the single singles+doubles record-match screen. Every rule
 * here corresponds either to a DB CHECK constraint (score >= 0) or to a
 * correctness gap the schema/RPC leaves entirely to the client -- see
 * supabase/migrations/20260715120200_match_elo_rpc.sql and elo.ts, which
 * throws if isPenalties is true, scores are level, and no
 * penaltyWinnerSide is supplied.
 */
export function validateMatchForm(draft: MatchFormDraft, groupPlayerIds: string[]): MatchFormValidation {
  const errors: string[] = [];
  const requiredCount = REQUIRED_PLAYERS[draft.matchType];
  const validPlayerIds = new Set(groupPlayerIds);

  for (const [label, side] of [["Side 1", draft.side1], ["Side 2", draft.side2]] as const) {
    if (side.playerIds.length !== requiredCount) {
      errors.push(`${label} needs exactly ${requiredCount} player${requiredCount > 1 ? "s" : ""}.`);
    }
    if (new Set(side.playerIds).size !== side.playerIds.length) {
      errors.push(`${label} has the same player selected twice.`);
    }
    if (side.playerIds.some((id) => !validPlayerIds.has(id))) {
      errors.push(`${label} has a player who isn't on this group's roster.`);
    }
    if (!side.clubVersionId) {
      errors.push(`${label} needs a club.`);
    }
    if (!Number.isInteger(side.score) || side.score < 0) {
      errors.push(`${label}'s score must be zero or a positive whole number.`);
    }
  }

  const overlap = draft.side1.playerIds.filter((id) => draft.side2.playerIds.includes(id));
  if (overlap.length > 0) {
    errors.push("A player can't be on both sides of the same match.");
  }

  const scoresLevel = draft.side1.score === draft.side2.score;

  if (draft.isPenalties && !scoresLevel) {
    errors.push("Penalties only apply when the score is level.");
  }

  let penaltyWinnerSide: 1 | 2 | undefined;
  if (draft.isPenalties && scoresLevel) {
    const { penaltyScore1, penaltyScore2 } = draft;
    if (penaltyScore1 === null || penaltyScore2 === null) {
      errors.push("Enter both penalty shootout scores.");
    } else if (!Number.isInteger(penaltyScore1) || !Number.isInteger(penaltyScore2) || penaltyScore1 < 0 || penaltyScore2 < 0) {
      errors.push("Penalty scores must be zero or a positive whole number.");
    } else if (penaltyScore1 === penaltyScore2) {
      errors.push("The penalty shootout needs a winner -- scores can't match.");
    } else {
      penaltyWinnerSide = penaltyScore1 > penaltyScore2 ? 1 : 2;
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  let side1Result: SideResult;
  let side2Result: SideResult;

  if (!scoresLevel) {
    side1Result = draft.side1.score > draft.side2.score ? "win" : "loss";
    side2Result = side1Result === "win" ? "loss" : "win";
  } else if (draft.isPenalties) {
    side1Result = penaltyWinnerSide === 1 ? "win" : "loss";
    side2Result = penaltyWinnerSide === 1 ? "loss" : "win";
  } else {
    side1Result = "draw";
    side2Result = "draw";
  }

  return { ok: true, side1Result, side2Result, penaltyWinnerSide };
}
