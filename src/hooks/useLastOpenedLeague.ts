import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";

function storageKey(groupId: string): string {
  return `fc-rival:lastOpenedLeague:${groupId}`;
}

/**
 * Per-group, device-local "last opened league" in the club picker -- same
 * hydrate-on-mount / write-through AsyncStorage pattern as
 * useClubFavorites/useRecentlyUsedClubs. Purely a convenience default for
 * which league the picker opens into next time; never affects which
 * leagues exist or which clubs they contain.
 */
export function useLastOpenedLeague(groupId: string | null) {
  const [lastLeague, setLastLeagueState] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    if (!groupId) {
      setLastLeagueState(null);
      setIsHydrated(true);
      return;
    }

    let cancelled = false;
    setIsHydrated(false);

    AsyncStorage.getItem(storageKey(groupId))
      .then((stored) => {
        if (!cancelled && stored) setLastLeagueState(stored);
      })
      .finally(() => {
        if (!cancelled) setIsHydrated(true);
      });

    return () => {
      cancelled = true;
    };
  }, [groupId]);

  const setLastLeague = useCallback(
    (league: string) => {
      setLastLeagueState(league);
      if (groupId) AsyncStorage.setItem(storageKey(groupId), league).catch(() => {});
    },
    [groupId],
  );

  return { lastLeague, isHydrated, setLastLeague };
}
