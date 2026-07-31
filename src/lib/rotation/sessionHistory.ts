import { computeSessionSummary } from "./session";
import type { WinnersStaySession, WinnersStaySessionSummary } from "./types";

export interface CompletedSessionRecord {
  id: string;
  groupId: string;
  startedAt: string;
  endedAt: string;
  summary: WinnersStaySessionSummary;
}

/** Keeps the history list from growing unbounded in AsyncStorage -- oldest entries fall off first. */
export const MAX_SESSION_HISTORY_ENTRIES = 20;

/**
 * Appends a just-ended session to the group's history, newest first, so
 * "Back to Home" can clear the *active* session slot while the completed
 * session's summary remains reachable afterward. Replaces (rather than
 * duplicates) an existing entry for the same session id, so re-archiving
 * the same session is idempotent.
 */
export function archiveCompletedSession(history: CompletedSessionRecord[], session: WinnersStaySession, endedAt: string): CompletedSessionRecord[] {
  const record: CompletedSessionRecord = {
    id: session.id,
    groupId: session.groupId,
    startedAt: session.startedAt,
    endedAt,
    summary: computeSessionSummary(session),
  };
  return [record, ...history.filter((h) => h.id !== session.id)].slice(0, MAX_SESSION_HISTORY_ENTRIES);
}

/** True if `sessionId` has already been archived -- lets a caller avoid double-archiving the same session. */
export function isSessionArchived(history: CompletedSessionRecord[], sessionId: string): boolean {
  return history.some((h) => h.id === sessionId);
}
