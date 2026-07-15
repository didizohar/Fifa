export type MatchType = "singles" | "doubles";
export type SideResult = "win" | "loss" | "draw";
export type GroupRole = "owner" | "admin" | "member";
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
}

export interface ClubVersion {
  id: string;
  club_id: string;
  game_version_id: string;
  star_rating: number;
  club: Club;
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
  singles_elo: number;
  doubles_elo: number;
  preferred_club_id: string | null;
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

// Minimal typed view of `record_match_and_apply_elo`'s RPC params, matching
// supabase/migrations/20260715120200_match_elo_rpc.sql
export interface RecordMatchRpcArgs {
  p_group_id: string;
  p_season_id: string | null;
  p_game_version_id: string;
  p_match_type: MatchType;
  p_is_overtime: boolean;
  p_is_penalties: boolean;
  p_screenshot_url: string | null;
  p_notes: string | null;
  p_elo_field: EloField;
  p_s1_club_version_id: string;
  p_s1_score: number;
  p_s1_penalty: number | null;
  p_s1_result: SideResult;
  p_s1_players: string[];
  p_s1_ratings_before: number[];
  p_s1_rating_after: number;
  p_s2_club_version_id: string;
  p_s2_score: number;
  p_s2_penalty: number | null;
  p_s2_result: SideResult;
  p_s2_players: string[];
  p_s2_ratings_before: number[];
  p_s2_rating_after: number;
}
