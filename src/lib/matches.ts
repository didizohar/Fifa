import { supabase } from "./supabase";
import type { MatchType, SideResult } from "./types/database";

export interface MatchSidePlayer {
  id: string;
  display_name: string;
  avatar_url: string | null;
  custom_color: string;
}

export interface MatchSideSummary {
  id: string;
  side_number: 1 | 2;
  score: number;
  penalty_score: number | null;
  result: SideResult;
  club: { id: string; name: string } | null;
  players: MatchSidePlayer[];
}

export interface MatchSummary {
  id: string;
  match_type: MatchType;
  is_overtime: boolean;
  is_penalties: boolean;
  notes: string | null;
  played_at: string;
  sides: [MatchSideSummary, MatchSideSummary];
}

const MATCH_SELECT = `
  id, match_type, is_overtime, is_penalties, notes, played_at,
  match_sides (
    id, side_number, score, penalty_score, result,
    club_version:club_versions ( club:clubs ( id, name ) ),
    match_players ( player:player_profiles ( id, display_name, avatar_url, custom_color ) )
  )
`;

// Raw shape returned by Supabase's nested-select for MATCH_SELECT, before
// being normalized into MatchSummary.
interface RawMatch {
  id: string;
  match_type: MatchType;
  is_overtime: boolean;
  is_penalties: boolean;
  notes: string | null;
  played_at: string;
  match_sides: {
    id: string;
    side_number: number;
    score: number;
    penalty_score: number | null;
    result: SideResult;
    club_version: { club: { id: string; name: string } | null } | null;
    match_players: { player: MatchSidePlayer | null }[];
  }[];
}

function normalizeMatch(raw: RawMatch): MatchSummary | null {
  const sides = [...raw.match_sides].sort((a, b) => a.side_number - b.side_number);
  if (sides.length !== 2) return null;

  const [s1, s2] = sides;
  const toSide = (s: RawMatch["match_sides"][number]): MatchSideSummary => ({
    id: s.id,
    side_number: s.side_number as 1 | 2,
    score: s.score,
    penalty_score: s.penalty_score,
    result: s.result,
    club: s.club_version?.club ?? null,
    players: s.match_players.map((mp) => mp.player).filter((p): p is MatchSidePlayer => p !== null),
  });

  return {
    id: raw.id,
    match_type: raw.match_type,
    is_overtime: raw.is_overtime,
    is_penalties: raw.is_penalties,
    notes: raw.notes,
    played_at: raw.played_at,
    sides: [toSide(s1!), toSide(s2!)],
  };
}

export async function fetchRecentMatches(groupId: string, limit = 20): Promise<MatchSummary[]> {
  const { data, error } = await supabase
    .from("matches")
    .select(MATCH_SELECT)
    .eq("group_id", groupId)
    .order("played_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to load matches: ${error.message}`);
  return ((data ?? []) as unknown as RawMatch[]).map(normalizeMatch).filter((m): m is MatchSummary => m !== null);
}

/**
 * Every match ever played in a group, uncapped -- unlike fetchRecentMatches
 * (which caps for dashboard/history previews), leaderboards need the whole
 * group history to rank fairly across a player's full career.
 */
export async function fetchGroupMatchHistory(groupId: string): Promise<MatchSummary[]> {
  const { data, error } = await supabase
    .from("matches")
    .select(MATCH_SELECT)
    .eq("group_id", groupId)
    .order("played_at", { ascending: false });

  if (error) throw new Error(`Failed to load group match history: ${error.message}`);
  return ((data ?? []) as unknown as RawMatch[]).map(normalizeMatch).filter((m): m is MatchSummary => m !== null);
}

export async function fetchMatchDetail(matchId: string): Promise<MatchSummary> {
  const { data, error } = await supabase.from("matches").select(MATCH_SELECT).eq("id", matchId).single();
  if (error) throw new Error(`Failed to load match: ${error.message}`);
  const normalized = normalizeMatch(data as unknown as RawMatch);
  if (!normalized) throw new Error("Match data is incomplete.");
  return normalized;
}

/**
 * Every match a given set of players has ever taken part in, as full
 * MatchSummary objects (both sides, scores, clubs, rosters) -- unlike
 * fetchRecentMatches this is uncapped, since lifetime/advanced stats must
 * reflect a player's whole history, not just a recency window. Two-step
 * fetch (match ids first, then full match rows) because Supabase's nested
 * embed filters restrict which *nested* rows come back, not which parent
 * rows match -- a single query can't cleanly say "only matches where one of
 * these players appears on either side."
 */
export async function fetchPlayerMatchHistory(playerIds: string[]): Promise<MatchSummary[]> {
  if (playerIds.length === 0) return [];

  const { data: idRows, error: idError } = await supabase
    .from("match_players")
    .select("match_side:match_sides(match_id)")
    .in("player_id", playerIds);

  if (idError) throw new Error(`Failed to load match history: ${idError.message}`);

  const matchIds = [
    ...new Set(
      ((idRows ?? []) as unknown as { match_side: { match_id: string } | null }[])
        .map((row) => row.match_side?.match_id)
        .filter((id): id is string => !!id),
    ),
  ];
  if (matchIds.length === 0) return [];

  const { data, error } = await supabase
    .from("matches")
    .select(MATCH_SELECT)
    .in("id", matchIds)
    .order("played_at", { ascending: false });

  if (error) throw new Error(`Failed to load match history: ${error.message}`);
  return ((data ?? []) as unknown as RawMatch[]).map(normalizeMatch).filter((m): m is MatchSummary => m !== null);
}

export interface EloHistoryEntry {
  match_id: string;
  match_type: MatchType;
  rating_before: number;
  rating_after: number;
  recorded_at: string;
}

/** Full rating timeline for one player, oldest first -- source for Elo progression charts. */
export async function fetchEloHistory(playerId: string): Promise<EloHistoryEntry[]> {
  const { data, error } = await supabase
    .from("elo_history")
    .select("match_id, match_type, rating_before, rating_after, recorded_at")
    .eq("player_id", playerId)
    .order("recorded_at", { ascending: true });

  if (error) throw new Error(`Failed to load Elo history: ${error.message}`);
  return (data ?? []) as EloHistoryEntry[];
}

export interface PlayerRecordRow {
  player_id: string;
  result: SideResult;
}

interface RawPlayerRecordRow {
  player_id: string;
  match_side: { result: SideResult } | null;
}

/**
 * Every match_players row (join-through-match_sides result only) for the
 * given players -- no recency cap, unlike fetchRecentMatches. Used for
 * win/loss/draw records, which must reflect a player's whole history, not
 * just whatever window a recent-matches list happens to be showing. Lean
 * payload (no club/player nesting) since only the result enum is needed.
 */
export async function fetchPlayerRecordRows(playerIds: string[]): Promise<PlayerRecordRow[]> {
  if (playerIds.length === 0) return [];

  const { data, error } = await supabase
    .from("match_players")
    .select("player_id, match_side:match_sides(result)")
    .in("player_id", playerIds);

  if (error) throw new Error(`Failed to load player records: ${error.message}`);

  return ((data ?? []) as unknown as RawPlayerRecordRow[])
    .filter((row): row is RawPlayerRecordRow & { match_side: { result: SideResult } } => row.match_side !== null)
    .map((row) => ({ player_id: row.player_id, result: row.match_side.result }));
}
