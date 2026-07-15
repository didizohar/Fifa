import { supabase } from "./supabase";
import type { PlayerProfile } from "./types/database";

export interface CreatePlayerInput {
  groupId: string;
  displayName: string;
  nickname?: string | null;
  customColor?: string;
}

// Fields a client is allowed to write. Deliberately excludes singles_elo /
// doubles_elo -- those are only ever changed via record_match_and_apply_elo
// (see trg_protect_elo_columns in supabase/migrations/20260715120300_rls_policies.sql).
// Never spread a full fetched PlayerProfile into an update call.
export interface UpdatePlayerInput {
  display_name?: string;
  nickname?: string | null;
  avatar_url?: string | null;
  custom_color?: string;
  preferred_club_id?: string | null;
  is_active?: boolean;
  deleted_at?: string | null;
}

const DUPLICATE_NAME_CODE = "23505";

export async function fetchPlayers(groupId: string, includeArchived = false): Promise<PlayerProfile[]> {
  let query = supabase.from("player_profiles").select("*").eq("group_id", groupId);
  if (!includeArchived) query = query.eq("is_active", true).is("deleted_at", null);

  const { data, error } = await query.order("singles_elo", { ascending: false });
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
