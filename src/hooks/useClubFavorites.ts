import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";

function storageKey(groupId: string): string {
  return `fc-rival:clubFavorites:${groupId}`;
}

function looksLikeIdList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

/**
 * Per-group, device-local list of favorited club ids -- same hydrate-on-
 * mount / write-through AsyncStorage pattern as useWinnersStaySession.
 * Favorites are a personal picker convenience, not shared team data, so
 * local-only storage (no new table/RLS) is the right scope for this.
 */
export function useClubFavorites(groupId: string | null) {
  const [favoriteIds, setFavoriteIdsState] = useState<string[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    if (!groupId) {
      setFavoriteIdsState([]);
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
          if (looksLikeIdList(parsed)) setFavoriteIdsState(parsed);
        } catch {
          // Corrupted favorites list -- just start fresh, nothing critical is lost.
        }
      })
      .finally(() => {
        if (!cancelled) setIsHydrated(true);
      });

    return () => {
      cancelled = true;
    };
  }, [groupId]);

  const persist = useCallback(
    (next: string[]) => {
      setFavoriteIdsState(next);
      if (groupId) AsyncStorage.setItem(storageKey(groupId), JSON.stringify(next)).catch(() => {});
    },
    [groupId],
  );

  const toggleFavorite = useCallback(
    (clubId: string) => {
      persist(favoriteIds.includes(clubId) ? favoriteIds.filter((id) => id !== clubId) : [...favoriteIds, clubId]);
    },
    [favoriteIds, persist],
  );

  return { favoriteIds, isHydrated, toggleFavorite };
}
