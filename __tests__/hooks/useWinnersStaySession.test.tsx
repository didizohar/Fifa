import TestRenderer, { act } from "react-test-renderer";
import { Text } from "react-native";
import { useWinnersStaySession } from "../../src/hooks/useWinnersStaySession";
import type { WinnersStaySession } from "../../src/lib/rotation/types";

let mockIsFocused = true;
jest.mock("expo-router", () => ({
  useIsFocused: () => mockIsFocused,
}));

/**
 * An in-memory stand-in for the `active_sessions` table -- keyed by
 * group_id, exactly like the real schema (see
 * supabase/migrations/20260811164500_shared_active_sessions.sql). Two
 * independent hook instances (simulating two different users/devices) both
 * reading and writing through this SAME map is what proves the session is
 * genuinely shared backend state, not per-instance local state -- the
 * previous AsyncStorage-backed version of this hook could never express
 * that, since each hook instance had its own isolated mock store.
 */
const mockServerRows = new Map<string, { session: WinnersStaySession; version: number }>();

jest.mock("../../src/lib/activeSessions", () => ({
  fetchActiveSession: jest.fn(async (groupId: string) => mockServerRows.get(groupId) ?? null),
  startActiveSession: jest.fn(async (groupId: string, session: WinnersStaySession) => {
    if (mockServerRows.has(groupId)) return { ok: "stale" as const };
    mockServerRows.set(groupId, { session, version: 0 });
    return { ok: true as const, version: 0 };
  }),
  updateActiveSession: jest.fn(async (groupId: string, expectedVersion: number, nextSession: WinnersStaySession) => {
    const row = mockServerRows.get(groupId);
    if (!row || row.version !== expectedVersion) return { ok: "stale" as const };
    const nextVersion = expectedVersion + 1;
    mockServerRows.set(groupId, { session: nextSession, version: nextVersion });
    return { ok: true as const, version: nextVersion };
  }),
  endActiveSession: jest.fn(async (groupId: string) => {
    mockServerRows.delete(groupId);
  }),
}));

function session(overrides: Partial<WinnersStaySession> = {}): WinnersStaySession {
  const player = (id: string, name: string) => ({ id, display_name: name, avatar_url: null, custom_color: "#111" });
  return {
    id: "session-1",
    groupId: "group-1",
    format: "duo",
    activePlayerIds: ["p1", "p2"],
    currentPairA: { players: [player("p1", "Alice")], consecutiveMatchesPlayed: 1 },
    currentPairB: { players: [player("p2", "Bob")], consecutiveMatchesPlayed: 1 },
    pendingRotation: null,
    waitingQueue: [],
    roundNumber: 1,
    startedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    lastRecordedMatchId: "m1",
    status: "active",
    longestWinningRun: 1,
    previousSnapshot: null,
    ...overrides,
  };
}

let lastHydrated: { session: WinnersStaySession | null; version: number | null; isHydrated: boolean; isCorrupted: boolean } | null = null;
let lastApi: ReturnType<typeof useWinnersStaySession> | null = null;
function Harness({ groupId }: { groupId: string | null }) {
  const api = useWinnersStaySession(groupId);
  lastHydrated = { session: api.session, version: api.version, isHydrated: api.isHydrated, isCorrupted: api.isCorrupted };
  lastApi = api;
  return <Text>{api.session?.id ?? "none"}</Text>;
}

async function renderHarness(groupId: string | null) {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(<Harness groupId={groupId} />);
    await Promise.resolve();
    await Promise.resolve();
  });
  return renderer;
}

beforeEach(() => {
  mockServerRows.clear();
  mockIsFocused = true;
  lastHydrated = null;
  lastApi = null;
});

