import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";
import type { WinnersStaySession } from "../lib/rotation/types";

function storageKey(groupId: string): string {
  return `fc-rival:winnersStaySession:${groupId}`;
}

/** A parsed value is at least shaped like a session -- not a full schema check, just enough to reject garbage/corrupted storage instead of handing a screen a half-formed object. */
function looksLikeSession(value: unknown): value is WinnersStaySession {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === "string" && typeof v.groupId === "string" && typeof v.roundNumber === "number" && (v.status === "active" || v.status === "completed");
}

/**
 * AsyncStorage-backed persistence for one Winners Stay session per group --
 * same hydrate-on-mount / write-through pattern as GroupProvider's
 * last-selected-group and the i18n LocaleProvider's locale preference. The
 * screen owns all state TRANSITIONS (via session.ts's pure functions) and
 * just calls setSession with the result; this hook only handles surviving
 * navigation, backgrounding, and reloads.
 */
export function useWinnersStaySession(groupId: string | null) {
  const [session, setSessionState] = useState<WinnersStaySession | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isCorrupted, setIsCorrupted] = useState(false);

  useEffect(() => {
    if (!groupId) {
      setSessionState(null);
      setIsHydrated(true);
      setIsCorrupted(false);
      return;
    }

    let cancelled = false;
    setIsHydrated(false);
    setIsCorrupted(false);

    AsyncStorage.getItem(storageKey(groupId))
      .then((stored) => {
        if (cancelled) return;
        if (!stored) {
          setSessionState(null);
          return;
        }
        try {
          const parsed: unknown = JSON.parse(stored);
          if (looksLikeSession(parsed)) {
            setSessionState(parsed);
          } else {
            setIsCorrupted(true);
            setSessionState(null);
          }
        } catch {
          setIsCorrupted(true);
          setSessionState(null);
        }
      })
      .finally(() => {
        if (!cancelled) setIsHydrated(true);
      });

    return () => {
      cancelled = true;
    };
  }, [groupId]);

  const setSession = useCallback(
    (next: WinnersStaySession | null) => {
      setSessionState(next);
      setIsCorrupted(false);
      if (!groupId) return;
      if (next) AsyncStorage.setItem(storageKey(groupId), JSON.stringify(next)).catch(() => {});
      else AsyncStorage.removeItem(storageKey(groupId)).catch(() => {});
    },
    [groupId],
  );

  /** Clears a corrupted/stale entry so the screen can fall back to its "no active session" state cleanly. */
  const discardCorrupted = useCallback(() => {
    setIsCorrupted(false);
    if (groupId) AsyncStorage.removeItem(storageKey(groupId)).catch(() => {});
  }, [groupId]);

  return { session, isHydrated, isCorrupted, setSession, discardCorrupted };
}
