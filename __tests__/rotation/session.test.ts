import {
  acceptPendingRotation,
  addToQueue,
  advanceWinnersStaySession,
  canAdvanceSession,
  cleanupInactiveQueueEntries,
  computeSessionSummary,
  drawRandomInitialPairs,
  endSession,
  isMatchLinkedToActiveWinnersStaySession,
  moveQueueEntry,
  redrawSessionPartner,
  removeFromQueue,
  retryPendingRotation,
  startWinnersStaySession,
  undoLastRotation,
} from "../../src/lib/rotation/session";
import type { ActivePair, MatchResult, RandomFn, RotationPlayer, WaitingQueueItem, WinnersStaySession } from "../../src/lib/rotation/types";

function player(id: string): RotationPlayer {
  return { id, display_name: id, avatar_url: null, custom_color: "#000" };
}

function playersById(ids: string[]): Record<string, RotationPlayer> {
  return Object.fromEntries(ids.map((id) => [id, player(id)]));
}

function seededRandom(sequence: number[]): RandomFn {
  let i = 0;
  return () => sequence[i++ % sequence.length]!;
}

const ALL = ["a", "b", "c", "d", "e", "f", "g", "h"];

function freshSession(now = new Date(2026, 6, 27, 12), waiting = ["e", "f"]): WinnersStaySession {
  return startWinnersStaySession({
    id: "session-1",
    groupId: "group-1",
    pairA: [player("a"), player("b")],
    pairB: [player("c"), player("d")],
    waitingPlayers: waiting.map(player),
    activePlayerIds: ALL,
    now,
  });
}

describe("drawRandomInitialPairs", () => {
  it("splits exactly 4 players into two pairs with nobody left waiting", () => {
    const { pairA, pairB, waiting } = drawRandomInitialPairs([player("a"), player("b"), player("c"), player("d")], seededRandom([0.1, 0.2, 0.3]));
    expect([...pairA, ...pairB].map((p) => p.id).sort()).toEqual(["a", "b", "c", "d"]);
    expect(waiting).toEqual([]);
  });

  it("puts everyone beyond the first four into the waiting group", () => {
    const { waiting } = drawRandomInitialPairs(ALL.map(player), seededRandom([0.5]));
    expect(waiting).toHaveLength(4);
  });

  it("throws with fewer than four players", () => {
    expect(() => drawRandomInitialPairs([player("a"), player("b"), player("c")])).toThrow();
  });

  it("is deterministic given the same injected random sequence", () => {
    const seq = [0.9, 0.1, 0.4, 0.6, 0.2];
    const first = drawRandomInitialPairs(ALL.map(player), seededRandom(seq));
    const second = drawRandomInitialPairs(ALL.map(player), seededRandom(seq));
    expect(first).toEqual(second);
  });
});

describe("startWinnersStaySession", () => {
  it("initializes both starting pairs at consecutiveMatchesPlayed 1, round 0, active status", () => {
    const session = freshSession();
    expect(session.currentPairA.consecutiveMatchesPlayed).toBe(1);
    expect(session.currentPairB!.consecutiveMatchesPlayed).toBe(1);
    expect(session.roundNumber).toBe(0);
    expect(session.status).toBe("active");
    expect(session.lastRecordedMatchId).toBeNull();
    expect(session.previousSnapshot).toBeNull();
    expect(session.longestWinningRun).toBe(1);
  });

  it("queues the remaining players in the given order", () => {
    const session = freshSession(new Date(), ["g", "e", "f"]);
    expect(session.waitingQueue.map((q) => q.playerId)).toEqual(["g", "e", "f"]);
  });

  it("supports manual initial pairs (any two arbitrary player pairs, not just a random draw)", () => {
    const session = startWinnersStaySession({
      id: "s",
      groupId: "g",
      pairA: [player("x"), player("y")],
      pairB: [player("z"), player("w")],
      waitingPlayers: [],
      activePlayerIds: ["x", "y", "z", "w"],
      now: new Date(),
    });
    expect(session.currentPairA.players.map((p) => p.id)).toEqual(["x", "y"]);
  });

  it("survives a JSON round-trip (the shape AsyncStorage persistence relies on)", () => {
    const session = freshSession();
    const restored = JSON.parse(JSON.stringify(session));
    expect(restored).toEqual(session);
  });
});

