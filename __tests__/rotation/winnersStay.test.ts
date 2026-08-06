import {
  generateWinnersStayRotation,
  incrementConsecutiveMatches,
  resolveDrawRotation,
  selectRandomLosingPlayer,
  selectWaitingPlayers,
  startingConsecutiveMatches,
  updateWaitingQueue,
  validateRotation,
} from "../../src/lib/rotation/winnersStay";
import type { ActivePair, RandomFn, RotationPlayer, WaitingQueueItem } from "../../src/lib/rotation/types";

function player(id: string): RotationPlayer {
  return { id, display_name: id, avatar_url: null, custom_color: "#000" };
}

function pair(ids: [string, string], consecutiveMatchesPlayed = 1): ActivePair {
  return { players: [player(ids[0]), player(ids[1])], consecutiveMatchesPlayed };
}

function queueItem(id: string, enteredQueueAt: number, consecutiveWaitCount = 0): WaitingQueueItem {
  return { playerId: id, enteredQueueAt, consecutiveWaitCount };
}

function playersById(ids: string[]): Record<string, RotationPlayer> {
  return Object.fromEntries(ids.map((id) => [id, player(id)]));
}

function seededRandom(sequence: number[]): RandomFn {
  let i = 0;
  return () => sequence[i++ % sequence.length]!;
}

describe("validateRotation", () => {
  it("flags a singles match handed to Winners Stay with 2-player sides", () => {
    const issues = validateRotation({ matchType: "singles", sideA: pair(["a", "b"]), sideB: pair(["c", "d"]) });
    expect(issues.map((i) => i.code)).toContain("sideSizeMismatch");
  });

  it("flags mismatched side sizes (e.g. a 1-player side against a 2-player side)", () => {
    const issues = validateRotation({ matchType: "doubles", sideA: { players: [player("a")], consecutiveMatchesPlayed: 1 }, sideB: pair(["c", "d"]) });
    expect(issues.map((i) => i.code)).toContain("sideSizeMismatch");
  });

  it("returns no issues for a valid singles (1-player side) matchup", () => {
    const issues = validateRotation({
      matchType: "singles",
      sideA: { players: [player("a")], consecutiveMatchesPlayed: 1 },
      sideB: { players: [player("b")], consecutiveMatchesPlayed: 1 },
    });
    expect(issues).toEqual([]);
  });

  it("flags a duplicate player id across the two pairs", () => {
    const issues = validateRotation({ matchType: "doubles", sideA: pair(["a", "b"]), sideB: pair(["b", "d"]) });
    expect(issues.map((i) => i.code)).toContain("duplicatePlayer");
  });

  it("returns no issues for a valid doubles matchup", () => {
    expect(validateRotation({ matchType: "doubles", sideA: pair(["a", "b"]), sideB: pair(["c", "d"]) })).toEqual([]);
  });
});

describe("resolveDrawRotation", () => {
  it("rotates out the pair with MORE consecutive matches played", () => {
    const sideA = pair(["a", "b"], 2);
    const sideB = pair(["c", "d"], 1);
    expect(resolveDrawRotation(sideA, sideB)).toEqual({ staying: sideB, rotatingOut: sideA });
  });

  it("breaks an exact tie randomly, unbiased, using the injected random function", () => {
    const sideA = pair(["a", "b"], 1);
    const sideB = pair(["c", "d"], 1);
    expect(resolveDrawRotation(sideA, sideB, seededRandom([0.1])).staying).toBe(sideA);
    expect(resolveDrawRotation(sideA, sideB, seededRandom([0.9])).staying).toBe(sideB);
  });
});

describe("selectWaitingPlayers", () => {
  it("returns the longest-waiting players first", () => {
    const queue = [queueItem("c", 3), queueItem("a", 1), queueItem("b", 2)];
    expect(selectWaitingPlayers(queue, 2).map((q) => q.playerId)).toEqual(["a", "b"]);
  });

  it("breaks an exact enteredQueueAt tie deterministically by playerId, not randomly", () => {
    const queue = [queueItem("z", 1), queueItem("a", 1)];
    expect(selectWaitingPlayers(queue, 1).map((q) => q.playerId)).toEqual(["a"]);
  });

  it("does not mutate the input queue array", () => {
    const queue = [queueItem("c", 3), queueItem("a", 1)];
    const snapshot = [...queue];
    selectWaitingPlayers(queue, 1);
    expect(queue).toEqual(snapshot);
  });
});

