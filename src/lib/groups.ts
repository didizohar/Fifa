import { supabase } from "./supabase";
import type { GameVersion, GroupMembership } from "./types/database";

const INVITE_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I to avoid ambiguity

export function generateInviteCode(length = 6): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += INVITE_CODE_CHARS[Math.floor(Math.random() * INVITE_CODE_CHARS.length)];
  }
  return code;
}

export async function fetchMyGroups(userId: string): Promise<GroupMembership[]> {
  const { data, error } = await supabase
    .from("group_members")
    .select("role, group:groups(*)")
    .eq("user_id", userId);

  if (error) throw new Error(`Failed to load groups: ${error.message}`);
  return (data ?? []).map((row) => ({ role: row.role, group: row.group })) as unknown as GroupMembership[];
}

export async function fetchDefaultGameVersion(): Promise<GameVersion | null> {
  const { data, error } = await supabase
    .from("game_versions")
    .select("*")
    .eq("is_default", true)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Failed to load game version: ${error.message}`);
  return data;
}

export async function createGroup(name: string): Promise<string> {
  const defaultGameVersion = await fetchDefaultGameVersion();
  const inviteCode = generateInviteCode();

  const { data, error } = await supabase.rpc("create_group", {
    p_name: name,
    p_invite_code: inviteCode,
    p_default_game_version_id: defaultGameVersion?.id ?? null,
    p_timezone: "Asia/Jerusalem",
  });

  if (error) throw new Error(`Failed to create group: ${error.message}`);
  return data as string;
}

export async function joinGroupByInviteCode(inviteCode: string): Promise<string> {
  const { data, error } = await supabase.rpc("join_group_by_invite_code", {
    p_invite_code: inviteCode.trim().toUpperCase(),
  });

  if (error) throw new Error(`Failed to join group: ${error.message}`);
  return data as string;
}
