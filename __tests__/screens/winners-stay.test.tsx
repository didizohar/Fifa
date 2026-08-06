import TestRenderer, { act } from "react-test-renderer";
import { AnimatedPressable } from "../../src/components/AnimatedPressable";
import type { WinnersStaySession } from "../../src/lib/rotation/types";

// winners-stay.tsx pulls in src/lib/players.ts (toPickablePlayer), which
// imports supabase at module load time even though nothing here ever calls
// a network method -- same mocking need as record-match.test.tsx.
jest.mock("../../src/lib/supabase", () => ({
  supabase: { from: jest.fn(), rpc: jest.fn(), storage: { from: jest.fn() } },
}));
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
  removeItem: jest.fn().mockResolvedValue(undefined),
}));

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), dismissAll: jest.fn() };
let mockSearchParams: { matchId?: string; preselectPlayerIds?: string } = {};
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockSearchParams,
  useRouter: () => mockRouter,
}));

jest.mock("../../src/lib/i18n", () => ({
  useTranslation: () => ({ t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key), locale: "en", isRTL: false, setLocale: jest.fn() }),
}));

jest.mock("../../src/hooks/useGroup", () => ({ useGroup: () => ({ currentGroupId: "group-1" }) }));

const ROSTER = [
  { id: "p1", display_name: "Alice", avatar_url: null, custom_color: "#111" },
  { id: "p2", display_name: "Bob", avatar_url: null, custom_color: "#222" },
  { id: "p3", display_name: "Cleo", avatar_url: null, custom_color: "#333" },
  { id: "p4", display_name: "Dan", avatar_url: null, custom_color: "#444" },
];
jest.mock("../../src/hooks/usePlayers", () => ({ usePlayers: () => ({ data: ROSTER, isLoading: false }) }));

jest.mock("../../src/hooks/useMatches", () => ({
  useGroupMatchHistory: () => ({ data: mockGroupHistory }),
  useMatch: () => mockMatchQuery,
}));
let mockMatchQuery: { data: unknown; isError: boolean } = { data: undefined, isError: false };
let mockGroupHistory: unknown[] = [];

let mockLastParticipantIds: string[] = [];
const mockSetLastParticipants = jest.fn((ids: string[]) => {
  mockLastParticipantIds = ids;
});
jest.mock("../../src/hooks/useLastWinnersStayParticipants", () => ({
  useLastWinnersStayParticipants: () => ({ participantIds: mockLastParticipantIds, isHydrated: true, setParticipantIds: mockSetLastParticipants }),
}));

let mockSession: WinnersStaySession | null = null;
const mockSetSession = jest.fn((next: WinnersStaySession | null) => {
  mockSession = next;
  return Promise.resolve();
});
jest.mock("../../src/hooks/useWinnersStaySession", () => ({
  useWinnersStaySession: () => ({ session: mockSession, isHydrated: true, isCorrupted: false, setSession: mockSetSession, discardCorrupted: jest.fn() }),
}));

let mockSessionHistory: unknown[] = [];
const mockSetSessionHistory = jest.fn((next: unknown[]) => {
  mockSessionHistory = next;
});
jest.mock("../../src/hooks/useWinnersStaySessionHistory", () => ({
  useWinnersStaySessionHistory: () => ({ history: mockSessionHistory, setHistory: mockSetSessionHistory }),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const WinnersStayScreen = require("../../app/(app)/winners-stay").default;

function renderScreen() {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<WinnersStayScreen />);
  });
  return renderer;
}

function findByAccessibilityLabel(renderer: TestRenderer.ReactTestRenderer, label: string) {
  const matches = renderer.root.findAllByType(AnimatedPressable).filter((n) => n.props.accessibilityLabel === label);
  if (matches.length === 0) throw new Error(`No AnimatedPressable found with accessibilityLabel "${label}"`);
  return matches[0]!;
}

function findCheckbox(renderer: TestRenderer.ReactTestRenderer, label: string) {
  const matches = renderer.root.findAll((n) => n.props.accessibilityRole === "checkbox" && n.props.accessibilityLabel === label);
  if (matches.length === 0) throw new Error(`No checkbox found with accessibilityLabel "${label}"`);
  return matches[0]!;
}

