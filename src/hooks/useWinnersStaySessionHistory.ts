import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";
import type { CompletedSessionRecord } from "../lib/rotation/sessionHistory";

function storageKey(groupId: string): string {
  return `fc-rival:winnersStaySessionHistory:${groupId}`;
}

function looksLikeHistory(value: unknown): value is CompletedSessionRecord[] {
  return Array.isArray(value) && value.every((v) => typeof v === "object" && v !== null && typeof (v as { id?: unknown }).id === "string");
}

/**
 * AsyncStorage-backed list of completed Winners Stay sessions for a group --
 * same hydrate-on-mount / write-through pattern as useWinnersStaySession.
 * Separate storage key from the *active* session, so ending a session and
 * clearing the active slot never loses the completed session's summary.
 */
export function useWinnersStaySessionHistory(groupId: string | null) {
  const [history, setHistoryState] = useState<CompletedSessionRecord[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    if (!groupId) {
      setHistoryState([]);
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
          if (looksLikeHistory(parsed)) setHistoryState(parsed);
        } catch {
          // Corrupted history is non-critical (unlike the active session) -- just start fresh.
        }
      })
      .finally(() => {
        if (!cancelled) setIsHydrated(true);
      });

    return () => {
      cancelled = true;
    };
  }, [groupId]);

  const setHistory = useCallback(
    (next: CompletedSessionRecord[]) => {
      setHistoryState(next);
      if (groupId) AsyncStorage.setItem(storageKey(groupId), JSON.stringify(next)).catch(() => {});
    },
    [groupId],
  );

  return { history, isHydrated, setHistory };
}
