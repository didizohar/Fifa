import { useQuery } from "@tanstack/react-query";
import { fetchClubVersions, fetchGameVersions } from "../lib/clubs";
import { clubKeys } from "../lib/queryClient";

export function useClubVersions(gameVersionId: string | null | undefined) {
  return useQuery({
    queryKey: clubKeys.versions(gameVersionId ?? ""),
    queryFn: () => fetchClubVersions(gameVersionId!),
    enabled: !!gameVersionId,
  });
}

export function useGameVersions() {
  return useQuery({
    queryKey: clubKeys.gameVersions,
    queryFn: fetchGameVersions,
  });
}
