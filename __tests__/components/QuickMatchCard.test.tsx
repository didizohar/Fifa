import TestRenderer, { act } from "react-test-renderer";
import { Text } from "react-native";
import { AnimatedPressable } from "../../src/components/AnimatedPressable";
import { ClubBadge } from "../../src/components/ClubBadge";
import { ScoreStepper } from "../../src/components/ScoreStepper";
import { QuickMatchCard } from "../../src/components/QuickMatchCard";
import type { RotationPlayer, WinnersStaySession } from "../../src/lib/rotation/types";

// QuickMatchCard pulls in src/lib/players.ts (toRotationPlayer), which
// imports supabase at module load time -- same mocking need as
// record-match.test.tsx/winners-stay.test.tsx.
jest.mock("../../src/lib/supabase", () => ({
  supabase: { from: jest.fn(), rpc: jest.fn(), storage: { from: jest.fn() } },
}));
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
  removeItem: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../src/lib/i18n", () => ({
  useTranslation: () => ({ t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key), locale: "en", isRTL: false, setLocale: jest.fn() }),
}));

const mockRouter = { push: jest.fn() };
jest.mock("expo-router", () => ({ useRouter: () => mockRouter }));

function player(id: string, name: string): RotationPlayer {
  return { id, display_name: name, avatar_url: null, custom_color: "#111" };
}

const ROSTER = [
  { id: "p1", display_name: "Alice", avatar_url: null, custom_color: "#111" },
  { id: "p2", display_name: "Bob", avatar_url: null, custom_color: "#222" },
  { id: "p3", display_name: "Cleo", avatar_url: null, custom_color: "#333" },
  { id: "p4", display_name: "Dan", avatar_url: null, custom_color: "#444" },
  { id: "p5", display_name: "Eve", avatar_url: null, custom_color: "#555" },
];
let mockPlayersData: typeof ROSTER = ROSTER;
jest.mock("../../src/hooks/usePlayers", () => ({ usePlayers: () => ({ data: mockPlayersData, isLoading: false }) }));

function clubVersion(id: string, starRating: number) {
  return { id: `cv-${id}`, club_id: id, game_version_id: "gv-1", star_rating: starRating, club: { id, name: `Club ${id}`, country: null, league: "League", primary_color: null, secondary_color: null, logo_url: null, group_id: null, notes: null, deleted_at: null } };
}
const CLUB_VERSIONS = [clubVersion("a", 4.5), clubVersion("b", 4.5), clubVersion("c", 5), clubVersion("d", 3.5), clubVersion("e", 4)];
let mockClubVersionsData: typeof CLUB_VERSIONS = CLUB_VERSIONS;
jest.mock("../../src/hooks/useClubVersions", () => ({ useClubVersions: () => ({ data: mockClubVersionsData, isLoading: false }) }));

let mockPreviousMatches: unknown[] = [];
jest.mock("../../src/hooks/useMatches", () => ({ useMatches: () => ({ data: mockPreviousMatches }) }));

jest.mock("../../src/hooks/useNationalTeamsPreference", () => ({ useNationalTeamsPreference: () => ({ includeNationalTeams: true }) }));
jest.mock("../../src/hooks/useSeasons", () => ({ useSeasons: () => ({ data: [] }) }));

let mockLastParticipantIds: string[] | null = null;
const mockSetLastParticipants = jest.fn((ids: string[]) => {
  mockLastParticipantIds = ids;
});
jest.mock("../../src/hooks/useLastWinnersStayParticipants", () => ({
  useLastWinnersStayParticipants: () => ({ participantIds: [], isHydrated: true, setParticipantIds: mockSetLastParticipants }),
}));

let mockRecordMatchImpl: (payload: unknown) => Promise<string> = async () => "new-match-id";
let mockRecordMatchIsPending = false;
const mockMutateAsync = jest.fn((payload: unknown) => mockRecordMatchImpl(payload));
jest.mock("../../src/hooks/useRecordMatch", () => ({
  useRecordMatch: () => ({ mutateAsync: mockMutateAsync, isPending: mockRecordMatchIsPending }),
}));

