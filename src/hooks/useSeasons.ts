import { useQuery } from "@tanstack/react-query";
import { countMatchesForSeason, fetchSeasons } from "../lib/seasons";
import { seasonKeys } from "../lib/queryClient";

export function useSeasons(groupId: string | null) {
  return useQuery({
    queryKey: seasonKeys.list(groupId ?? ""),
    queryFn: () => fetchSeasons(groupId!),
    enabled: !!groupId,
  });
}

export function useSeasonMatchCount(seasonId: string | undefined) {
  return useQuery({
    queryKey: seasonKeys.matchCount(seasonId ?? ""),
    queryFn: () => countMatchesForSeason(seasonId!),
    enabled: !!seasonId,
  });
}
