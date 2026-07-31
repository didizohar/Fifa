export type MatchType = "singles" | "doubles";
export type SideResult = "win" | "loss" | "draw";
export type GroupRole = "owner" | "admin" | "member";

/**
 * Legacy: identifies which of PlayerProfile's two Elo columns a match type
 * writes to. Elo is no longer an active product feature (rankings are
 * entirely Win-Rate-based, see src/lib/stats.ts) -- record_match no longer
 * computes or applies a rating, so nothing in the app currently produces a
 * value of this type. Kept only because the legacy singles_elo/doubles_elo
 * columns and the historical record_match_and_apply_elo RPC (unmodified,
 * still callable) still exist and are typed against it.
 */
export type EloField = "singles_elo" | "doubles_elo";

export interface Group {
  id: string;
  name: string;
  logo_url: string | null;
  invite_code: string;
  default_game_version_id: string | null;
  timezone: string;
  created_at: string;
}

export interface GroupMembership {
  group: Group;
  role: GroupRole;
}

export interface GameVersion {
  id: string;
  name: string;
  is_default: boolean;
}

export interface Club {
  id: string;
  name: string;
  country: string | null;
  /** e.g. "Premier League", "National Teams" -- freeform, not a fixed enum, so a new league only ever needs a data row, never a UI change. Null for older/incomplete rows. */
  league: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  logo_url: string | null;
  /** Null for a built-in club (shared, service-role-managed). Set to the owning group's id for a custom club. */
  group_id: string | null;
  notes: string | null;
  deleted_at: string | null;
}

export interface ClubVersion {
  id: string;
  club_id: string;
  game_version_id: string;
  star_rating: number;
  club: Club;
}

export interface CreateCustomClubInput {
  groupId: string;
  gameVersionId: string;
  name: string;
  league?: string | null;
  country?: string | null;
  starRating?: number;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  notes?: string | null;
}

export interface UpdateCustomClubInput {
  name?: string;
  league?: string | null;
  country?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  notes?: string | null;
}

export interface PlayerProfile {
  id: string;
  group_id: string;
  linked_user_id: string | null;
  display_name: string;
  nickname: string | null;
  avatar_url: string | null;
  custom_color: string;
  is_active: boolean;
  /**
   * Legacy: no longer written by record_match (see EloField's docstring).
   * Retained on the type/column because dropping it is a separate, higher-
   * risk migration than simply not writing to it -- not because anything
   * still reads it for ranking. Rankings are Win-Rate-based (stats.ts).
   */
  singles_elo: number;
  /** Legacy -- see singles_elo. */
  doubles_elo: number;
  preferred_club_id: string | null;
  /** Optional manual 1-5 rating used only to balance draw teams/clubs -- never Elo, never shown as a performance score. */
  draw_level: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface MatchSideInput {
  clubVersionId: string;
  score: number;
  penaltyScore?: number | null;
  result: SideResult;
  playerIds: string[];
}

export interface RecordMatchPayload {
  groupId: string;
  seasonId?: string | null;
  gameVersionId: string;
  matchType: MatchType;
  isOvertime: boolean;
  isPenalties: boolean;
  screenshotUrl?: string | null;
  notes?: string | null;
  penaltyWinnerSide?: 1 | 2;
  sides: [MatchSideInput, MatchSideInput];
}

// Minimal typed view of `record_match`'s RPC params, matching
// supabase/migrations/20260728110000_remove_elo_from_match_recording.sql
export interface RecordMatchRpcArgs {
  p_group_id: string;
  p_season_id: string | null;
  p_game_version_id: string;
  p_match_type: MatchType;
  p_is_overtime: boolean;
  p_is_penalties: boolean;
  p_screenshot_url: string | null;
  p_notes: string | null;
  p_s1_club_version_id: string;
  p_s1_score: number;
  p_s1_penalty: number | null;
  p_s1_result: SideResult;
  p_s1_players: string[];
  p_s2_club_version_id: string;
  p_s2_score: number;
  p_s2_penalty: number | null;
  p_s2_result: SideResult;
  p_s2_players: string[];
}

export interface EditMatchPayload {
  matchId: string;
  groupId: string;
  /** ISO 8601 -- becomes the match's played_at. */
  playedAt: string;
  matchType: MatchType;
  isOvertime: boolean;
  isPenalties: boolean;
  notes?: string | null;
  penaltyWinnerSide?: 1 | 2;
  sides: [MatchSideInput, MatchSideInput];
}

// Minimal typed view of `update_match`'s RPC params, matching
// supabase/migrations/20260728100000_update_match_rpc.sql
export interface UpdateMatchRpcArgs {
  p_match_id: string;
  p_group_id: string;
  p_played_at: string;
  p_match_type: MatchType;
  p_is_overtime: boolean;
  p_is_penalties: boolean;
  p_notes: string | null;
  p_s1_club_version_id: string;
  p_s1_score: number;
  p_s1_penalty: number | null;
  p_s1_result: SideResult;
  p_s1_players: string[];
  p_s2_club_version_id: string;
  p_s2_score: number;
  p_s2_penalty: number | null;
  p_s2_result: SideResult;
  p_s2_players: string[];
}

/**
 * A group-scoped competition "league"/season -- distinct from Club.league
 * (a built-in classification like "Premier League"). Backed by the
 * `seasons` table, which has existed with full RLS since the initial
 * schema; matches.season_id already references it. Exactly one row per
 * group may have is_active = true at a time (enforced by start_new_season
 * and a partial unique index).
 */
export interface Season {
  id: string;
  group_id: string;
  name: string;
  is_active: boolean;
  start_date: string;
  end_date: string | null;
  created_at: string;
}
