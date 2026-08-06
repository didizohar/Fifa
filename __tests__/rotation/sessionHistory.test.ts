import { archiveCompletedSession, isSessionArchived, MAX_SESSION_HISTORY_ENTRIES, type CompletedSessionRecord } from "../../src/lib/rotation/sessionHistory";
import type { ActivePair, WaitingQueueItem, WinnersStaySession } from "../../src/lib/rotation/types";

function pair(idA: string, idB: string, consecutive = 1): ActivePair {
  return {
    players: [
      { id: idA, display_name: idA, avatar_url: null, custom_color: "#000" },
      { id: idB, display_name: idB, avatar_url: null, custom_color: "#000" },
    ],
    consecutiveMatchesPlayed: consecutive,
  };
}

function waiting(id: string): WaitingQueueItem {
  return { playerId: id, enteredQueueAt: 0, consecutiveWaitCount: 0 };
}

function session(overrides: Partial<WinnersStaySession> = {}): WinnersStaySession {
  return {
    id: "session-1",
    groupId: "group-1",
    format: "group",
    activePlayerIds: ["a", "b", "c", "d"],
    currentPairA: pair("a", "b", 3),
    currentPairB: null,
    pendingRotation: null,
    waitingQueue: [waiting("c"), waiting("d")],
    roundNumber: 4,
    startedAt: "2026-03-01T18:00:00.000Z",
    updatedAt: "2026-03-01T19:00:00.000Z",
    lastRecordedMatchId: "match-4",
    status: "completed",
    longestWinningRun: 3,
    previousSnapshot: null,
    ...overrides,
  };
}

describe("archiveCompletedSession", () => {
  it("adds a new entry to an empty history", () => {
    const history = archiveCompletedSession([], session(), "2026-03-01T19:05:00.000Z");
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ id: "session-1", groupId: "group-1", startedAt: "2026-03-01T18:00:00.000Z", endedAt: "2026-03-01T19:05:00.000Z" });
    expect(history[0]!.summary).toMatchObject({ roundsPlayed: 4, longestWinningRun: 3 });
  });

  it("puts the newest session first", () => {
    const first = archiveCompletedSession([], session({ id: "s1" }), "2026-03-01T19:05:00.000Z");
    const second = archiveCompletedSession(first, session({ id: "s2" }), "2026-03-02T19:05:00.000Z");
    expect(second.map((h) => h.id)).toEqual(["s2", "s1"]);
  });

  it("replaces (not duplicates) an existing entry for the same session id", () => {
    const first = archiveCompletedSession([], session({ id: "s1", roundNumber: 2 }), "2026-03-01T19:05:00.000Z");
    const reArchived = archiveCompletedSession(first, session({ id: "s1", roundNumber: 5 }), "2026-03-01T19:10:00.000Z");
    expect(reArchived).toHaveLength(1);
    expect(reArchived[0]!.summary.roundsPlayed).toBe(5);
    expect(reArchived[0]!.endedAt).toBe("2026-03-01T19:10:00.000Z");
  });

  it("caps the history at MAX_SESSION_HISTORY_ENTRIES, dropping the oldest", () => {
    let history: CompletedSessionRecord[] = [];
    for (let i = 0; i < MAX_SESSION_HISTORY_ENTRIES + 5; i++) {
      history = archiveCompletedSession(history, session({ id: `s${i}` }), `2026-03-${String(i + 1).padStart(2, "0")}T19:00:00.000Z`);
    }
    expect(history).toHaveLength(MAX_SESSION_HISTORY_ENTRIES);
    // Newest (last archived) is first; the earliest 5 sessions should have fallen off.
    expect(history[0]!.id).toBe(`s${MAX_SESSION_HISTORY_ENTRIES + 4}`);
    expect(history.some((h) => h.id === "s0")).toBe(false);
  });
});

describe("isSessionArchived", () => {
  it("is false for an empty history", () => {
    expect(isSessionArchived([], "session-1")).toBe(false);
  });

  it("is true once a session has been archived", () => {
    const history = archiveCompletedSession([], session(), "2026-03-01T19:05:00.000Z");
    expect(isSessionArchived(history, "session-1")).toBe(true);
  });
});

/**
 * The "Back to Home" button's underlying state transition (winners-stay.tsx's
 * handleBackToHome): archive the just-ended session, then the active
 * session slot is cleared (setSession(null) -- not itself a pure function
 * to test, but its precondition is that archiving already completed).
 * router.replace("/") is a real navigation side effect and isn't unit-
 * testable without a component-testing library; what's covered here is the
 * data guarantee that makes "preserve access through history" and "don't
 * lose the summary" true regardless of how navigation is implemented.
 */
describe("Back to Home flow (archive-before-clear)", () => {
  it("the completed session is retrievable from history immediately after archiving, before the active slot would be cleared", () => {
    const completed = session({ status: "completed" });
    const history = archiveCompletedSession([], completed, "2026-03-01T19:05:00.000Z");
    // This is what the summary screen's "Past Sessions" list reads from --
    // it must already contain the session the user just finished.
    expect(history.find((h) => h.id === completed.id)).toBeDefined();
    expect(isSessionArchived(history, completed.id)).toBe(true);
  });

  it("archiving an already-completed session does not require it to still be the active one -- it works from the summary screen's state alone", () => {
    const completed = session({ status: "completed", roundNumber: 7 });
    const history = archiveCompletedSession([], completed, "2026-03-01T19:05:00.000Z");
    expect(history[0]!.summary.roundsPlayed).toBe(7);
  });

  it("pressing Back to Home twice in a row (a double-tap) is safe -- archiving is idempotent, not additive", () => {
    const completed = session({ status: "completed" });
    const firstPress = archiveCompletedSession([], completed, "2026-03-01T19:05:00.000Z");
    const secondPress = archiveCompletedSession(firstPress, completed, "2026-03-01T19:05:01.000Z");
    expect(secondPress).toHaveLength(1);
  });
});
