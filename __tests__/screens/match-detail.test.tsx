import TestRenderer, { act } from "react-test-renderer";
import { Button } from "../../src/components/Button";
import type { MatchSummary } from "../../src/lib/matches";
import type { WinnersStaySession } from "../../src/lib/rotation/types";

const mockRouter = { push: jest.fn(), dismissTo: jest.fn() };
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "match-1" }),
  useRouter: () => mockRouter,
}));

jest.mock("../../src/lib/i18n", () => ({
  useTranslation: () => ({ t: (key: string) => key, locale: "en", isRTL: false, setLocale: jest.fn() }),
}));

jest.mock("../../src/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));

let mockCurrentRole: "owner" | "admin" | "member" = "owner";
const mockGroup = { id: "group-1" };
jest.mock("../../src/hooks/useGroup", () => ({ useGroup: () => ({ currentGroup: mockGroup, currentRole: mockCurrentRole }) }));

let mockMatch: MatchSummary | null = null;
jest.mock("../../src/hooks/useMatches", () => ({
  useMatch: () => ({ data: mockMatch, isLoading: false, isError: false, refetch: jest.fn() }),
}));

let mockSession: WinnersStaySession | null = null;
jest.mock("../../src/hooks/useWinnersStaySession", () => ({
  useWinnersStaySession: () => ({ session: mockSession, isHydrated: true, setSession: jest.fn() }),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const MatchDetailScreen = require("../../app/(app)/match/[id]").default;

function player(id: string, name: string) {
  return { id, display_name: name, avatar_url: null, custom_color: "#111" };
}

function makeMatch(overrides: Partial<MatchSummary> = {}): MatchSummary {
  return {
    id: "match-1",
    match_type: "singles",
    is_overtime: false,
    is_penalties: false,
    notes: null,
    played_at: "2026-01-01T00:00:00.000Z",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    created_by: "user-1",
    sides: [
      { id: "s1", side_number: 1, score: 3, penalty_score: null, result: "win", club_version_id: "cv-a", club: { id: "a", name: "Club A" }, players: [player("p1", "Alice")] },
      { id: "s2", side_number: 2, score: 1, penalty_score: null, result: "loss", club_version_id: "cv-b", club: { id: "b", name: "Club B" }, players: [player("p2", "Bob")] },
    ],
    ...overrides,
  };
}

function sessionBase(overrides: Partial<WinnersStaySession> = {}): WinnersStaySession {
  return {
    id: "session-1",
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
    status: "active",
    longestWinningRun: 1,
    previousSnapshot: null,
    ...overrides,
  };
}

function renderScreen() {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<MatchDetailScreen />);
  });
  return renderer;
}

function findButtonByLabel(renderer: TestRenderer.ReactTestRenderer, label: string) {
  return renderer.root.findAllByType(Button).find((n) => n.props.label === label);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCurrentRole = "owner";
  mockMatch = null;
  mockSession = null;
});

describe("post-save continue-session action -- 2-player (duo) sessions", () => {
  it("shows 'Next Match' (not just Edit Match) after saving a duo session's match", () => {
    mockMatch = makeMatch({ match_type: "singles" });
    mockSession = sessionBase({ format: "duo" });
    const renderer = renderScreen();

    expect(findButtonByLabel(renderer, "rotation.nextMatchAction")).toBeDefined();
    expect(findButtonByLabel(renderer, "editMatch.entryAction")).toBeDefined();
  });

  it("does not show the group-format Winners Stay label or a random waiting-queue label for a duo session", () => {
    mockMatch = makeMatch({ match_type: "singles" });
    mockSession = sessionBase({ format: "duo" });
    const renderer = renderScreen();

    expect(findButtonByLabel(renderer, "rotation.title")).toBeUndefined();
    expect(findButtonByLabel(renderer, "rotation.winnerStaysAction")).toBeUndefined();
  });

  it("tapping Next Match dismisses back into the existing Winners Stay screen -- no new implementation", () => {
    mockMatch = makeMatch({ match_type: "singles" });
    mockSession = sessionBase({ format: "duo" });
    const renderer = renderScreen();

    act(() => {
      findButtonByLabel(renderer, "rotation.nextMatchAction")!.props.onPress();
    });
    expect(mockRouter.dismissTo).toHaveBeenCalledWith({ pathname: "/winners-stay", params: { matchId: "match-1" } });
  });
});