describe("canAdvanceSession / advanceWinnersStaySession", () => {
  it("can advance a fresh active session with an accepted matchup", () => {
    expect(canAdvanceSession(freshSession(), "match-1")).toBe(true);
  });

  it("cannot advance the same matchId twice (idempotency guard)", () => {
    const session = freshSession();
    const advanced = advanceWinnersStaySession({ session, matchId: "match-1", result: "sideA", playersById: playersById(ALL), activePlayerIds: ALL, now: new Date() });
    expect(canAdvanceSession(advanced, "match-1")).toBe(false);
    expect(() => advanceWinnersStaySession({ session: advanced, matchId: "match-1", result: "sideA", playersById: playersById(ALL), activePlayerIds: ALL, now: new Date() })).toThrow();
  });

  it("cannot advance a completed session", () => {
    const ended = endSession(freshSession(), new Date());
    expect(canAdvanceSession(ended, "match-1")).toBe(false);
  });
});

describe("isMatchLinkedToActiveWinnersStaySession", () => {
  it("is false when there is no session at all", () => {
    expect(isMatchLinkedToActiveWinnersStaySession(null, "match-1")).toBe(false);
  });

  it("is false before any match has advanced the session", () => {
    expect(isMatchLinkedToActiveWinnersStaySession(freshSession(), "match-1")).toBe(false);
  });

  it("is true for the exact match that most recently advanced an active session", () => {
    const advanced = advanceWinnersStaySession({ session: freshSession(), matchId: "match-1", result: "sideA", playersById: playersById(ALL), activePlayerIds: ALL, now: new Date() });
    expect(isMatchLinkedToActiveWinnersStaySession(advanced, "match-1")).toBe(true);
  });

  it("is false for a different match id than the one that advanced the session", () => {
    const advanced = advanceWinnersStaySession({ session: freshSession(), matchId: "match-1", result: "sideA", playersById: playersById(ALL), activePlayerIds: ALL, now: new Date() });
    expect(isMatchLinkedToActiveWinnersStaySession(advanced, "match-2")).toBe(false);
  });

  it("is false once the session has ended, even for the linking match id", () => {
    const advanced = advanceWinnersStaySession({ session: freshSession(), matchId: "match-1", result: "sideA", playersById: playersById(ALL), activePlayerIds: ALL, now: new Date() });
    const ended = endSession(advanced, new Date());
    expect(isMatchLinkedToActiveWinnersStaySession(ended, "match-1")).toBe(false);
  });

  it("increments the staying pair's consecutive count and resets the rotated-out pair's on the next start", () => {
    const session = freshSession();
    const advanced = advanceWinnersStaySession({ session, matchId: "match-1", result: "sideA", playersById: playersById(ALL), activePlayerIds: ALL, now: new Date() });
    expect(advanced.currentPairA.players.map((p) => p.id)).toEqual(["a", "b"]);
    expect(advanced.currentPairA.consecutiveMatchesPlayed).toBe(2); // was 1, stayed again
    expect(advanced.currentPairB).toBeNull(); // not yet accepted
    expect(advanced.pendingRotation).not.toBeNull();
    expect(advanced.roundNumber).toBe(1);
    expect(advanced.lastRecordedMatchId).toBe("match-1");
  });

  it("does not mutate the input session", () => {
    const session = freshSession();
    const snapshot = JSON.parse(JSON.stringify(session));
    advanceWinnersStaySession({ session, matchId: "match-1", result: "sideA", playersById: playersById(ALL), activePlayerIds: ALL, now: new Date() });
    expect(session).toEqual(snapshot);
  });

  it("multi-round progression: two waiting players enter, both losers queue, then the round after accepts and repeats", () => {
    let session = freshSession(new Date(), ["e", "f"]);

    session = advanceWinnersStaySession({ session, matchId: "m1", result: "sideA", playersById: playersById(ALL), activePlayerIds: ALL, now: new Date() });
    expect(session.pendingRotation!.opposingPair!.map((p) => p.id)).toEqual(["e", "f"]);
    session = acceptPendingRotation(session, new Date());
    expect(session.currentPairB!.players.map((p) => p.id)).toEqual(["e", "f"]);
    expect(session.waitingQueue.map((q) => q.playerId).sort()).toEqual(["c", "d"]);

    session = advanceWinnersStaySession({ session, matchId: "m2", result: "sideA", playersById: playersById(ALL), activePlayerIds: ALL, now: new Date() });
    // "a"+"b" stay for a third straight round.
    expect(session.currentPairA.consecutiveMatchesPlayed).toBe(3);
    expect(session.pendingRotation!.opposingPair!.map((p) => p.id).sort()).toEqual(["c", "d"]);
    session = acceptPendingRotation(session, new Date());
    expect(session.roundNumber).toBe(2);
    expect(session.waitingQueue.map((q) => q.playerId).sort()).toEqual(["e", "f"]);
  });

  it("one-waiter progression across multiple rounds: the entering player keeps their partner varying, the remaining loser re-queues each time", () => {
    let session = freshSession(new Date(), ["e"]);

    session = advanceWinnersStaySession({ session, matchId: "m1", result: "sideA", playersById: playersById(ALL), activePlayerIds: ALL, now: new Date(), random: seededRandom([0.1]) });
    expect(session.pendingRotation!.selectionSource).toBe("randomFromLosers");
    expect(session.pendingRotation!.opposingPair![0].id).toBe("e");
    session = acceptPendingRotation(session, new Date());
    const firstRoundQueue = session.waitingQueue.map((q) => q.playerId);
    expect(firstRoundQueue).toHaveLength(1); // the other loser

    session = advanceWinnersStaySession({ session, matchId: "m2", result: "sideA", playersById: playersById(ALL), activePlayerIds: ALL, now: new Date(), random: seededRandom([0.9]) });
    expect(session.currentPairA.consecutiveMatchesPlayed).toBe(3); // "a"+"b" staying a third round
  });

  it("draw progression: the pair with fewer consecutive matches stays, then rotation proceeds", () => {
    let session = freshSession(new Date(), ["e", "f"]);
    session = advanceWinnersStaySession({ session, matchId: "m1", result: "sideA", playersById: playersById(ALL), activePlayerIds: ALL, now: new Date() });
    session = acceptPendingRotation(session, new Date());
    // currentPairA ("a"+"b") now has consecutiveMatchesPlayed 2; currentPairB ("e"+"f") has 1.
    session = advanceWinnersStaySession({ session, matchId: "m2", result: "draw", playersById: playersById(ALL), activePlayerIds: ALL, now: new Date() });
    // "e"+"f" (fewer consecutive matches: 1) should stay over "a"+"b" (2).
    expect(session.currentPairA.players.map((p) => p.id)).toEqual(["e", "f"]);
    expect(session.currentPairA.consecutiveMatchesPlayed).toBe(2);
    expect(session.pendingRotation!.drawRotationApplied).toBe(true);
  });

  it("Case 4 (no waiting players): currentPairA still updates, currentPairB stays null, pendingRotation reports 'none'", () => {
    let session = freshSession(new Date(), []);
    session = advanceWinnersStaySession({ session, matchId: "m1", result: "sideA", playersById: playersById(ALL), activePlayerIds: ALL, now: new Date() });
    expect(session.pendingRotation!.opposingPair).toBeNull();
    expect(session.pendingRotation!.selectionSource).toBe("none");
    expect(() => acceptPendingRotation(session, new Date())).toThrow();
  });
});

