import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";

function storageKey(groupId: string): string {
  return `fc-rival:leagueTableCardExpanded:${groupId}`;
}

/** Per-group, device-local collapsed/expanded preference for Home's League Table card -- same hydrate-on-mount / write-through AsyncStorage pattern as the app's other local UI preferences (favorites, recently-used, national-teams toggle). Defaults to collapsed (Top 5). */
export function useLeagueTableCardPreference(groupId: string | null) {
  const [expanded, setExpandedState] = useState(false);

  useEffect(() => {
    if (!groupId) return;
    let cancelled = false;
    AsyncStorage.getItem(storageKey(groupId)).then((stored) => {
      if (!cancelled && stored !== null) setExpandedState(stored === "true");
    });
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  const setExpanded = useCallback(
    (next: boolean) => {
      setExpandedState(next);
      if (groupId) AsyncStorage.setItem(storageKey(groupId), String(next)).catch(() => {});
    },
    [groupId],
  );

  return { expanded, setExpanded };
}
