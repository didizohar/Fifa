import { useQuery } from "@tanstack/react-query";
import { fetchClubVersions } from "../lib/clubs";

export function useClubVersions(gameVersionId: string | null | undefined) {
  return useQuery({
    queryKey: ["clubVersions", gameVersionId ?? ""],
    queryFn: () => fetchClubVersions(gameVersionId!),
    enabled: !!gameVersionId,
  });
}
