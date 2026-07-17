import { useQuery } from "@tanstack/react-query";
import {
  fetchEloHistory,
  fetchGroupMatchHistory,
  fetchMatchDetail,
  fetchPlayerMatchHistory,
  fetchPlayerRecordRows,
  fetchRecentMatches,
} from "../lib/matches";
import { matchKeys } from "../lib/queryClient";
import { computeAllRecordsFromRows } from "../lib/stats";

export function useMatches(groupId: string | null, limit = 20) {
  return useQuery({
    queryKey: [...matchKeys.list(groupId ?? ""), { limit }],
    queryFn: () => fetchRecentMatches(groupId!, limit),
    enabled: !!groupId,
  });
}

export function useMatch(matchId: string | undefined) {
  return useQuery({
    queryKey: matchKeys.detail(matchId ?? ""),
    queryFn: () => fetchMatchDetail(matchId!),
    enabled: !!matchId,
  });
}

/**
 * Win/loss/draw record for each of the given players, computed from their
 * complete match history (not a recency-limited list -- see
 * fetchPlayerRecordRows). Pass a stable-content array; the query key sorts
 * ids so callers don't need to memoize the array reference.
 */
export function usePlayerRecords(playerIds: string[]) {
  const sortedIds = [...playerIds].sort();
  return useQuery({
    queryKey: matchKeys.records(sortedIds),
    queryFn: async () => computeAllRecordsFromRows(sortedIds, await fetchPlayerRecordRows(sortedIds)),
    enabled: sortedIds.length > 0,
  });
}

/**
 * Full match history (uncapped) for one player -- the source data for
 * advanced/lifetime stats (goals, streaks, club performance, etc.), which
 * all need every match, not fetchMatches's recency-limited list.
 */
export function usePlayerMatchHistory(playerId: string | undefined) {
  return useQuery({
    queryKey: matchKeys.history(playerId ? [playerId] : []),
    queryFn: () => fetchPlayerMatchHistory([playerId!]),
    enabled: !!playerId,
  });
}

export function useEloHistory(playerId: string | undefined) {
  return useQuery({
    queryKey: matchKeys.eloHistory(playerId ?? ""),
    queryFn: () => fetchEloHistory(playerId!),
    enabled: !!playerId,
  });
}

/** Full, uncapped match history for a whole group -- source data for leaderboards. */
export function useGroupMatchHistory(groupId: string | null) {
  return useQuery({
    queryKey: matchKeys.groupHistory(groupId ?? ""),
    queryFn: () => fetchGroupMatchHistory(groupId!),
    enabled: !!groupId,
  });
}