function togglePlayer(renderer: TestRenderer.ReactTestRenderer, name: string) {
  act(() => {
    findCheckbox(renderer, name).props.onPress();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSearchParams = {};
  mockMatchQuery = { data: undefined, isError: false };
  mockLastParticipantIds = [];
  mockSession = null;
  mockSessionHistory = [];
  mockGroupHistory = [];
});

describe("setup screen -- participant thresholds and format explanation", () => {
  it("Start Session is disabled with zero or one player selected", () => {
    const renderer = renderScreen();
    expect(findByAccessibilityLabel(renderer, "rotation.startSession").props.disabled).toBe(true);
    togglePlayer(renderer, "Alice");
    expect(findByAccessibilityLabel(renderer, "rotation.startSession").props.disabled).toBe(true);
  });

  it("Start Session becomes enabled at exactly two selected players, and shows the duo format label", () => {
    const renderer = renderScreen();
    togglePlayer(renderer, "Alice");
    togglePlayer(renderer, "Bob");
    expect(findByAccessibilityLabel(renderer, "rotation.startSession").props.disabled).toBeFalsy();
    const texts = renderer.root.findAllByProps({ children: "rotation.formatLabelDuo" });
    expect(texts.length).toBeGreaterThan(0);
  });

  it("shows the trio format label at exactly three selected players", () => {
    const renderer = renderScreen();
    togglePlayer(renderer, "Alice");
    togglePlayer(renderer, "Bob");
    togglePlayer(renderer, "Cleo");
    const texts = renderer.root.findAllByProps({ children: "rotation.formatLabelTrio" });
    expect(texts.length).toBeGreaterThan(0);
  });

  it("hides the manual/random pairing control below four selected players", () => {
    const renderer = renderScreen();
    togglePlayer(renderer, "Alice");
    togglePlayer(renderer, "Bob");
    expect(renderer.root.findAllByProps({ children: "rotation.initialPairMode" })).toHaveLength(0);
  });

  it("shows the manual/random pairing control at four or more selected players", () => {
    const renderer = renderScreen();
    togglePlayer(renderer, "Alice");
    togglePlayer(renderer, "Bob");
    togglePlayer(renderer, "Cleo");
    togglePlayer(renderer, "Dan");
    expect(renderer.root.findAllByProps({ children: "rotation.initialPairMode" }).length).toBeGreaterThan(0);
  });
});

describe("starting a duo (2-player) session", () => {
  it("creates a format 'duo' session with no waiting queue, and navigates to record-match as singles", () => {
    const renderer = renderScreen();
    togglePlayer(renderer, "Alice");
    togglePlayer(renderer, "Bob");
    act(() => {
      findByAccessibilityLabel(renderer, "rotation.startSession").props.onPress();
    });

    expect(mockSession).not.toBeNull();
    expect(mockSession!.format).toBe("duo");
    expect(mockSession!.waitingQueue).toEqual([]);
    expect(mockSession!.currentPairA.players).toHaveLength(1);
    expect(mockSession!.currentPairB!.players).toHaveLength(1);

    expect(mockRouter.push).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: "/record-match", params: expect.objectContaining({ matchType: "singles", source: "winnersStay" }) }),
    );
  });

  it("does NOT capture the participant list at start time -- a session is only a draft until its first match saves", () => {
    const renderer = renderScreen();
    togglePlayer(renderer, "Alice");
    togglePlayer(renderer, "Bob");
    act(() => {
      findByAccessibilityLabel(renderer, "rotation.startSession").props.onPress();
    });
    expect(mockSetLastParticipants).not.toHaveBeenCalled();
  });
});

describe("starting a trio (3-player) session", () => {
  it("creates a format 'trio' session with exactly one waiting player, and navigates to record-match as singles", () => {
    const renderer = renderScreen();
    togglePlayer(renderer, "Alice");
    togglePlayer(renderer, "Bob");
    togglePlayer(renderer, "Cleo");
    act(() => {
      findByAccessibilityLabel(renderer, "rotation.startSession").props.onPress();
    });

    expect(mockSession!.format).toBe("trio");
    expect(mockSession!.waitingQueue).toHaveLength(1);
    expect(mockSession!.currentPairA.players).toHaveLength(1);
    expect(mockSession!.currentPairB!.players).toHaveLength(1);
    expect(mockRouter.push).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: "/record-match", params: expect.objectContaining({ matchType: "singles" }) }),
    );
  });
});

