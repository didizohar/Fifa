import { supabase } from "./supabase";
import type { RecordMatchPayload } from "./types/database";
import type { WinnersStaySession } from "./rotation/types";

export interface ActiveSessionRow {
  session: WinnersStaySession;
  version: number;
}

/** True for a well-formed row, same lightweight shape check the old AsyncStorage hook used -- rejects garbage instead of handing a screen a half-formed object. */
function looksLikeSession(value: unknown): value is WinnersStaySession {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === "string" && typeof v.groupId === "string" && typeof v.roundNumber === "number" && (v.status === "active" || v.status === "completed");
}

/** Reads the group's current shared active session, if any. Null when no row exists (no active session) -- RLS (is_group_member) means a non-member never sees a row here regardless. */
export async function fetchActiveSession(groupId: string): Promise<ActiveSessionRow | null> {
  const { data, error } = await supabase.from("active_sessions").select("session, version").eq("group_id", groupId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  if (!looksLikeSession(data.session)) throw new Error("corrupted_session");
  return { session: data.session, version: data.version };
}

export type WriteSessionResult = { ok: true; version: number } | { ok: "stale" };

/**
 * Starts a brand-new shared session (INSERT at version 0). If another
 * member's device already started one for this group in the meantime, the
 * table's group_id PRIMARY KEY makes the second INSERT fail with a unique
 * violation (Postgres code 23505) instead of silently creating a second
 * session -- the caller should treat that exactly like `{ ok: "stale" }`
 * and fetch the session that actually won.
 */
export async function startActiveSession(groupId: string, session: WinnersStaySession): Promise<WriteSessionResult> {
  const { error } = await supabase.from("active_sessions").insert({ group_id: groupId, session, version: 0 });
  if (error) {
    if (error.code === "23505") return { ok: "stale" };
    throw new Error(error.message);
  }
  return { ok: true, version: 0 };
}

/**
 * Writes a new session state for a rotation-only mutation (accept/redraw/
 * undo a pending rotation, edit the waiting queue) -- anything that never
 * inserts a match. A single `UPDATE ... WHERE version = expectedVersion` is
 * already atomic in Postgres: if another member's write got there first,
 * this WHERE clause matches zero rows and `{ ok: "stale" }` is returned so
 * the caller can refetch and converge, instead of silently overwriting a
 * newer state or throwing. Recording a MATCH must go through
 * recordMatchAndAdvanceSession instead -- see that function's own comment.
 */
export async function updateActiveSession(groupId: string, expectedVersion: number, nextSession: WinnersStaySession): Promise<WriteSessionResult> {
  const { data, error } = await supabase
    .from("active_sessions")
    .update({ session: nextSession, version: expectedVersion + 1 })
    .eq("group_id", groupId)
    .eq("version", expectedVersion)
    .select("version");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return { ok: "stale" };
  return { ok: true, version: expectedVersion + 1 };
}

/** Ends a session for every member at once -- deletes the shared row (same meaning `session === null` already had locally: no row = no active session). */
export async function endActiveSession(groupId: string): Promise<void> {
  const { error } = await supabase.from("active_sessions").delete().eq("group_id", groupId);
  if (error) throw new Error(error.message);
}

export interface RecordMatchAndAdvanceSessionArgs {
  payload: RecordMatchPayload;
  expectedVersion: number;
  /**
   * The full new session state, already computed locally via the existing
   * (unchanged) advanceSessionAfterMatch/acceptPendingRotation pure
   * functions. lastRecordedMatchId can be anything here -- the server
   * overwrites it with the real, just-inserted match id inside the same
   * transaction, since the client can't know that id in advance.
   */
  nextSession: WinnersStaySession;
}

export type RecordMatchAndAdvanceSessionResult = { ok: true; matchId: string; version: number } | { ok: "stale" } | { ok: "no_session" };

/**
 * Atomically records a match AND advances its Winners Stay session in one
 * database transaction (record_match_and_advance_session, see
 * supabase/migrations/20260811164500_shared_active_sessions.sql) -- the
 * concurrency-safe replacement for separately calling record_match and then
 * writing the new session state as two unprotected steps. A stale
 * submission (someone else already completed this round) is rejected
 * atomically: no match row is inserted, no session is advanced, no
 * duplicate stats/Elo/history -- the caller should refetch and show the
 * user the current state instead.
 */
export async function recordMatchAndAdvanceSession({ payload, expectedVersion, nextSession }: RecordMatchAndAdvanceSessionArgs): Promise<RecordMatchAndAdvanceSessionResult> {
  const [side1, side2] = payload.sides;
  const { data, error } = await supabase.rpc("record_match_and_advance_session", {
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
    p_expected_version: expectedVersion,
    p_next_session: nextSession,
  });
  if (error) {
    if (error.code === "P0001") return { ok: "stale" };
    if (error.code === "P0002") return { ok: "no_session" };
    throw new Error(error.message);
  }
  const row = (Array.isArray(data) ? data[0] : data) as { match_id: string; new_version: number };
  return { ok: true, matchId: row.match_id, version: row.new_version };
}
