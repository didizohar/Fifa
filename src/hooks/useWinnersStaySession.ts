import { useIsFocused } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { endActiveSession, fetchActiveSession, startActiveSession, subscribeToActiveSession, updateActiveSession } from "../lib/activeSessions";
import type { WinnersStaySession } from "../lib/rotation/types";

/** A session persisted before `format` existed (originally every session was the 4+/doubles "group" format) won't have the field -- default it here so the rest of the app can trust session.format is always defined, without a data migration. */
function normalizeSession(session: WinnersStaySession): WinnersStaySession {
  if (session.format === "duo" || session.format === "trio" || session.format === "group") return session;
  return { ...session, format: "group" };
}

/**
 * Supabase-backed shared active session for a group -- every member reads
 * and writes the SAME `active_sessions` row (see
 * supabase/migrations/20260811164500_shared_active_sessions.sql), replacing
 * the previous per-device AsyncStorage persistence. Refetches on every
 * screen focus (same `useIsFocused` pattern the AsyncStorage version already
 * used for "another screen may have changed this since I last read it" --
 * now that "another screen" can genuinely mean another device/user's
 * screen, this is what lets a member who opens the app see a session
 * someone else already started, without an app restart).
 *
 * `setSession` covers every mutation that never inserts a match (start,
 * accept/redraw/undo a rotation, edit the waiting queue, end/reset) as a
 * single optimistic-concurrency write -- see updateActiveSession/
 * startActiveSession/endActiveSession. Recording a MATCH must go through
 * recordMatchAndAdvanceSession (src/lib/activeSessions.ts) instead, since
 * that needs to be atomic with the match insert; once that call succeeds,
 * the caller should use `adoptSession` (a purely local state update, no
 * extra network write) to reflect the already-authoritative result.
 */
export function useWinnersStaySession(groupId: string | null) {
  const isFocused = useIsFocused();
  const [session, setSessionState] = useState<WinnersStaySession | null>(null);
  const [version, setVersion] = useState<number | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isCorrupted, setIsCorrupted] = useState(false);
  const hydratedGroupIdRef = useRef<string | null>(null);
  const versionRef = useRef<number | null>(null);
  versionRef.current = version;

  const load = useCallback(async (forGroupId: string, isFirstReadForThisGroup: boolean) => {
    try {
      const row = await fetchActiveSession(forGroupId);
      if (!row) {
        setSessionState(null);
        setVersion(null);
        return;
      }
      setSessionState(normalizeSession(row.session));
      setVersion(row.version);
    } catch {
      if (isFirstReadForThisGroup) {
        setIsCorrupted(true);
        setSessionState(null);
        setVersion(null);
      }
    }
  }, []);

  useEffect(() => {
    if (!groupId) {
      setSessionState(null);
      setVersion(null);
      setIsHydrated(true);
      setIsCorrupted(false);
      hydratedGroupIdRef.current = null;
      return;
    }
    if (!isFocused) return;

    let cancelled = false;
    const isFirstReadForThisGroup = hydratedGroupIdRef.current !== groupId;
    if (isFirstReadForThisGroup) {
      setIsHydrated(false);
      setIsCorrupted(false);
    }

    load(groupId, isFirstReadForThisGroup).finally(() => {
      if (cancelled) return;
      setIsHydrated(true);
      hydratedGroupIdRef.current = groupId;
    });

    return () => {
      cancelled = true;
    };
  }, [groupId, isFocused, load]);

  /** Re-reads the shared session on demand -- used after a stale-write conflict to converge on whatever another member's device just committed. */
  const refetch = useCallback(async () => {
    if (!groupId) return;
    await load(groupId, false);
  }, [groupId, load]);

  // Phase D: live push updates on top of the refocus resync above, which is
  // left completely unchanged and still runs -- this only shortens how long
  // a currently-open, focused screen takes to learn about another member's
  // change, it isn't what makes that change correct or safe (that's the
  // atomic RPC's row lock + version check, unaffected by whether this
  // subscription is connected, stale, or briefly dropped).
  useEffect(() => {
    if (!groupId) return;
    const unsubscribe = subscribeToActiveSession(groupId, (event) => {
      if (event.type === "delete") {
        if (versionRef.current === null) return;
        setSessionState(null);
        setVersion(null);
        return;
      }
      // Only adopt strictly newer state. This is what keeps a push event
      // from re-applying an echo of a write this same instance just made
      // (setSession/adoptSession already updated local state with that
      // exact version) or a delayed/out-of-order delivery of an event
      // older than what a later local write already landed.
      if (versionRef.current !== null && event.version <= versionRef.current) return;
      setSessionState(normalizeSession(event.session));
      setVersion(event.version);
    });
    return unsubscribe;
  }, [groupId]);

  /**
   * Writes a non-match-recording mutation. `next === null` ends/resets the
   * session (deletes the shared row). A stale optimistic-concurrency write
   * (someone else changed the session first) silently refetches instead of
   * throwing -- every existing caller already treats this as fire-and-forget
   * (see winners-stay.tsx), so converging on the current shared state here
   * is safer than surfacing an error for what is, from the user's
   * perspective, a normal multi-device update.
   */
  const setSession = useCallback(
    async (next: WinnersStaySession | null) => {
      if (!groupId) return;
      if (next === null) {
        await endActiveSession(groupId).catch(() => {});
        setSessionState(null);
        setVersion(null);
        return;
      }
      if (versionRef.current === null) {
        const result = await startActiveSession(groupId, next).catch(() => null);
        if (!result) return;
        if (result.ok === "stale") {
          await refetch();
          return;
        }
        setSessionState(next);
        setVersion(result.version);
        return;
      }
      const result = await updateActiveSession(groupId, versionRef.current, next).catch(() => null);
      if (!result) return;
      if (result.ok === "stale") {
        await refetch();
        return;
      }
      setSessionState(next);
      setVersion(result.version);
    },
    [groupId, refetch],
  );

  /** Purely local state update, no network write -- for adopting the result of a call already committed atomically elsewhere (recordMatchAndAdvanceSession). */
  const adoptSession = useCallback((next: WinnersStaySession, nextVersion: number) => {
    setSessionState(next);
    setVersion(nextVersion);
  }, []);

  const discardCorrupted = useCallback(() => {
    setIsCorrupted(false);
  }, []);

  return { session, version, isHydrated, isCorrupted, setSession, adoptSession, discardCorrupted, refetch };
}
