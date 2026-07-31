import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";
import { recordClubUsage } from "../lib/clubRepository";

function storageKey(groupId: string): string {
  return `fc-rival:recentlyUsedClubs:${groupId}`;
}

function looksLikeIdList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

/** Per-group, device-local "last used" club id list -- shown before entering league selection, same local-only scope as useClubFavorites. */
export function useRecentlyUsedClubs(groupId: string | null) {
  const [recentIds, setRecentIdsState] = useState<string[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    if (!groupId) {
      setRecentIdsState([]);
      setIsHydrated(true);
      return;
    }

    let cancelled = false;
    setIsHydrated(false);

    AsyncStorage.getItem(storageKey(groupId))
      .then((stored) => {
        if (cancelled || !stored) return;
        try {
          const parsed: unknown = JSON.parse(stored);
          if (looksLikeIdList(parsed)) setRecentIdsState(parsed);
        } catch {
          // Non-critical -- start fresh.
        }
      })
      .finally(() => {
        if (!cancelled) setIsHydrated(true);
      });

    return () => {
      cancelled = true;
    };
  }, [groupId]);

  const recordUsage = useCallback(
    (clubId: string) => {
      const next = recordClubUsage(recentIds, clubId);
      setRecentIdsState(next);
      if (groupId) AsyncStorage.setItem(storageKey(groupId), JSON.stringify(next)).catch(() => {});
    },
    [recentIds, groupId],
  );

  return { recentIds, isHydrated, recordUsage };
}
