import AsyncStorage from "@react-native-async-storage/async-storage";
import { useIsFocused } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
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

/** A session persisted before `format` existed (originally every session was the 4+/doubles "group" format) won't have the field -- default it here so the rest of the app can trust session.format is always defined, without a data migration. */
function normalizeSession(session: WinnersStaySession): WinnersStaySession {
  if (session.format === "duo" || session.format === "trio" || session.format === "group") return session;
  return { ...session, format: "group" };
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
  const isFocused = useIsFocused();
  const [session, setSessionState] = useState<WinnersStaySession | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isCorrupted, setIsCorrupted] = useState(false);
  // Tracks which groupId this hook instance has already run its
  // authoritative first hydration for -- distinguishes "the very first read
  // for this group" (shows the loading state, flags corrupted storage) from
  // a later refocus-triggered resync (silent background refresh only).
  const hydratedGroupIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!groupId) {
      setSessionState(null);
      setIsHydrated(true);
      setIsCorrupted(false);
      hydratedGroupIdRef.current = null;
      return;
    }

    // A tab screen (Dashboard) never unmounts just because Start Evening /
    // Winners Stay / Record Match was pushed on top of it -- so its OWN
    // instance of this hook, once mounted, would otherwise keep showing
    // whatever session existed at that exact moment forever, even after a
    // DIFFERENT screen has since started, advanced, or ended a session for
    // the same group. These are independent React state instances,
    // connected only through this shared AsyncStorage key, not live-synced.
    // Skipping the read while unfocused (and re-running it every time this
    // instance regains focus) is what keeps every screen holding this hook
    // honest about which session is actually active, without polling and
    // without a second source of truth -- same storage key, same read.
    if (!isFocused) return;

    let cancelled = false;
    const isFirstReadForThisGroup = hydratedGroupIdRef.current !== groupId;
    if (isFirstReadForThisGroup) {
      setIsHydrated(false);
      setIsCorrupted(false);
    }

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
            setSessionState(normalizeSession(parsed));
          } else if (isFirstReadForThisGroup) {
            // A refocus resync deliberately does NOT flag corruption or
            // clear an already-good in-memory session over a single bad
            // read -- that authoritative check only applies to the first
            // read for this group.
            setIsCorrupted(true);
            setSessionState(null);
          }
        } catch {
          if (isFirstReadForThisGroup) {
            setIsCorrupted(true);
            setSessionState(null);
          }
        }
      })
      .finally(() => {
        if (cancelled) return;
        setIsHydrated(true);
        hydratedGroupIdRef.current = groupId;
      });

    return () => {
      cancelled = true;
    };
  }, [groupId, isFocused]);

  // Returns a Promise that resolves once the AsyncStorage write/removal has
  // actually completed -- existing fire-and-forget callers (every in-screen
  // rotation transition in winners-stay.tsx) are unaffected, since calling
  // an async function without awaiting it is still valid. It matters for a
  // caller that navigates to a DIFFERENT screen right after clearing/
  // setting the session (see start-evening.tsx): that other screen mounts
  // its own separate instance of this hook, connected to this one only
  // through the shared AsyncStorage key, not React state -- without
  // awaiting here first, the navigation could land before the write/removal
  // actually lands, and the other screen's own hydration read would see
  // stale data.
  const setSession = useCallback(
    async (next: WinnersStaySession | null) => {
      setSessionState(next);
      setIsCorrupted(false);
      if (!groupId) return;
      if (next) await AsyncStorage.setItem(storageKey(groupId), JSON.stringify(next)).catch(() => {});
      else await AsyncStorage.removeItem(storageKey(groupId)).catch(() => {});
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