describe("post-save continue-session action -- 3-player (trio) sessions", () => {
  it("shows 'Winner Stays' after saving a trio session's match", () => {
    mockMatch = makeMatch({ match_type: "singles" });
    mockSession = sessionBase({
      format: "trio",
      currentPairA: { players: [player("p1", "Alice")], consecutiveMatchesPlayed: 1 },
      currentPairB: { players: [player("p2", "Bob")], consecutiveMatchesPlayed: 1 },
      waitingQueue: [{ playerId: "p3", enteredQueueAt: 0, consecutiveWaitCount: 0 }],
      activePlayerIds: ["p1", "p2", "p3"],
    });
    const renderer = renderScreen();

    expect(findButtonByLabel(renderer, "rotation.winnerStaysAction")).toBeDefined();
    expect(findButtonByLabel(renderer, "editMatch.entryAction")).toBeDefined();
  });
});

describe("post-save continue-session action -- 4+ player (group) sessions unchanged", () => {
  it("still shows the existing 'Winners Stay' label for a group/doubles session", () => {
    mockMatch = makeMatch({
      match_type: "doubles",
      sides: [
        { id: "s1", side_number: 1, score: 3, penalty_score: null, result: "win", club_version_id: "cv-a", club: { id: "a", name: "Club A" }, players: [player("p1", "Alice"), player("p2", "Bob")] },
        { id: "s2", side_number: 2, score: 1, penalty_score: null, result: "loss", club_version_id: "cv-b", club: { id: "b", name: "Club B" }, players: [player("p3", "Cleo"), player("p4", "Dan")] },
      ],
    });
    mockSession = sessionBase({
      format: "group",
      currentPairA: { players: [player("p1", "Alice"), player("p2", "Bob")], consecutiveMatchesPlayed: 1 },
      currentPairB: { players: [player("p3", "Cleo"), player("p4", "Dan")], consecutiveMatchesPlayed: 1 },
      waitingQueue: [],
      activePlayerIds: ["p1", "p2", "p3", "p4"],
    });
    const renderer = renderScreen();

    expect(findButtonByLabel(renderer, "rotation.title")).toBeDefined();
    expect(findButtonByLabel(renderer, "rotation.nextMatchAction")).toBeUndefined();
    expect(findButtonByLabel(renderer, "rotation.winnerStaysAction")).toBeUndefined();
  });
});

describe("continue-session button eligibility", () => {
  it("is hidden when there is no active Winners Stay session at all", () => {
    mockMatch = makeMatch({ match_type: "singles" });
    mockSession = null;
    const renderer = renderScreen();
    expect(findButtonByLabel(renderer, "rotation.nextMatchAction")).toBeUndefined();
    expect(findButtonByLabel(renderer, "rotation.title")).toBeUndefined();
  });

  it("is hidden once this exact match has already advanced the session (idempotent -- no double-advance UI)", () => {
    mockMatch = makeMatch({ match_type: "singles" });
    mockSession = sessionBase({ format: "duo", roundNumber: 1, lastRecordedMatchId: "match-1" });
    const renderer = renderScreen();
    expect(findButtonByLabel(renderer, "rotation.nextMatchAction")).toBeUndefined();
  });

  it("is hidden when the match type doesn't match the active session's format (e.g. an unrelated doubles match while a duo session is active)", () => {
    mockMatch = makeMatch({
      match_type: "doubles",
      sides: [
        { id: "s1", side_number: 1, score: 3, penalty_score: null, result: "win", club_version_id: "cv-a", club: { id: "a", name: "Club A" }, players: [player("p5", "Eve"), player("p6", "Finn")] },
        { id: "s2", side_number: 2, score: 1, penalty_score: null, result: "loss", club_version_id: "cv-b", club: { id: "b", name: "Club B" }, players: [player("p7", "Gil"), player("p8", "Hana")] },
      ],
    });
    mockSession = sessionBase({ format: "duo" });
    const renderer = renderScreen();
    expect(findButtonByLabel(renderer, "rotation.nextMatchAction")).toBeUndefined();
  });

  it("Edit Match remains available even when the continue-session action is hidden", () => {
    mockMatch = makeMatch({ match_type: "singles" });
    mockSession = null;
    const renderer = renderScreen();
    expect(findButtonByLabel(renderer, "editMatch.entryAction")).toBeDefined();
  });

  it("first saved match (session roundNumber 0, promoted from draft) is eligible to continue -- Task 3's draft rule doesn't block the very first round", () => {
    mockMatch = makeMatch({ match_type: "singles" });
    mockSession = sessionBase({ format: "duo", roundNumber: 0, lastRecordedMatchId: null });
    const renderer = renderScreen();
    expect(findButtonByLabel(renderer, "rotation.nextMatchAction")).toBeDefined();
  });
});