describe("retryPendingRotation (Case 4 recovery)", () => {
  it("succeeds once at least two players are added to the queue", () => {
    let session = freshSession(new Date(), []);
    session = advanceWinnersStaySession({ session, matchId: "m1", result: "sideA", playersById: playersById(ALL), activePlayerIds: ALL, now: new Date() });
    expect(session.pendingRotation!.opposingPair).toBeNull();

    session = { ...session, waitingQueue: addToQueue(addToQueue(session.waitingQueue, player("g")), player("h")) };
    session = retryPendingRotation(session, playersById(ALL), new Date());
    expect(session.pendingRotation!.opposingPair!.map((p) => p.id)).toEqual(["g", "h"]);
  });

  it("still reports 'not enough' with only one queued", () => {
    let session = freshSession(new Date(), []);
    session = advanceWinnersStaySession({ session, matchId: "m1", result: "sideA", playersById: playersById(ALL), activePlayerIds: ALL, now: new Date() });
    session = { ...session, waitingQueue: addToQueue(session.waitingQueue, player("g")) };
    session = retryPendingRotation(session, playersById(ALL), new Date());
    expect(session.pendingRotation!.opposingPair).toBeNull();
  });
});

describe("redrawSessionPartner", () => {
  it("only changes which loser partners the waiting player, never the winning pair", () => {
    let session = freshSession(new Date(), ["e"]);
    session = advanceWinnersStaySession({ session, matchId: "m1", result: "sideA", playersById: playersById(ALL), activePlayerIds: ALL, now: new Date(), random: seededRandom([0.1]) });
    const before = session.pendingRotation!.opposingPair!.map((p) => p.id);

    const redrawn = redrawSessionPartner(session, seededRandom([0.9]));
    const after = redrawn.pendingRotation!.opposingPair!.map((p) => p.id);

    expect(after[0]).toBe(before[0]); // waiting player unchanged
    expect(after[1]).not.toBe(before[1]); // partner flipped
    expect(redrawn.currentPairA).toEqual(session.currentPairA); // winning pair untouched
  });

  it("does not mutate the committed session (currentPairB/waitingQueue) until accepted", () => {
    let session = freshSession(new Date(), ["e"]);
    session = advanceWinnersStaySession({ session, matchId: "m1", result: "sideA", playersById: playersById(ALL), activePlayerIds: ALL, now: new Date(), random: seededRandom([0.1]) });
    const redrawn = redrawSessionPartner(session, seededRandom([0.9]));
    expect(redrawn.currentPairB).toBeNull();
    expect(redrawn.waitingQueue).toEqual(session.waitingQueue);
  });

  it("throws when the pending rotation wasn't a random-partner selection", () => {
    let session = freshSession(new Date(), ["e", "f"]);
    session = advanceWinnersStaySession({ session, matchId: "m1", result: "sideA", playersById: playersById(ALL), activePlayerIds: ALL, now: new Date() });
    expect(() => redrawSessionPartner(session)).toThrow();
  });
});