let mockSession: WinnersStaySession | null = null;
const mockSetSession = jest.fn((next: WinnersStaySession | null) => {
  mockSession = next;
});
jest.mock("../../src/hooks/useWinnersStaySession", () => ({
  useWinnersStaySession: () => ({ session: mockSession, isHydrated: true, setSession: mockSetSession }),
}));

function baseSession(overrides: Partial<WinnersStaySession> = {}): WinnersStaySession {
  return {
    id: "session-1",
    groupId: "group-1",
    format: "group",
    activePlayerIds: ["p1", "p2", "p3", "p4", "p5"],
    currentPairA: { players: [player("p1", "Alice"), player("p2", "Bob")], consecutiveMatchesPlayed: 1 },
    currentPairB: { players: [player("p3", "Cleo"), player("p4", "Dan")], consecutiveMatchesPlayed: 1 },
    pendingRotation: null,
    waitingQueue: [{ playerId: "p5", enteredQueueAt: 0, consecutiveWaitCount: 0 }],
    roundNumber: 1,
    startedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    lastRecordedMatchId: "prev-match",
    status: "active",
    longestWinningRun: 1,
    previousSnapshot: null,
    ...overrides,
  };
}

function duoSession(overrides: Partial<WinnersStaySession> = {}): WinnersStaySession {
  return baseSession({
    format: "duo",
    currentPairA: { players: [player("p1", "Alice")], consecutiveMatchesPlayed: 1 },
    currentPairB: { players: [player("p2", "Bob")], consecutiveMatchesPlayed: 1 },
    waitingQueue: [],
    activePlayerIds: ["p1", "p2"],
    ...overrides,
  });
}

function trioSession(overrides: Partial<WinnersStaySession> = {}): WinnersStaySession {
  return baseSession({
    format: "trio",
    currentPairA: { players: [player("p1", "Alice")], consecutiveMatchesPlayed: 1 },
    currentPairB: { players: [player("p2", "Bob")], consecutiveMatchesPlayed: 1 },
    waitingQueue: [{ playerId: "p3", enteredQueueAt: 0, consecutiveWaitCount: 0 }],
    activePlayerIds: ["p1", "p2", "p3"],
    ...overrides,
  });
}

function renderCard() {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<QuickMatchCard groupId="group-1" gameVersionId="gv-1" />);
  });
  return renderer;
}

function rerender(renderer: TestRenderer.ReactTestRenderer) {
  act(() => {
    renderer.update(<QuickMatchCard groupId="group-1" gameVersionId="gv-1" />);
  });
}

function findButton(renderer: TestRenderer.ReactTestRenderer, label: string) {
  const matches = renderer.root.findAllByType(AnimatedPressable).filter((n) => n.props.accessibilityLabel === label);
  if (matches.length === 0) throw new Error(`No button found with label "${label}"`);
  return matches[0]!;
}

