import { supabase } from "./supabase";
import { calculateNewRatings } from "./elo";
import type { EditMatchPayload, EloField, PlayerProfile, RecordMatchPayload, RecordMatchRpcArgs, UpdateMatchRpcArgs } from "./types/database";

const MAX_ELO_CONCURRENCY_RETRIES = 3;
// Postgres SQLSTATE for the serialization_failure raised by
// record_match_and_apply_elo when a player's rating changed between our
// read and the RPC's write (see supabase/migrations/20260715120200_match_elo_rpc.sql).
const ELO_CONCURRENCY_SQLSTATE = "40001";

function eloFieldFor(matchType: RecordMatchPayload["matchType"]): EloField {
  return matchType === "singles" ? "singles_elo" : "doubles_elo";
}

async function fetchCurrentRatings(
  playerIds: string[],
  eloField: EloField,
): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from("player_profiles")
    .select("id, singles_elo, doubles_elo")
    .in("id", playerIds);

  if (error) throw new Error(`Failed to load player ratings: ${error.message}`);

  const ratings = new Map<string, number>();
  for (const profile of (data ?? []) as Pick<PlayerProfile, "id" | "singles_elo" | "doubles_elo">[]) {
    ratings.set(profile.id, profile[eloField]);
  }
  for (const id of playerIds) {
    if (!ratings.has(id)) throw new Error(`Player profile not found: ${id}`);
  }
  return ratings;
}

/**
 * Records a match and applies the resulting Elo change to every player, as
 * a single atomic database transaction (record_match_and_apply_elo). If
 * another match for one of these players is written concurrently, the RPC
 * detects the stale rating and aborts the whole transaction; we re-read
 * the ratings and retry rather than surfacing a spurious failure.
 */
export async function processMatchAndElo(payload: RecordMatchPayload): Promise<string> {
  const eloField = eloFieldFor(payload.matchType);
  const [side1, side2] = payload.sides;
  const allPlayerIds = [...side1.playerIds, ...side2.playerIds];

  let lastError: Error | undefined;

  for (let attempt = 0; attempt < MAX_ELO_CONCURRENCY_RETRIES; attempt++) {
    const ratings = await fetchCurrentRatings(allPlayerIds, eloField);

    const side1Elos = side1.playerIds.map((id) => ratings.get(id)!);
    const side2Elos = side2.playerIds.map((id) => ratings.get(id)!);

    const { side1New, side2New } = calculateNewRatings(
      payload.matchType,
      side1Elos,
      side2Elos,
      side1.score,
      side2.score,
      payload.isPenalties,
      payload.penaltyWinnerSide,
    );

    const rpcArgs: RecordMatchRpcArgs = {
      p_group_id: payload.groupId,
      p_season_id: payload.seasonId ?? null,
      p_game_version_id: payload.gameVersionId,
      p_match_type: payload.matchType,
      p_is_overtime: payload.isOvertime,
      p_is_penalties: payload.isPenalties,
      p_screenshot_url: payload.screenshotUrl ?? null,
      p_notes: payload.notes ?? null,
      p_elo_field: eloField,
      p_s1_club_version_id: side1.clubVersionId,
      p_s1_score: side1.score,
      p_s1_penalty: side1.penaltyScore ?? null,
      p_s1_result: side1.result,
      p_s1_players: side1.playerIds,
      p_s1_ratings_before: side1Elos,
      p_s1_rating_after: side1New,
      p_s2_club_version_id: side2.clubVersionId,
      p_s2_score: side2.score,
      p_s2_penalty: side2.penaltyScore ?? null,
      p_s2_result: side2.result,
      p_s2_players: side2.playerIds,
      p_s2_ratings_before: side2Elos,
      p_s2_rating_after: side2New,
    };

    const { data: matchId, error } = await supabase.rpc("record_match_and_apply_elo", rpcArgs);

    if (!error) return matchId as string;

    if (error.code !== ELO_CONCURRENCY_SQLSTATE) {
      throw new Error(`Failed to record match: ${error.message}`);
    }
    lastError = new Error(`Elo concurrency conflict: ${error.message}`);
  }

  throw lastError ?? new Error("Failed to record match after Elo concurrency retries");
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
 * player roster on each side. Does not touch Elo ratings (see that
 * migration's header comment for why).
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