describe("undoLastRotation", () => {
  it("restores the pre-advance state exactly", () => {
    const session = freshSession();
    const snapshotBefore = JSON.parse(JSON.stringify(session));
    let advanced = advanceWinnersStaySession({ session, matchId: "m1", result: "sideA", playersById: playersById(ALL), activePlayerIds: ALL, now: new Date() });
    advanced = acceptPendingRotation(advanced, new Date());

    const undone = undoLastRotation(advanced, new Date());
    expect(undone.currentPairA).toEqual(snapshotBefore.currentPairA);
    expect(undone.currentPairB).toEqual(snapshotBefore.currentPairB);
    expect(undone.waitingQueue).toEqual(snapshotBefore.waitingQueue);
    expect(undone.roundNumber).toBe(snapshotBefore.roundNumber);
    expect(undone.lastRecordedMatchId).toBe(snapshotBefore.lastRecordedMatchId);
    expect(undone.previousSnapshot).toBeNull(); // single-slot undo, now consumed
  });

  it("throws when there is nothing to undo", () => {
    expect(() => undoLastRotation(freshSession(), new Date())).toThrow();
  });

  it("never touches lastRecordedMatchId in a way that deletes the recorded match -- undo only affects rotation state", () => {
    // The match itself lives in Supabase, entirely outside this module -- undo
    // only ever reverts fields on the session object.
    const session = freshSession();
    const advanced = advanceWinnersStaySession({ session, matchId: "m1", result: "sideA", playersById: playersById(ALL), activePlayerIds: ALL, now: new Date() });
    const undone = undoLastRotation(advanced, new Date());
    expect(undone.lastRecordedMatchId).toBeNull(); // reverted, but this says nothing about the match row itself
  });
});

describe("queue editing", () => {
  const queue: WaitingQueueItem[] = [
    { playerId: "e", enteredQueueAt: 0, consecutiveWaitCount: 2 },
    { playerId: "f", enteredQueueAt: 1, consecutiveWaitCount: 1 },
    { playerId: "g", enteredQueueAt: 2, consecutiveWaitCount: 0 },
  ];

  it("moveQueueEntry swaps with the previous/next entry and re-indexes enteredQueueAt", () => {
    const moved = moveQueueEntry(queue, "g", "up");
    expect(moved.map((q) => q.playerId)).toEqual(["e", "g", "f"]);
    expect(moved.map((q) => q.enteredQueueAt)).toEqual([0, 1, 2]);
  });

  it("moveQueueEntry is a no-op at either edge", () => {
    expect(moveQueueEntry(queue, "e", "up").map((q) => q.playerId)).toEqual(["e", "f", "g"]);
    expect(moveQueueEntry(queue, "g", "down").map((q) => q.playerId)).toEqual(["e", "f", "g"]);
  });

  it("removeFromQueue drops the player and re-indexes the rest", () => {
    const removed = removeFromQueue(queue, "f");
    expect(removed.map((q) => q.playerId)).toEqual(["e", "g"]);
    expect(removed.map((q) => q.enteredQueueAt)).toEqual([0, 1]);
  });

  it("addToQueue appends at the end, refuses duplicates, and refuses players already on the court", () => {
    const added = addToQueue(queue, player("h"));
    expect(added.map((q) => q.playerId)).toEqual(["e", "f", "g", "h"]);
    expect(addToQueue(queue, player("e"))).toEqual(queue); // no duplicates
    expect(addToQueue(queue, player("a"), ["a", "b"])).toEqual(queue); // can't queue an active court player
  });

  it("cleanupInactiveQueueEntries safely drops archived players", () => {
    const cleaned = cleanupInactiveQueueEntries(queue, ["e", "g"]); // "f" archived/deleted
    expect(cleaned.map((q) => q.playerId)).toEqual(["e", "g"]);
  });

  it("cleanupInactiveQueueEntries safely drops deleted players the same way", () => {
    const cleaned = cleanupInactiveQueueEntries(queue, ["f", "g"]); // "e" deleted
    expect(cleaned.map((q) => q.playerId)).toEqual(["f", "g"]);
  });

  it("none of the queue-editing functions mutate their input", () => {
    const snapshot = JSON.parse(JSON.stringify(queue));
    moveQueueEntry(queue, "g", "up");
    removeFromQueue(queue, "f");
    addToQueue(queue, player("h"));
    cleanupInactiveQueueEntries(queue, ["e"]);
    expect(queue).toEqual(snapshot);
  });
});

