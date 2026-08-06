import TestRenderer, { act } from "react-test-renderer";
import { Text } from "react-native";
import { useWinnersStaySession } from "../../src/hooks/useWinnersStaySession";
import type { WinnersStaySession } from "../../src/lib/rotation/types";

let mockIsFocused = true;
jest.mock("expo-router", () => ({
  useIsFocused: () => mockIsFocused,
}));

const mockStore = new Map<string, string>();
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn((key: string) => Promise.resolve(mockStore.get(key) ?? null)),
  setItem: jest.fn((key: string, value: string) => {
    mockStore.set(key, value);
    return Promise.resolve();
  }),
  removeItem: jest.fn((key: string) => {
    mockStore.delete(key);
    return Promise.resolve();
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

function storageKey(groupId: string): string {
  return `fc-rival:winnersStaySession:${groupId}`;
}

let lastHydrated: { session: WinnersStaySession | null; isHydrated: boolean; isCorrupted: boolean } | null = null;
function Harness({ groupId }: { groupId: string | null }) {
  const { session: s, isHydrated, isCorrupted } = useWinnersStaySession(groupId);
  lastHydrated = { session: s, isHydrated, isCorrupted };
  return <Text>{s?.id ?? "none"}</Text>;
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
  mockStore.clear();
  mockIsFocused = true;
  lastHydrated = null;
});

describe("useWinnersStaySession -- refocus resync (Dashboard tab-persistence fix)", () => {
  it("hydrates from storage on mount while focused", async () => {
    mockStore.set(storageKey("group-1"), JSON.stringify(session({ id: "s1" })));
    await renderHarness("group-1");
    expect(lastHydrated!.session?.id).toBe("s1");
    expect(lastHydrated!.isHydrated).toBe(true);
  });

  it("picks up a session that was created in storage entirely AFTER mount, once this instance regains focus", async () => {
    // Nothing exists yet -- mirrors opening the Dashboard tab before any session exists.
    const renderer = await renderHarness("group-1");
    expect(lastHydrated!.session).toBeNull();

    // The user leaves this tab (it stays mounted -- tabs never unmount) and,
    // from a DIFFERENT screen (Start Evening), starts a brand-new session.
    // That screen's own hook instance writes directly to storage.
    await act(async () => {
      mockIsFocused = false;
      renderer.update(<Harness groupId="group-1" />);
    });
    mockStore.set(storageKey("group-1"), JSON.stringify(session({ id: "new-session" })));

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
    mockStore.set(storageKey("group-1"), JSON.stringify(session({ id: "s1", roundNumber: 1 })));
    const renderer = await renderHarness("group-1");
    expect(lastHydrated!.session?.roundNumber).toBe(1);

    await act(async () => {
      mockIsFocused = false;
      renderer.update(<Harness groupId="group-1" />);
    });
    mockStore.set(storageKey("group-1"), JSON.stringify(session({ id: "s1", roundNumber: 4 })));

    await act(async () => {
      mockIsFocused = true;
      renderer.update(<Harness groupId="group-1" />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(lastHydrated!.session?.roundNumber).toBe(4);
  });

  it("correctly reflects a session that was ENDED (cleared) elsewhere while unfocused", async () => {
    mockStore.set(storageKey("group-1"), JSON.stringify(session({ id: "s1" })));
    const renderer = await renderHarness("group-1");
    expect(lastHydrated!.session).not.toBeNull();

    await act(async () => {
      mockIsFocused = false;
      renderer.update(<Harness groupId="group-1" />);
    });
    mockStore.delete(storageKey("group-1"));

    await act(async () => {
      mockIsFocused = true;
      renderer.update(<Harness groupId="group-1" />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(lastHydrated!.session).toBeNull();
  });

  it("does not flash the loading state on a refocus resync (only the very first read per group shows it)", async () => {
    mockStore.set(storageKey("group-1"), JSON.stringify(session({ id: "s1" })));
    const renderer = await renderHarness("group-1");
    expect(lastHydrated!.isHydrated).toBe(true);

    await act(async () => {
      mockIsFocused = false;
      renderer.update(<Harness groupId="group-1" />);
    });
    // isHydrated must stay true while unfocused -- nothing re-ran yet.
    expect(lastHydrated!.isHydrated).toBe(true);

    await act(async () => {
      mockIsFocused = true;
      renderer.update(<Harness groupId="group-1" />);
      await Promise.resolve();
      await Promise.resolve();
    });
    // Still true throughout the resync -- never dips back to false.
    expect(lastHydrated!.isHydrated).toBe(true);
  });

  it("treats a group switch as a fresh first read (shows loading state) even after a previous group already hydrated", async () => {
    mockStore.set(storageKey("group-1"), JSON.stringify(session({ id: "s1", groupId: "group-1" })));
    mockStore.set(storageKey("group-2"), JSON.stringify(session({ id: "s2", groupId: "group-2" })));
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
    mockStore.set(storageKey("group-1"), JSON.stringify(session({ id: "s1", groupId: "group-1" })));
    const renderer = await renderHarness("group-1");
    expect(lastHydrated!.session?.id).toBe("s1");

    // Switch to a group with no session at all.
    await act(async () => {
      renderer.update(<Harness groupId="group-2" />);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(lastHydrated!.session).toBeNull();
  });
});
