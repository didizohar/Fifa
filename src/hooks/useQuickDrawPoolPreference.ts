import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";
import type { ClubPoolMode } from "../lib/clubPools";

function storageKey(groupId: string): string {
  return `fc-rival:quickDrawPool:${groupId}`;
}

function isPoolMode(value: unknown): value is "large" | "small" {
  return value === "large" || value === "small";
}

/**
 * Per-group, device-local "which pool did I last draw from" preference for
 * the Dashboard's Quick Club Draw card -- same hydrate-on-mount /
 * write-through AsyncStorage pattern as useNationalTeamsPreference. Defaults
 * to "large" (the highest-rated pool) so a group that's never touched this
 * setting sees a sensible default rather than an arbitrary one. Only ever
 * stores "large"/"small" -- the Dashboard card has no "random" option (see
 * QuickClubDrawCard).
 */
export function useQuickDrawPoolPreference(groupId: string | null) {
  const [pool, setPoolState] = useState<Exclude<ClubPoolMode, "random">>("large");
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    if (!groupId) {
      setPoolState("large");
      setIsHydrated(true);
      return;
    }

    let cancelled = false;
    setIsHydrated(false);

    AsyncStorage.getItem(storageKey(groupId))
      .then((stored) => {
        if (cancelled || !isPoolMode(stored)) return;
        setPoolState(stored);
      })
      .finally(() => {
        if (!cancelled) setIsHydrated(true);
      });

    return () => {
      cancelled = true;
    };
  }, [groupId]);

  const setPool = useCallback(
    (next: Exclude<ClubPoolMode, "random">) => {
      setPoolState(next);
      if (groupId) AsyncStorage.setItem(storageKey(groupId), next).catch(() => {});
    },
    [groupId],
  );

  return { pool, isHydrated, setPool };
}
