import { supabase } from "./supabase";
import type { EditMatchPayload, RecordMatchPayload, RecordMatchRpcArgs, UpdateMatchRpcArgs } from "./types/database";

/**
 * Records a new match as a single atomic database transaction
 * (record_match -- see supabase/migrations/20260728110000_remove_elo_from_match_recording.sql).
 * FC Rival's rankings are entirely Win-Rate-based; this no longer computes
 * or applies an Elo rating (the older record_match_and_apply_elo RPC that
 * did is retained, unmodified, for historical/rollback purposes, but the
 * app doesn't call it anymore).
 */
export async function processMatch(payload: RecordMatchPayload): Promise<string> {
  const [side1, side2] = payload.sides;

  const rpcArgs: RecordMatchRpcArgs = {
    p_group_id: payload.groupId,
    p_season_id: payload.seasonId ?? null,
    p_game_version_id: payload.gameVersionId,
    p_match_type: payload.matchType,
    p_is_overtime: payload.isOvertime,
    p_is_penalties: payload.isPenalties,
    p_screenshot_url: payload.screenshotUrl ?? null,
    p_notes: payload.notes ?? null,
    p_s1_club_version_id: side1.clubVersionId,
    p_s1_score: side1.score,
    p_s1_penalty: side1.penaltyScore ?? null,
    p_s1_result: side1.result,
    p_s1_players: side1.playerIds,
    p_s2_club_version_id: side2.clubVersionId,
    p_s2_score: side2.score,
    p_s2_penalty: side2.penaltyScore ?? null,
    p_s2_result: side2.result,
    p_s2_players: side2.playerIds,
  };

  const { data: matchId, error } = await supabase.rpc("record_match", rpcArgs);
  if (error) throw new Error(`Failed to record match: ${error.message}`);
  return matchId as string;
}

export type EditMatchErrorCode = "not_found" | "permission_denied" | "unknown";

/**
 * Thrown by processMatchEdit with a stable `code` instead of a raw Postgres
 * message, so the UI can show a localized message without ever displaying
 * Supabase internals to the user.
 */
export class EditMatchError extends Error {
  code: EditMatchErrorCode;
  constructor(code: EditMatchErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

function mapUpdateMatchErrorCode(pgErrorCode: string | undefined): EditMatchErrorCode {
  if (pgErrorCode === "P0002") return "not_found"; // matches update_match's "Match not found" RAISE
  if (pgErrorCode === "42501") return "permission_denied"; // "Not a member" / "Not authorized to edit this match"
  return "unknown";
}

/**
 * Edits an already-recorded match via the update_match RPC (see
 * supabase/migrations/20260728100000_update_match_rpc.sql) -- a single
 * atomic transaction that updates the match header, both sides, and the
 * player roster on each side.
 */
export async function processMatchEdit(payload: EditMatchPayload): Promise<string> {
  const [side1, side2] = payload.sides;

  const rpcArgs: UpdateMatchRpcArgs = {
    p_match_id: payload.matchId,
    p_group_id: payload.groupId,
    p_played_at: payload.playedAt,
    p_match_type: payload.matchType,
    p_is_overtime: payload.isOvertime,
    p_is_penalties: payload.isPenalties,
    p_notes: payload.notes ?? null,
    p_s1_club_version_id: side1.clubVersionId,
    p_s1_score: side1.score,
    p_s1_penalty: side1.penaltyScore ?? null,
    p_s1_result: side1.result,
    p_s1_players: side1.playerIds,
    p_s2_club_version_id: side2.clubVersionId,
    p_s2_score: side2.score,
    p_s2_penalty: side2.penaltyScore ?? null,
    p_s2_result: side2.result,
    p_s2_players: side2.playerIds,
  };

  const { data, error } = await supabase.rpc("update_match", rpcArgs);
  if (error) throw new EditMatchError(mapUpdateMatchErrorCode(error.code), error.message);
  return data as string;
}
