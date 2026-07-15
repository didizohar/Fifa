import { useQuery } from "@tanstack/react-query";
import { fetchMatchDetail, fetchRecentMatches } from "../lib/matches";
import { matchKeys } from "../lib/queryClient";

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