describe("active duo session rendering", () => {
  function activeDuoSession(overrides: Partial<WinnersStaySession> = {}): WinnersStaySession {
    const player = (id: string, name: string) => ({ id, display_name: name, avatar_url: null, custom_color: "#111" });
    return {
      id: "duo-1",
      groupId: "group-1",
      format: "duo",
      activePlayerIds: ["p1", "p2", "p3", "p4"],
      currentPairA: { players: [player("p1", "Alice")], consecutiveMatchesPlayed: 1 },
      currentPairB: { players: [player("p2", "Bob")], consecutiveMatchesPlayed: 1 },
      pendingRotation: null,
      waitingQueue: [],
      roundNumber: 0,
      startedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      lastRecordedMatchId: null,
      status: "active",
      longestWinningRun: 1,
      previousSnapshot: null,
      ...overrides,
    };
  }

  it("renders no waiting-queue card at all for a duo session", () => {
    mockSession = activeDuoSession();
    const renderer = renderScreen();
    expect(() => findByAccessibilityLabel(renderer, "rotation.editQueue")).toThrow();
  });

  it("shows the ready-to-record current match card with a Record Result button", () => {
    mockSession = activeDuoSession();
    const renderer = renderScreen();
    expect(() => findByAccessibilityLabel(renderer, "rotation.recordResult")).not.toThrow();
  });
});

describe("first-match validity -- Task 3 draft lifecycle", () => {
  it("duo: recording the first match calls setLastParticipants exactly once with the session's original participants, and advances via the duo path (currentPairB unchanged)", () => {
    const player = (id: string, name: string) => ({ id, display_name: name, avatar_url: null, custom_color: "#111" });
    mockSession = {
      id: "duo-1",
      groupId: "group-1",
      format: "duo",
      activePlayerIds: ["p1", "p2", "p3", "p4"],
      currentPairA: { players: [player("p1", "Alice")], consecutiveMatchesPlayed: 1 },
      currentPairB: { players: [player("p2", "Bob")], consecutiveMatchesPlayed: 1 },
      pendingRotation: null,
      waitingQueue: [],
      roundNumber: 0,
      startedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      lastRecordedMatchId: null,
      status: "active",
      longestWinningRun: 1,
      previousSnapshot: null,
    };
    mockSearchParams = { matchId: "m1" };
    mockMatchQuery = {
      data: { match_type: "singles", sides: [{ result: "win", players: [{ id: "p1" }] }, { result: "loss", players: [{ id: "p2" }] }] },
      isError: false,
    };

    const renderer = renderScreen();
    void renderer;

    expect(mockSetLastParticipants).toHaveBeenCalledTimes(1);
    expect(mockSetLastParticipants).toHaveBeenCalledWith(expect.arrayContaining(["p1", "p2"]));
    expect(mockSetLastParticipants.mock.calls[0]![0]).toHaveLength(2);

    expect(mockSession!.roundNumber).toBe(1);
    expect(mockSession!.lastRecordedMatchId).toBe("m1");
    expect(mockSession!.currentPairA.players.map((p) => p.id)).toEqual(["p1"]);
    expect(mockSession!.currentPairB!.players.map((p) => p.id)).toEqual(["p2"]);
  });

  it("does not re-capture participants on a second recorded match (only fires once, at roundNumber 0 -> 1)", () => {
    const player = (id: string, name: string) => ({ id, display_name: name, avatar_url: null, custom_color: "#111" });
    mockSession = {
      id: "duo-1",
      groupId: "group-1",
      format: "duo",
      activePlayerIds: ["p1", "p2"],
      currentPairA: { players: [player("p1", "Alice")], consecutiveMatchesPlayed: 2 },
      currentPairB: { players: [player("p2", "Bob")], consecutiveMatchesPlayed: 2 },
      pendingRotation: null,
      waitingQueue: [],
      roundNumber: 1, // already recorded a match once before
      startedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      lastRecordedMatchId: "m1",
      status: "active",
      longestWinningRun: 2,
      previousSnapshot: null,
    };
    mockSearchParams = { matchId: "m2" };
    mockMatchQuery = {
      data: { match_type: "singles", sides: [{ result: "win", players: [{ id: "p1" }] }, { result: "loss", players: [{ id: "p2" }] }] },
      isError: false,
    };

    renderScreen();
    expect(mockSetLastParticipants).not.toHaveBeenCalled();
    expect(mockSession!.roundNumber).toBe(2);
  });
});

