import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";

function storageKey(groupId: string): string {
  return `fc-rival:lastWinnersStayParticipants:${groupId}`;
}

function looksLikeIdList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

/**
 * Per-group, device-local record of who played in the most recently
 * STARTED Winners Stay session -- independent of whether that session was
 * ever formally ended (so "Continue Previous Session" reflects whoever
 * actually played most recently, even if the last evening was just
 * abandoned mid-session rather than properly ended). Deliberately separate
 * from useWinnersStaySessionHistory's archived-session records, which only
 * store a summary (rounds played, duration, ...), never the participant
 * list itself. Same hydrate-on-mount / write-through AsyncStorage pattern
 * as useWinnersStaySession.
 */
export function useLastWinnersStayParticipants(groupId: string | null) {
  const [participantIds, setParticipantIdsState] = useState<string[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    if (!groupId) {
      setParticipantIdsState([]);
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
          if (looksLikeIdList(parsed)) setParticipantIdsState(parsed);
        } catch {
          // Corrupted -- non-critical (unlike the active session itself), just start with none.
        }
      })
      .finally(() => {
        if (!cancelled) setIsHydrated(true);
      });

    return () => {
      cancelled = true;
    };
  }, [groupId]);

  const setParticipantIds = useCallback(
    (ids: string[]) => {
      setParticipantIdsState(ids);
      if (groupId) AsyncStorage.setItem(storageKey(groupId), JSON.stringify(ids)).catch(() => {});
    },
    [groupId],
  );

  return { participantIds, isHydrated, setParticipantIds };
}