describe("selectRandomLosingPlayer", () => {
  it("is unbiased -- both players are reachable depending on the random draw", () => {
    const losers: [RotationPlayer, RotationPlayer] = [player("c"), player("d")];
    expect(selectRandomLosingPlayer(losers, seededRandom([0.1])).selected.id).toBe("c");
    expect(selectRandomLosingPlayer(losers, seededRandom([0.9])).selected.id).toBe("d");
  });

  it("the selected and remaining players are always the two losers, never anyone else", () => {
    const losers: [RotationPlayer, RotationPlayer] = [player("c"), player("d")];
    const { selected, remaining } = selectRandomLosingPlayer(losers, seededRandom([0.1]));
    expect(new Set([selected.id, remaining.id])).toEqual(new Set(["c", "d"]));
  });
});

describe("updateWaitingQueue", () => {
  it("removes selected entrants, ages everyone else, and appends rotated-out losers at the end", () => {
    const queue = [queueItem("e", 1), queueItem("f", 2), queueItem("g", 3)];
    const updated = updateWaitingQueue({
      queue,
      selected: [queueItem("e", 1)],
      rotatedOut: [player("c"), player("d")],
      winningPlayerIds: ["a", "b"],
      activePlayerIds: ["a", "b", "c", "d", "e", "f", "g"],
      sequence: 10,
    });
    expect(updated.map((q) => q.playerId)).toEqual(["f", "g", "c", "d"]);
    expect(updated.find((q) => q.playerId === "f")!.consecutiveWaitCount).toBe(1); // aged by 1 from a starting 0
    expect(updated.find((q) => q.playerId === "c")!.consecutiveWaitCount).toBe(0); // freshly queued
  });

  it("never lets a winning player end up in the queue", () => {
    const queue = [queueItem("a", 1)]; // stale: "a" is (about to become) a winner but still listed
    const updated = updateWaitingQueue({ queue, selected: [], rotatedOut: [], winningPlayerIds: ["a", "b"], activePlayerIds: ["a", "b"], sequence: 1 });
    expect(updated.some((q) => q.playerId === "a")).toBe(false);
  });

  it("safely drops archived/deleted players instead of surfacing them", () => {
    const queue = [queueItem("e", 1), queueItem("archived-x", 2)];
    const updated = updateWaitingQueue({ queue, selected: [], rotatedOut: [], winningPlayerIds: [], activePlayerIds: ["e"], sequence: 1 });
    expect(updated.map((q) => q.playerId)).toEqual(["e"]);
  });

  it("never produces duplicate players even if a rotated-out player was somehow already queued", () => {
    const queue = [queueItem("c", 1)];
    const updated = updateWaitingQueue({ queue, selected: [], rotatedOut: [player("c")], winningPlayerIds: [], activePlayerIds: ["c"], sequence: 5 });
    expect(updated.filter((q) => q.playerId === "c")).toHaveLength(1);
  });

  it("does not mutate its inputs", () => {
    const queue = [queueItem("e", 1)];
    const snapshot = JSON.parse(JSON.stringify(queue));
    updateWaitingQueue({ queue, selected: [], rotatedOut: [player("c")], winningPlayerIds: [], activePlayerIds: ["e", "c"], sequence: 1 });
    expect(queue).toEqual(snapshot);
  });
});

describe("incrementConsecutiveMatches / startingConsecutiveMatches", () => {
  it("increments by exactly one and does not mutate the original pair", () => {
    const original = pair(["a", "b"], 2);
    const next = incrementConsecutiveMatches(original);
    expect(next.consecutiveMatchesPlayed).toBe(3);
    expect(original.consecutiveMatchesPlayed).toBe(2);
  });

  it("a freshly-entered pair starts at 1", () => {
    expect(startingConsecutiveMatches([player("e"), player("f")]).consecutiveMatchesPlayed).toBe(1);
  });
});

