import AsyncStorage from "@react-native-async-storage/async-storage";
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

const DUPLICATE_KEY_CODE = "23505";
const MAX_INVITE_CODE_ATTEMPTS = 3;

export async function createGroup(name: string): Promise<string> {
  const defaultGameVersion = await fetchDefaultGameVersion();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  for (let attempt = 0; attempt < MAX_INVITE_CODE_ATTEMPTS; attempt++) {
    const { data, error } = await supabase.rpc("create_group", {
      p_name: name,
      p_invite_code: generateInviteCode(),
      p_default_game_version_id: defaultGameVersion?.id ?? null,
      p_timezone: timezone,
    });

    if (!error) return data as string;
    // A generated invite code collided with an existing group's -- vanishingly
    // rare (31^6 combinations), but retry with a fresh code rather than
    // surfacing a raw constraint-violation message.
    if (error.code !== DUPLICATE_KEY_CODE) throw new Error(`Failed to create group: ${error.message}`);
  }

  throw new Error("Failed to create group: couldn't generate a unique invite code. Please try again.");
}

export async function joinGroupByInviteCode(inviteCode: string): Promise<string> {
  const { data, error } = await supabase.rpc("join_group_by_invite_code", {
    p_invite_code: inviteCode.trim().toUpperCase(),
  });

  if (error) throw new Error(`Failed to join group: ${error.message}`);
  return data as string;
}

/**
 * True once `typed` (trimmed) exactly matches `actualName` (trimmed) -- the
 * same "type the name to confirm" pattern as GitHub's repo-delete flow.
 * Pulled out as its own pure function so the confirmation logic (case-
 * sensitive, whitespace-insensitive) is unit-testable without a live
 * mutation or a rendered screen.
 */
export function groupNameConfirmationMatches(actualName: string, typed: string): boolean {
  return typed.trim() === actualName.trim() && typed.trim().length > 0;
}

/**
 * Permanently deletes a group: every season, member, player, match, and
 * custom club, plus (server-side, inside the same RPC) every avatar file
 * in storage for that group -- see delete_group's own migration comment
 * (20260805120000_delete_group.sql) for the full traced cascade. The RPC
 * re-verifies confirmName server-side against the real group name, so a
 * client can't bypass the confirmation UI by calling this directly.
 */
export async function deleteGroup(groupId: string, confirmName: string): Promise<void> {
  const { error } = await supabase.rpc("delete_group", { p_group_id: groupId, p_confirm_name: confirmName });
  if (error) throw new Error(error.message);
}

// Every per-group, device-local AsyncStorage key this app writes -- must
// stay in sync with the storageKey() builder in each of these hooks. There
// is no single source of truth to import from (each hook's storageKey is a
// private local function, not part of its public API), so this list is
// intentionally exhaustive and explicit rather than derived.
const GROUP_SCOPED_STORAGE_KEY_PREFIXES = [
  "fc-rival:clubFavorites:",
  "fc-rival:leagueTableCardExpanded:",
  "fc-rival:lastOpenedLeague:",
  "fc-rival:includeNationalTeams:",
  "fc-rival:recentlyUsedClubs:",
  "fc-rival:winnersStaySession:",
  "fc-rival:winnersStaySessionHistory:",
] as const;

/** Clears every device-local preference/cache scoped to a deleted group, so no stale local data survives the group itself. */
export async function clearGroupLocalData(groupId: string): Promise<void> {
  await AsyncStorage.multiRemove(GROUP_SCOPED_STORAGE_KEY_PREFIXES.map((prefix) => `${prefix}${groupId}`));
}