describe("abandoning a draft (Task 3: never archive a zero-match session)", () => {
  // A session ended (or replaced) before it ever recorded a match --
  // reachable if the user taps "End Session" (or Start New Session, or Back
  // to Home) immediately after starting, without playing anything.
  function zeroMatchCompletedSession(): WinnersStaySession {
    const player = (id: string, name: string) => ({ id, display_name: name, avatar_url: null, custom_color: "#111" });
    return {
      id: "draft-1",
      groupId: "group-1",
      format: "duo",
      activePlayerIds: ["p1", "p2"],
      currentPairA: { players: [player("p1", "Alice")], consecutiveMatchesPlayed: 1 },
      currentPairB: { players: [player("p2", "Bob")], consecutiveMatchesPlayed: 1 },
      pendingRotation: null,
      waitingQueue: [],
      roundNumber: 0,
      startedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      lastRecordedMatchId: null,
      status: "completed",
      longestWinningRun: 1,
      previousSnapshot: null,
    };
  }

  it("Start New Session on a zero-match session: clears the slot without archiving it into history", () => {
    mockSession = zeroMatchCompletedSession();
    const renderer = renderScreen();
    act(() => {
      findByAccessibilityLabel(renderer, "rotation.startNewSession").props.onPress();
    });
    expect(mockSetSessionHistory).not.toHaveBeenCalled();
    expect(mockSetSession).toHaveBeenCalledWith(null);
  });

  it("Back to Home on a zero-match session: clears the slot without archiving it into history", () => {
    mockSession = zeroMatchCompletedSession();
    const renderer = renderScreen();
    act(() => {
      findByAccessibilityLabel(renderer, "rotation.backToHomeFromSummary").props.onPress();
    });
    expect(mockSetSessionHistory).not.toHaveBeenCalled();
    expect(mockSetSession).toHaveBeenCalledWith(null);
    expect(mockRouter.dismissAll).toHaveBeenCalled();
  });

  it("a completed session WITH a recorded match is still archived normally (guard doesn't over-suppress)", () => {
    mockSession = { ...zeroMatchCompletedSession(), roundNumber: 2, lastRecordedMatchId: "m1" };
    const renderer = renderScreen();
    act(() => {
      findByAccessibilityLabel(renderer, "rotation.backToHomeFromSummary").props.onPress();
    });
    expect(mockSetSessionHistory).toHaveBeenCalled();
  });
});

describe("session highlights for duo/trio sessions -- must not be hardcoded to doubles matches", () => {
  function completedDuoSession(): WinnersStaySession {
    const player = (id: string, name: string) => ({ id, display_name: name, avatar_url: null, custom_color: "#111" });
    return {
      id: "duo-1",
      groupId: "group-1",
      format: "duo",
      activePlayerIds: ["p1", "p2"],
      currentPairA: { players: [player("p1", "Alice")], consecutiveMatchesPlayed: 2 },
      currentPairB: { players: [player("p2", "Bob")], consecutiveMatchesPlayed: 1 },
      pendingRotation: null,
      waitingQueue: [],
      roundNumber: 1,
      startedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T01:00:00.000Z",
      lastRecordedMatchId: "m1",
      status: "completed",
      longestWinningRun: 2,
      previousSnapshot: null,
    };
  }

  function singlesMatch() {
    return {
      id: "m1",
      match_type: "singles" as const,
      is_overtime: false,
      is_penalties: false,
      notes: null,
      played_at: "2026-01-01T00:30:00.000Z",
      sides: [
        { id: "s1", side_number: 1 as const, score: 3, penalty_score: null, result: "win" as const, club: null, players: [{ id: "p1", display_name: "Alice", avatar_url: null, custom_color: "#111" }] },
        { id: "s2", side_number: 2 as const, score: 1, penalty_score: null, result: "loss" as const, club: null, players: [{ id: "p2", display_name: "Bob", avatar_url: null, custom_color: "#222" }] },
      ],
    };
  }

  it("counts a duo session's own singles matches instead of filtering them all out as non-doubles", () => {
    mockSession = completedDuoSession();
    mockGroupHistory = [singlesMatch()];
    const renderer = renderScreen();

    expect(renderer.root.findAllByProps({ children: "rotation.sessionHighlights" }).length).toBeGreaterThan(0);
    expect(renderer.root.findAllByProps({ children: "1" }).length).toBeGreaterThan(0); // matchesPlayed
  });

  it("shows no session-highlights block when a duo session genuinely has no matches (not a false positive)", () => {
    mockSession = completedDuoSession();
    mockGroupHistory = [];
    const renderer = renderScreen();

    expect(renderer.root.findAllByProps({ children: "rotation.sessionHighlights" }).length).toBe(0);
  });
});