function pressButton(renderer: TestRenderer.ReactTestRenderer, label: string) {
  return act(async () => {
    findButton(renderer, label).props.onPress();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPlayersData = ROSTER;
  mockClubVersionsData = CLUB_VERSIONS;
  mockPreviousMatches = [];
  mockLastParticipantIds = null;
  mockSession = null;
  mockRecordMatchIsPending = false;
  mockRecordMatchImpl = async () => "new-match-id";
});

describe("visibility", () => {
  it("is hidden when there is no active session", () => {
    mockSession = null;
    const renderer = renderCard();
    expect(renderer.toJSON()).toBeNull();
  });

  it("is hidden when the session is completed", () => {
    mockSession = baseSession({ status: "completed" });
    const renderer = renderCard();
    expect(renderer.toJSON()).toBeNull();
  });

  it("is hidden when the session belongs to a different group", () => {
    mockSession = baseSession({ groupId: "other-group" });
    const renderer = renderCard();
    expect(renderer.toJSON()).toBeNull();
  });

  it("is hidden when there is a pending rotation still awaiting review (no valid current matchup yet)", () => {
    mockSession = baseSession({ currentPairB: null, pendingRotation: { stayingPair: [player("p1", "Alice")], opposingPair: null, waitingPlayers: [], rotatedOutPlayers: [], selectionSource: "none", reason: { key: "", params: {} }, drawRotationApplied: false } });
    const renderer = renderCard();
    expect(renderer.toJSON()).toBeNull();
  });

  it("is hidden when a matchup player is no longer on the active roster (archived/deleted)", () => {
    mockSession = baseSession();
    mockPlayersData = ROSTER.filter((p) => p.id !== "p4"); // p4 is in currentPairB
    const renderer = renderCard();
    expect(renderer.toJSON()).toBeNull();
  });

  it("is visible with a valid active session and shows the two sides", () => {
    mockSession = baseSession();
    const renderer = renderCard();
    expect(renderer.toJSON()).not.toBeNull();
    const texts = renderer.root.findAllByType(Text).map((n) => n.props.children);
    expect(texts).toContain("Alice & Bob");
    expect(texts).toContain("Cleo & Dan");
  });
});

describe("session formats", () => {
  it("shows a 2-player (duo) matchup as one player per side", () => {
    mockSession = duoSession();
    const renderer = renderCard();
    const texts = renderer.root.findAllByType(Text).map((n) => n.props.children);
    expect(texts).toContain("Alice");
    expect(texts).toContain("Bob");
  });

  it("shows a 3-player (trio) matchup as one player per side, third player waiting", () => {
    mockSession = trioSession();
    const renderer = renderCard();
    const texts = renderer.root.findAllByType(Text).map((n) => n.props.children);
    expect(texts).toContain("Alice");
    expect(texts).toContain("Bob");
  });

  it("shows a 4+ player (group) matchup as two players per side", () => {
    mockSession = baseSession();
    const renderer = renderCard();
    const texts = renderer.root.findAllByType(Text).map((n) => n.props.children);
    expect(texts).toContain("Alice & Bob");
    expect(texts).toContain("Cleo & Dan");
  });
});

describe("club actions", () => {
  it("Large Clubs draws two distinct clubs from the 4.5/5 star pool", () => {
    mockSession = baseSession();
    const renderer = renderCard();
    act(() => {
      findButton(renderer, "home.quickClubDrawPoolLarge").props.onPress();
    });
    const badges = renderer.root.findAllByType(ClubBadge);
    expect(badges).toHaveLength(2);
    for (const badge of badges) expect([4.5, 5]).toContain(badge.props.starRating);
    expect(badges[0]!.props.name).not.toBe(badges[1]!.props.name);
  });

  it("Small Clubs draws two distinct clubs from the 3.5/4 star pool", () => {
    mockSession = baseSession();
    const renderer = renderCard();
    act(() => {
      findButton(renderer, "home.quickClubDrawPoolSmall").props.onPress();
    });
    const badges = renderer.root.findAllByType(ClubBadge);
    expect(badges).toHaveLength(2);
    for (const badge of badges) expect([3.5, 4]).toContain(badge.props.starRating);
  });

  it("Same Clubs and Swap Clubs are disabled when there is no previous match", () => {
    mockSession = baseSession();
    mockPreviousMatches = [];
    const renderer = renderCard();
    expect(findButton(renderer, "rotation.sameClubsAction").props.disabled).toBe(true);
    expect(findButton(renderer, "rotation.swapClubsAction").props.disabled).toBe(true);
  });

  it("Same Clubs reuses the previous match's exact clubs", () => {
    mockSession = baseSession();
    mockPreviousMatches = [
      { sides: [{ club_version_id: "cv-a", club: { name: "Club a" } }, { club_version_id: "cv-d", club: { name: "Club d" } }] },
    ];
    const renderer = renderCard();
    act(() => {
      findButton(renderer, "rotation.sameClubsAction").props.onPress();
    });
    const badges = renderer.root.findAllByType(ClubBadge);
    expect(badges.map((b) => b.props.name)).toEqual(["Club a", "Club d"]);
  });

  it("Swap Clubs reuses the previous match's clubs with sides swapped", () => {
    mockSession = baseSession();
    mockPreviousMatches = [
      { sides: [{ club_version_id: "cv-a", club: { name: "Club a" } }, { club_version_id: "cv-d", club: { name: "Club d" } }] },
    ];
    const renderer = renderCard();
    act(() => {
      findButton(renderer, "rotation.swapClubsAction").props.onPress();
    });
    const badges = renderer.root.findAllByType(ClubBadge);
    expect(badges.map((b) => b.props.name)).toEqual(["Club d", "Club a"]);
  });
});

describe("Winners Stay navigation", () => {
  it("the Winners Stay button navigates to the full session screen, no new implementation", () => {
    mockSession = baseSession();
    const renderer = renderCard();
    act(() => {
      findButton(renderer, "rotation.title").props.onPress();
    });
    expect(mockRouter.push).toHaveBeenCalledWith("/winners-stay");
  });
});

describe("saving a result", () => {
  function setClubs(renderer: TestRenderer.ReactTestRenderer) {
    act(() => {
      findButton(renderer, "home.quickClubDrawPoolLarge").props.onPress();
    });
  }

  function bumpScore(renderer: TestRenderer.ReactTestRenderer, sideIndex: 0 | 1, times: number) {
    const steppers = renderer.root.findAllByType(ScoreStepper);
    for (let i = 0; i < times; i++) {
      act(() => {
        (steppers[sideIndex]!.props.onChange as (v: number) => void)(i + 1);
      });
    }
  }

  it("Save is disabled until both clubs are assigned", () => {
    mockSession = baseSession();
    const renderer = renderCard();
    expect(findButton(renderer, "editMatch.saveMatchAction").props.disabled).toBe(true);
  });

  it("reuses the exact useRecordMatch mutation with the session's current matchup", async () => {
    mockSession = baseSession({ roundNumber: 3, lastRecordedMatchId: "m-old" });
    const renderer = renderCard();
    setClubs(renderer);
    bumpScore(renderer, 0, 2);

    await pressButton(renderer, "editMatch.saveMatchAction");

    expect(mockMutateAsync).toHaveBeenCalledTimes(1);
    const payload = mockMutateAsync.mock.calls[0]![0] as { matchType: string; sides: { playerIds: string[]; score: number; result: string }[] };
    expect(payload.matchType).toBe("doubles");
    expect(payload.sides[0]!.playerIds).toEqual(["p1", "p2"]);
    expect(payload.sides[1]!.playerIds).toEqual(["p3", "p4"]);
    expect(payload.sides[0]!.score).toBe(2);
    expect(payload.sides[0]!.result).toBe("win");
    expect(payload.sides[1]!.result).toBe("loss");
  });

  it("advances the session via the shared rotation engine and auto-accepts the next matchup (group format)", async () => {
    mockSession = baseSession({ roundNumber: 3, lastRecordedMatchId: "m-old" });
    const renderer = renderCard();
    setClubs(renderer);
    bumpScore(renderer, 0, 1);

    await pressButton(renderer, "editMatch.saveMatchAction");

    expect(mockSetSession).toHaveBeenCalled();
    expect(mockSession!.roundNumber).toBe(4);
    expect(mockSession!.lastRecordedMatchId).toBe("new-match-id");
    // "a"+"b" won and stay; a next matchup was auto-accepted (not left pending for review).
    expect(mockSession!.currentPairA.players.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(mockSession!.pendingRotation).toBeNull();
  });

  it("next matchup updates on screen after saving (new players shown)", async () => {
    mockSession = trioSession({ roundNumber: 2, lastRecordedMatchId: "m-old" });
    const renderer = renderCard();
    setClubs(renderer);
    bumpScore(renderer, 0, 1); // p1 (Alice) wins clearly, so the draw tiebreak can't decide who stays

    await pressButton(renderer, "editMatch.saveMatchAction");
    rerender(renderer);

    // p1 won and stays, p3 (the only waiter) enters -- p2 now waits.
    const texts = renderer.root.findAllByType(Text).map((n) => n.props.children);
    expect(texts).toContain("Alice");
    expect(texts).toContain("Cleo");
  });

  it("hides the card once the session runs out of a valid next matchup (Case 4 -- nobody left waiting)", async () => {
    mockSession = trioSession({ waitingQueue: [], roundNumber: 5, lastRecordedMatchId: "m-old" }); // trio with 0 waiting collapses to Case 4 after advancing
    const renderer = renderCard();
    setClubs(renderer);

    await pressButton(renderer, "editMatch.saveMatchAction");
    rerender(renderer);

    expect(renderer.toJSON()).toBeNull();
  });

  it("captures the participant snapshot only on a session's first recorded match (Task 3 draft-validity rule)", async () => {
    mockSession = duoSession({ roundNumber: 0, lastRecordedMatchId: null });
    const renderer = renderCard();
    setClubs(renderer);

    await pressButton(renderer, "editMatch.saveMatchAction");

    expect(mockSetLastParticipants).toHaveBeenCalledTimes(1);
    expect(mockLastParticipantIds).toEqual(expect.arrayContaining(["p1", "p2"]));
  });

  it("does not capture the participant snapshot again on a later match", async () => {
    mockSession = duoSession({ roundNumber: 4, lastRecordedMatchId: "m-old" });
    const renderer = renderCard();
    setClubs(renderer);

    await pressButton(renderer, "editMatch.saveMatchAction");

    expect(mockSetLastParticipants).not.toHaveBeenCalled();
  });

  it("repeated rapid Save taps only submit once", async () => {
    mockSession = baseSession({ roundNumber: 3, lastRecordedMatchId: "m-old" });
    let resolveMutation!: (id: string) => void;
    mockRecordMatchImpl = () => new Promise((resolve) => (resolveMutation = resolve));
    const renderer = renderCard();
    setClubs(renderer);

    await act(async () => {
      const btn = findButton(renderer, "editMatch.saveMatchAction");
      btn.props.onPress();
      btn.props.onPress();
      btn.props.onPress();
      await Promise.resolve();
    });

    expect(mockMutateAsync).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveMutation("new-match-id");
      await Promise.resolve();
      await Promise.resolve();
    });
  });

  it("a failed save shows an error, does not advance the session, and re-enables Save for retry", async () => {
    mockSession = baseSession({ roundNumber: 3, lastRecordedMatchId: "m-old" });
    mockRecordMatchImpl = () => Promise.reject(new Error("network exploded"));
    const renderer = renderCard();
    setClubs(renderer);

    await pressButton(renderer, "editMatch.saveMatchAction");

    expect(mockSetSession).not.toHaveBeenCalled();
    const texts = renderer.root.findAllByType(Text).map((n) => n.props.children);
    expect(texts).toContain("network exploded");

    // Retry is possible -- the guard was released.
    mockRecordMatchImpl = async () => "new-match-id";
    await pressButton(renderer, "editMatch.saveMatchAction");
    expect(mockSetSession).toHaveBeenCalled();
  });

  it("never issues a duplicate match save even across a slow first attempt followed by a second tap", async () => {
    mockSession = baseSession({ roundNumber: 3, lastRecordedMatchId: "m-old" });
    const renderer = renderCard();
    setClubs(renderer);
    await pressButton(renderer, "editMatch.saveMatchAction");
    expect(mockMutateAsync).toHaveBeenCalledTimes(1);
  });
});