describe("generateWinnersStayRotation", () => {
  const ACTIVE = ["a", "b", "c", "d", "e", "f", "g", "h"];

  it("Case 1: two waiting players enter together, both losers rotate out", () => {
    const result = generateWinnersStayRotation({
      matchType: "doubles",
      sideA: pair(["a", "b"]),
      sideB: pair(["c", "d"]),
      result: "sideA",
      waitingQueue: [queueItem("e", 1), queueItem("f", 2)],
      playersById: playersById(ACTIVE),
      activePlayerIds: ACTIVE,
      sequence: 100,
    });
    expect(result.stayingPair.map((p) => p.id)).toEqual(["a", "b"]);
    expect(result.opposingPair!.map((p) => p.id)).toEqual(["e", "f"]);
    expect(result.rotatedOutPlayers.map((p) => p.id).sort()).toEqual(["c", "d"]);
    expect(result.waitingPlayers.map((q) => q.playerId).sort()).toEqual(["c", "d"]);
    expect(result.selectionSource).toBe("waitingQueue");
    expect(result.drawRotationApplied).toBe(false);
  });

  it("Case 2: one waiting player is randomly paired with one loser; the other loser joins the queue", () => {
    const result = generateWinnersStayRotation({
      matchType: "doubles",
      sideA: pair(["a", "b"]),
      sideB: pair(["c", "d"]),
      result: "sideA",
      waitingQueue: [queueItem("e", 1)],
      playersById: playersById(ACTIVE),
      activePlayerIds: ACTIVE,
      sequence: 100,
      random: seededRandom([0.1]), // picks "c" as the partner
    });
    expect(result.opposingPair!.map((p) => p.id)).toEqual(["e", "c"]);
    expect(result.rotatedOutPlayers.map((p) => p.id)).toEqual(["d"]);
    expect(result.waitingPlayers.map((q) => q.playerId)).toEqual(["d"]);
    expect(result.selectionSource).toBe("randomFromLosers");
  });

  it("Case 2: the winning pair is never split, and the random pick never selects a winner", () => {
    const result = generateWinnersStayRotation({
      matchType: "doubles",
      sideA: pair(["a", "b"]),
      sideB: pair(["c", "d"]),
      result: "sideA",
      waitingQueue: [queueItem("e", 1)],
      playersById: playersById(ACTIVE),
      activePlayerIds: ACTIVE,
      sequence: 1,
      random: seededRandom([0.9]),
    });
    expect(result.stayingPair.map((p) => p.id)).toEqual(["a", "b"]);
    expect(result.opposingPair!.some((p) => p.id === "a" || p.id === "b")).toBe(false);
  });

  it("Case 3: more than two waiting players -- only the longest-waiting two enter, the rest keep their place in line", () => {
    const result = generateWinnersStayRotation({
      matchType: "doubles",
      sideA: pair(["a", "b"]),
      sideB: pair(["c", "d"]),
      result: "sideA",
      waitingQueue: [queueItem("e", 1), queueItem("f", 2), queueItem("g", 3), queueItem("h", 4)],
      playersById: playersById(ACTIVE),
      activePlayerIds: ACTIVE,
      sequence: 100,
    });
    expect(result.opposingPair!.map((p) => p.id)).toEqual(["e", "f"]);
    expect(result.waitingPlayers.map((q) => q.playerId)).toEqual(["g", "h", "c", "d"]);
  });

  it("Case 4: nobody waiting -- no automatic next match, queue unchanged", () => {
    const result = generateWinnersStayRotation({
      matchType: "doubles",
      sideA: pair(["a", "b"]),
      sideB: pair(["c", "d"]),
      result: "sideA",
      waitingQueue: [],
      playersById: playersById(ACTIVE),
      activePlayerIds: ACTIVE,
      sequence: 1,
    });
    expect(result.opposingPair).toBeNull();
    expect(result.rotatedOutPlayers).toEqual([]);
    expect(result.selectionSource).toBe("none");
    expect(result.reason.key).toBe("rotation.reasonNotEnoughWaiting");
  });

  it("Draw: the pair with FEWER consecutive matches stays, rotation then proceeds normally", () => {
    const result = generateWinnersStayRotation({
      matchType: "doubles",
      sideA: pair(["a", "b"], 2), // played twice consecutively (including this draw)
      sideB: pair(["c", "d"], 1),
      result: "draw",
      waitingQueue: [queueItem("e", 1), queueItem("f", 2)],
      playersById: playersById(ACTIVE),
      activePlayerIds: ACTIVE,
      sequence: 1,
    });
    expect(result.stayingPair.map((p) => p.id)).toEqual(["c", "d"]);
    expect(result.rotatedOutPlayers.map((p) => p.id).sort()).toEqual(["a", "b"]);
    expect(result.drawRotationApplied).toBe(true);
  });

  it("throws for a singles match passed in accidentally", () => {
    expect(() =>
      generateWinnersStayRotation({
        matchType: "singles",
        sideA: pair(["a", "b"]),
        sideB: pair(["c", "d"]),
        result: "sideA",
        waitingQueue: [],
        playersById: playersById(ACTIVE),
        activePlayerIds: ACTIVE,
        sequence: 1,
      }),
    ).toThrow();
  });

  it("throws for a duplicate player id across the two pairs", () => {
    expect(() =>
      generateWinnersStayRotation({
        matchType: "doubles",
        sideA: pair(["a", "b"]),
        sideB: pair(["b", "d"]),
        result: "sideA",
        waitingQueue: [],
        playersById: playersById(ACTIVE),
        activePlayerIds: ACTIVE,
        sequence: 1,
      }),
    ).toThrow();
  });

  it("silently drops a stale winner sitting in the incoming waiting queue instead of selecting them", () => {
    const result = generateWinnersStayRotation({
      matchType: "doubles",
      sideA: pair(["a", "b"]),
      sideB: pair(["c", "d"]),
      result: "sideA",
      waitingQueue: [queueItem("a", 0), queueItem("e", 1)], // "a" (a winner) stale in the queue
      playersById: playersById(ACTIVE),
      activePlayerIds: ACTIVE,
      sequence: 1,
    });
    expect(result.opposingPair!.some((p) => p.id === "a")).toBe(false);
  });

  it("safely drops an archived player from the queue instead of selecting them", () => {
    const activeWithoutArchived = ACTIVE.filter((id) => id !== "e");
    const result = generateWinnersStayRotation({
      matchType: "doubles",
      sideA: pair(["a", "b"]),
      sideB: pair(["c", "d"]),
      result: "sideA",
      waitingQueue: [queueItem("e", 1), queueItem("f", 2)], // "e" archived
      playersById: playersById(ACTIVE),
      activePlayerIds: activeWithoutArchived,
      sequence: 1,
      random: seededRandom([0.1]),
    });
    // Only "f" is a valid waiting candidate -- Case 2 kicks in (one waiting player, randomly paired with a loser).
    expect(result.opposingPair!.some((p) => p.id === "e")).toBe(false);
    expect(result.opposingPair!.some((p) => p.id === "f")).toBe(true);
  });

  it("safely drops a deleted player from the queue the same way", () => {
    const activeWithoutDeleted = ACTIVE.filter((id) => id !== "f");
    const result = generateWinnersStayRotation({
      matchType: "doubles",
      sideA: pair(["a", "b"]),
      sideB: pair(["c", "d"]),
      result: "sideA",
      waitingQueue: [queueItem("e", 1), queueItem("f", 2)],
      playersById: playersById(ACTIVE),
      activePlayerIds: activeWithoutDeleted,
      sequence: 1,
    });
    expect(result.opposingPair!.some((p) => p.id === "f")).toBe(false);
  });

  it("handles a tiny active roster (only one player beyond the four who just played)", () => {
    const smallActive = ["a", "b", "c", "d", "e"];
    const result = generateWinnersStayRotation({
      matchType: "doubles",
      sideA: pair(["a", "b"]),
      sideB: pair(["c", "d"]),
      result: "sideA",
      waitingQueue: [queueItem("e", 1)],
      playersById: playersById(smallActive),
      activePlayerIds: smallActive,
      sequence: 1,
      random: seededRandom([0.1]),
    });
    expect(result.opposingPair).not.toBeNull();
    expect(result.waitingPlayers).toHaveLength(1); // the remaining loser
  });

  it("does not mutate any of its input objects", () => {
    const sideA = pair(["a", "b"]);
    const sideB = pair(["c", "d"]);
    const queue = [queueItem("e", 1), queueItem("f", 2)];
    const snapshotA = JSON.parse(JSON.stringify(sideA));
    const snapshotB = JSON.parse(JSON.stringify(sideB));
    const snapshotQueue = JSON.parse(JSON.stringify(queue));

    generateWinnersStayRotation({
      matchType: "doubles",
      sideA,
      sideB,
      result: "sideA",
      waitingQueue: queue,
      playersById: playersById(ACTIVE),
      activePlayerIds: ACTIVE,
      sequence: 1,
    });

    expect(sideA).toEqual(snapshotA);
    expect(sideB).toEqual(snapshotB);
    expect(queue).toEqual(snapshotQueue);
  });

  it("is deterministic: the same inputs and the same injected random function always produce the same result", () => {
    const buildInput = () => ({
      matchType: "doubles" as const,
      sideA: pair(["a", "b"]),
      sideB: pair(["c", "d"]),
      result: "sideA" as const,
      waitingQueue: [queueItem("e", 1)],
      playersById: playersById(ACTIVE),
      activePlayerIds: ACTIVE,
      sequence: 1,
      random: seededRandom([0.42]),
    });
    expect(generateWinnersStayRotation(buildInput())).toEqual(generateWinnersStayRotation(buildInput()));
  });
});
