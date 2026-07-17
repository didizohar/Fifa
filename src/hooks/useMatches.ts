import { useQuery } from "@tanstack/react-query";
import { fetchMatchDetail, fetchPlayerRecordRows, fetchRecentMatches } from "../lib/matches";
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
