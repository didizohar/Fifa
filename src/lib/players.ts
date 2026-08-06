import type { RotationPlayer } from "./rotation/types";
import { supabase } from "./supabase";
import type { PlayerProfile } from "./types/database";

export interface PickablePlayer {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  color: string;
}

/** Minimal shape toPickablePlayer needs -- satisfied by both a full PlayerProfile and the lighter MatchSidePlayer embedded in match rows. */
interface DisplayableProfile {
  id: string;
  display_name: string;
  avatar_url: string | null;
  custom_color: string;
}

/** Projects a player-ish record down to what PlayerPicker (and similar player-choosing UI) needs. */
export function toPickablePlayer(player: DisplayableProfile): PickablePlayer {
  return { id: player.id, displayName: player.display_name, avatarUrl: player.avatar_url, color: player.custom_color };
}

/** Projects a player-ish record down to what the Winners Stay rotation engine needs -- same DisplayableProfile input as toPickablePlayer, just kept snake_case since that's RotationPlayer's own shape. Single conversion shared by every screen/card that feeds a roster into the rotation engine (winners-stay.tsx, the Dashboard's Quick Match card). */
export function toRotationPlayer(player: DisplayableProfile): RotationPlayer {
  return { id: player.id, display_name: player.display_name, avatar_url: player.avatar_url, custom_color: player.custom_color };
}

export interface CreatePlayerInput {
  groupId: string;
  displayName: string;
  nickname?: string | null;
  customColor?: string;
}

// Fields a client is allowed to write. Deliberately excludes singles_elo /
// doubles_elo -- those are legacy columns no longer written by any current
// RPC, but still protected by trg_protect_elo_columns (see
// supabase/migrations/20260715120300_rls_policies.sql) as a belt-and-braces
// guard against a client ever trying to write them directly.
// Never spread a full fetched PlayerProfile into an update call.
export interface UpdatePlayerInput {
  display_name?: string;
  nickname?: string | null;
  avatar_url?: string | null;
  custom_color?: string;
  preferred_club_id?: string | null;
  is_active?: boolean;
  deleted_at?: string | null;
  draw_level?: number | null;
}

const DUPLICATE_NAME_CODE = "23505";

/**
 * Alphabetical by display name -- a neutral roster order for list/picker
 * screens. Not a ranking: Leaderboards/Home compute their own Win-Rate
 * ranking from match history (computeWinRateLeaderboard/computeWinRateRank
 * in stats.ts), independent of the order this query returns.
 */
export async function fetchPlayers(groupId: string, includeArchived = false): Promise<PlayerProfile[]> {
  let query = supabase.from("player_profiles").select("*").eq("group_id", groupId);
  if (!includeArchived) query = query.eq("is_active", true).is("deleted_at", null);

  const { data, error } = await query.order("display_name", { ascending: true });
  if (error) throw new Error(`Failed to load players: ${error.message}`);
  return data ?? [];
}

export async function fetchPlayer(playerId: string): Promise<PlayerProfile> {
  const { data, error } = await supabase.from("player_profiles").select("*").eq("id", playerId).single();
  if (error) throw new Error(`Failed to load player: ${error.message}`);
  return data;
}

export async function createPlayer(input: CreatePlayerInput): Promise<PlayerProfile> {
  const { data, error } = await supabase
    .from("player_profiles")
    .insert({
      group_id: input.groupId,
      display_name: input.displayName,
      nickname: input.nickname ?? null,
      custom_color: input.customColor ?? "#3EE07A",
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === DUPLICATE_NAME_CODE) {
      throw new Error("A player with that name already exists in this group.");
    }
    throw new Error(`Failed to add player: ${error.message}`);
  }
  return data;
}

export async function updatePlayer(playerId: string, patch: UpdatePlayerInput): Promise<PlayerProfile> {
  const { data, error } = await supabase
    .from("player_profiles")
    .update(patch)
    .eq("id", playerId)
    .select("*")
    .single();

  if (error) {
    if (error.code === DUPLICATE_NAME_CODE) {
      throw new Error("A player with that name already exists in this group.");
    }
    throw new Error(`Failed to update player: ${error.message}`);
  }
  return data;
}

export async function archivePlayer(playerId: string): Promise<void> {
  const { error } = await supabase
    .from("player_profiles")
    .update({ is_active: false, deleted_at: new Date().toISOString() } satisfies UpdatePlayerInput)
    .eq("id", playerId);

  if (error) throw new Error(`Failed to archive player: ${error.message}`);
}
