import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";

function storageKey(groupId: string): string {
  return `fc-rival:includeNationalTeams:${groupId}`;
}

/**
 * Per-group, device-local Include/Exclude National Teams preference -- same
 * hydrate-on-mount / write-through AsyncStorage pattern as
 * useClubFavorites/useRecentlyUsedClubs. Defaults to included (true) so a
 * group that never touches this setting sees no behavior change.
 */
export function useNationalTeamsPreference(groupId: string | null) {
  const [includeNationalTeams, setIncludeNationalTeamsState] = useState(true);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    if (!groupId) {
      setIncludeNationalTeamsState(true);
      setIsHydrated(true);
      return;
    }

    let cancelled = false;
    setIsHydrated(false);

    AsyncStorage.getItem(storageKey(groupId))
      .then((stored) => {
        if (cancelled || stored === null) return;
        setIncludeNationalTeamsState(stored === "true");
      })
      .finally(() => {
        if (!cancelled) setIsHydrated(true);
      });

    return () => {
      cancelled = true;
    };
  }, [groupId]);

  const setIncludeNationalTeams = useCallback(
    (next: boolean) => {
      setIncludeNationalTeamsState(next);
      if (groupId) AsyncStorage.setItem(storageKey(groupId), String(next)).catch(() => {});
    },
    [groupId],
  );

  return { includeNationalTeams, isHydrated, setIncludeNationalTeams };
}