describe("endSession / computeSessionSummary", () => {
  it("marks the session completed without discarding any data", () => {
    const session = freshSession();
    const ended = endSession(session, new Date());
    expect(ended.status).toBe("completed");
    expect(ended.currentPairA).toEqual(session.currentPairA);
    expect(ended.waitingQueue).toEqual(session.waitingQueue);
  });

  it("summarizes rounds played, duration, players used, longest run, and the final queue", () => {
    const started = new Date(2026, 6, 27, 20, 0);
    let session = freshSession(started, ["e", "f"]);
    session = advanceWinnersStaySession({ session, matchId: "m1", result: "sideA", playersById: playersById(ALL), activePlayerIds: ALL, now: new Date(2026, 6, 27, 20, 30) });
    session = acceptPendingRotation(session, new Date(2026, 6, 27, 20, 30));
    session = endSession(session, new Date(2026, 6, 27, 21, 0));

    const summary = computeSessionSummary(session);
    expect(summary.roundsPlayed).toBe(1);
    expect(summary.durationMs).toBe(new Date(2026, 6, 27, 21, 0).getTime() - started.getTime());
    expect(summary.playersUsedCount).toBe(ALL.length);
    expect(summary.longestWinningRun).toBeGreaterThanOrEqual(2); // "a"+"b" stayed twice
    expect(summary.finalWaitingQueue.map((q) => q.playerId).sort()).toEqual(["c", "d"]);
  });

  it("counts a still-on-court pair's current streak toward the longest run even if they never rotated out", () => {
    let session = freshSession(new Date(), ["e", "f"]);
    session = advanceWinnersStaySession({ session, matchId: "m1", result: "sideA", playersById: playersById(ALL), activePlayerIds: ALL, now: new Date() });
    session = acceptPendingRotation(session, new Date());
    session = advanceWinnersStaySession({ session, matchId: "m2", result: "sideA", playersById: playersById(ALL), activePlayerIds: ALL, now: new Date() });
    const summary = computeSessionSummary(session); // "a"+"b" have stayed 3 rounds and are still on court
    expect(summary.longestWinningRun).toBe(3);
  });
});

describe("a full multi-round scenario stitched together, verifying no state leaks between rounds", () => {
  it("plays three rounds with a mix of two-waiter, one-waiter, and a draw, ending with a clean summary", () => {
    let session = freshSession(new Date(2026, 6, 27, 20, 0), ["e", "f"]);
    const advance = (matchId: string, result: MatchResult, random?: RandomFn) =>
      (session = advanceWinnersStaySession({ session, matchId, result, playersById: playersById(ALL), activePlayerIds: ALL, now: new Date(), random }));

    advance("m1", "sideA"); // a+b beat c+d, e+f come in
    session = acceptPendingRotation(session, new Date());
    expect(session.roundNumber).toBe(1);

    advance("m2", "sideB", seededRandom([0.2])); // a+b lose to e+f this time -- only "g"/"h" aren't in the roster's waiting pool here, so queue is [c, d]; e+f now stays
    session = acceptPendingRotation(session, new Date());
    expect(session.currentPairA.players.map((p) => p.id)).toEqual(["e", "f"]);
    expect(session.roundNumber).toBe(2);

    advance("m3", "draw"); // whichever of e+f (2 played) vs c+d (1 played, just entered) has fewer stays
    expect(session.pendingRotation!.drawRotationApplied).toBe(true);
    session = acceptPendingRotation(session, new Date());
    expect(session.roundNumber).toBe(3);

    const summary = computeSessionSummary(endSession(session, new Date()));
    expect(summary.roundsPlayed).toBe(3);
  });
});