describe("useWinnersStaySession -- refocus resync (Dashboard tab-persistence fix)", () => {
  it("hydrates from the shared backend on mount while focused", async () => {
    mockServerRows.set("group-1", { session: session({ id: "s1" }), version: 3 });
    await renderHarness("group-1");
    expect(lastHydrated!.session?.id).toBe("s1");
    expect(lastHydrated!.version).toBe(3);
    expect(lastHydrated!.isHydrated).toBe(true);
  });

  it("picks up a session that was created on the backend entirely AFTER mount, once this instance regains focus", async () => {
    // Nothing exists yet -- mirrors opening the Dashboard tab before any session exists.
    const renderer = await renderHarness("group-1");
    expect(lastHydrated!.session).toBeNull();

    // The user leaves this tab (it stays mounted -- tabs never unmount) and,
    // from a DIFFERENT screen (Start Evening) -- or, just as validly, a
    // DIFFERENT group member's device -- starts a brand-new session.
    await act(async () => {
      mockIsFocused = false;
      renderer.update(<Harness groupId="group-1" />);
    });
    mockServerRows.set("group-1", { session: session({ id: "new-session" }), version: 0 });

    // ...and now the user switches back to this (still-mounted) tab.
    await act(async () => {
      mockIsFocused = true;
      renderer.update(<Harness groupId="group-1" />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(lastHydrated!.session?.id).toBe("new-session");
  });

  it("picks up a session ADVANCED (not just created) elsewhere while this instance was unfocused", async () => {
    mockServerRows.set("group-1", { session: session({ id: "s1", roundNumber: 1 }), version: 1 });
    const renderer = await renderHarness("group-1");
    expect(lastHydrated!.session?.roundNumber).toBe(1);

    await act(async () => {
      mockIsFocused = false;
      renderer.update(<Harness groupId="group-1" />);
    });
    mockServerRows.set("group-1", { session: session({ id: "s1", roundNumber: 4 }), version: 4 });

    await act(async () => {
      mockIsFocused = true;
      renderer.update(<Harness groupId="group-1" />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(lastHydrated!.session?.roundNumber).toBe(4);
    expect(lastHydrated!.version).toBe(4);
  });

  it("correctly reflects a session that was ENDED (cleared) elsewhere while unfocused", async () => {
    mockServerRows.set("group-1", { session: session({ id: "s1" }), version: 0 });
    const renderer = await renderHarness("group-1");
    expect(lastHydrated!.session).not.toBeNull();

    await act(async () => {
      mockIsFocused = false;
      renderer.update(<Harness groupId="group-1" />);
    });
    mockServerRows.delete("group-1");

    await act(async () => {
      mockIsFocused = true;
      renderer.update(<Harness groupId="group-1" />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(lastHydrated!.session).toBeNull();
  });

  it("does not flash the loading state on a refocus resync (only the very first read per group shows it)", async () => {
    mockServerRows.set("group-1", { session: session({ id: "s1" }), version: 0 });
    const renderer = await renderHarness("group-1");
    expect(lastHydrated!.isHydrated).toBe(true);

    await act(async () => {
      mockIsFocused = false;
      renderer.update(<Harness groupId="group-1" />);
    });
    expect(lastHydrated!.isHydrated).toBe(true);

    await act(async () => {
      mockIsFocused = true;
      renderer.update(<Harness groupId="group-1" />);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(lastHydrated!.isHydrated).toBe(true);
  });

  it("treats a group switch as a fresh first read (shows loading state) even after a previous group already hydrated", async () => {
    mockServerRows.set("group-1", { session: session({ id: "s1", groupId: "group-1" }), version: 0 });
    mockServerRows.set("group-2", { session: session({ id: "s2", groupId: "group-2" }), version: 0 });
    const renderer = await renderHarness("group-1");
    expect(lastHydrated!.session?.id).toBe("s1");

    await act(async () => {
      renderer.update(<Harness groupId="group-2" />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(lastHydrated!.session?.id).toBe("s2");
    expect(lastHydrated!.isHydrated).toBe(true);
  });

  it("never leaks a different group's session in after switching groups (group-safety)", async () => {
    mockServerRows.set("group-1", { session: session({ id: "s1", groupId: "group-1" }), version: 0 });
    const renderer = await renderHarness("group-1");
    expect(lastHydrated!.session?.id).toBe("s1");

    await act(async () => {
      renderer.update(<Harness groupId="group-2" />);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(lastHydrated!.session).toBeNull();
  });
});

describe("useWinnersStaySession -- genuinely shared across two independent instances (two users/devices)", () => {
  it("a session started by one hook instance is visible to a second, independent instance for the same group", async () => {
    // Instance A: nothing active yet.
    const rendererA = await renderHarness("group-1");
    expect(lastHydrated!.session).toBeNull();
    const apiA = lastApi!;

    // Instance A starts a session (Didi taps "Start Evening").
    await act(async () => {
      await apiA.setSession(session({ id: "shared-session" }));
    });

    // Instance B (Daniel's own device/hook instance) mounts fresh and reads
    // the SAME backend state -- not instance A's in-memory state.
    await renderHarness("group-1");
    expect(lastHydrated!.session?.id).toBe("shared-session");
    void rendererA;
  });

  it("ending a session on one instance is reflected by a fresh read on another", async () => {
    mockServerRows.set("group-1", { session: session({ id: "s1" }), version: 0 });
    await renderHarness("group-1");
    const apiA = lastApi!;

    await act(async () => {
      await apiA.setSession(null);
    });

    await renderHarness("group-1");
    expect(lastHydrated!.session).toBeNull();
  });

  it("a second member's device only ever sees sessions for groups they're a member of (never leaks a different group's session by construction, since fetch is always scoped to the requested groupId)", async () => {
    mockServerRows.set("group-1", { session: session({ id: "s1", groupId: "group-1" }), version: 0 });
    await renderHarness("group-2");
    expect(lastHydrated!.session).toBeNull();
  });
});

describe("useWinnersStaySession -- setSession (optimistic-concurrency writes for non-match mutations)", () => {
  it("starting a session (version === null) inserts at version 0", async () => {
    await renderHarness("group-1");
    const api = lastApi!;
    await act(async () => {
      await api.setSession(session());
    });
    expect(lastHydrated!.version).toBe(0);
    expect(mockServerRows.get("group-1")?.version).toBe(0);
  });

  it("updating an existing session increments the version via compare-and-swap", async () => {
    mockServerRows.set("group-1", { session: session({ roundNumber: 1 }), version: 2 });
    await renderHarness("group-1");
    const api = lastApi!;
    await act(async () => {
      await api.setSession(session({ roundNumber: 2 }));
    });
    expect(lastHydrated!.version).toBe(3);
  });

  it("null ends the session -- deletes the shared row, both locally and on the backend", async () => {
    mockServerRows.set("group-1", { session: session(), version: 0 });
    await renderHarness("group-1");
    const api = lastApi!;
    await act(async () => {
      await api.setSession(null);
    });
    expect(lastHydrated!.session).toBeNull();
    expect(mockServerRows.has("group-1")).toBe(false);
  });

  it("a stale write (version already moved on) refetches and converges instead of throwing or silently overwriting", async () => {
    mockServerRows.set("group-1", { session: session({ roundNumber: 1 }), version: 2 });
    await renderHarness("group-1");
    const api = lastApi!;

    // Someone else wrote first, bumping the server's version to 3 --
    // simulated by mutating the backend directly between this instance's
    // read and its write.
    mockServerRows.set("group-1", { session: session({ roundNumber: 5 }), version: 3 });

    await act(async () => {
      await api.setSession(session({ roundNumber: 2 })); // still using the stale version=2 it read
    });

    // Converged on the ACTUAL current server state (roundNumber 5), not the
    // stale local write this instance attempted.
    expect(lastHydrated!.session?.roundNumber).toBe(5);
    expect(lastHydrated!.version).toBe(3);
  });
});

describe("useWinnersStaySession -- adoptSession (local-only, for a write already committed atomically elsewhere)", () => {
  it("updates local session/version without issuing any additional backend write", async () => {
    mockServerRows.set("group-1", { session: session({ roundNumber: 1 }), version: 2 });
    await renderHarness("group-1");
    const api = lastApi!;

    act(() => {
      api.adoptSession(session({ roundNumber: 2, lastRecordedMatchId: "m-new" }), 3);
    });

    expect(lastHydrated!.session?.roundNumber).toBe(2);
    expect(lastHydrated!.session?.lastRecordedMatchId).toBe("m-new");
    expect(lastHydrated!.version).toBe(3);
    // The backend row is untouched by adoptSession itself -- whatever
    // committed it (e.g. record_match_and_advance_session) already wrote
    // it there atomically.
    expect(mockServerRows.get("group-1")?.version).toBe(2);
  });
});
