import { supabase } from "./supabase";
import type { Season } from "./types/database";

/** A sensible default name for a new season/league -- "Season {n+1}", counting every season (active or archived) the group has ever had, so names never collide even after several resets. */
export function suggestNextSeasonName(existingSeasons: readonly Season[]): string {
  return `Season ${existingSeasons.length + 1}`;
}

/**
 * Every competition season/league for a group, newest first -- the active
 * one (if any) always has is_active = true and end_date = null; archived
 * seasons have both end_date set and is_active = false. See
 * supabase/migrations/20260730090000_league_season_management.sql for the
 * "at most one active season per group" guarantee.
 */
export async function fetchSeasons(groupId: string): Promise<Season[]> {
  const { data, error } = await supabase.from("seasons").select("*").eq("group_id", groupId).order("start_date", { ascending: false });
  if (error) throw new Error(`Failed to load leagues: ${error.message}`);
  return data ?? [];
}

/** Counts matches tagged with a given season -- shown in the confirmation dialog before an admin resets or deletes a league, so the action is never a surprise. */
export async function countMatchesForSeason(seasonId: string): Promise<number> {
  const { count, error } = await supabase.from("matches").select("id", { count: "exact", head: true }).eq("season_id", seasonId);
  if (error) throw new Error(`Failed to count matches: ${error.message}`);
  return count ?? 0;
}

/**
 * Ends the group's current active season (if any) and starts a new one --
 * see start_new_season in the migration above. This doubles as "Reset
 * League": standings are always computed live from match history filtered
 * by date, so starting a new season boundary IS the reset.
 */
export async function startNewSeason(groupId: string, name: string): Promise<string> {
  const { data, error } = await supabase.rpc("start_new_season", { p_group_id: groupId, p_name: name });
  if (error) throw new Error(`Failed to start new season: ${error.message}`);
  return data as string;
}

/** Ends the active season without starting a new one -- a plain client-side update, since seasons_update RLS already restricts this to a group admin/owner. */
export async function archiveActiveSeason(seasonId: string): Promise<void> {
  const { error } = await supabase.from("seasons").update({ is_active: false, end_date: new Date().toISOString() }).eq("id", seasonId);
  if (error) throw new Error(`Failed to archive league: ${error.message}`);
}

/** Deletes a season record and unassigns (never deletes) any matches tagged with it -- see delete_season in the migration above. */
export async function deleteSeason(seasonId: string, groupId: string): Promise<void> {
  const { error } = await supabase.rpc("delete_season", { p_season_id: seasonId, p_group_id: groupId });
  if (error) throw new Error(`Failed to delete league: ${error.message}`);
}
