import TestRenderer, { act } from "react-test-renderer";
import { AnimatedPressable } from "../../src/components/AnimatedPressable";
import { ClubBadge } from "../../src/components/ClubBadge";
import { ScoreStepper } from "../../src/components/ScoreStepper";

// record-match.tsx statically imports ClubPickerSheet, which pulls in the
// real Supabase/AsyncStorage chain even though the sheet itself is never
// rendered in these tests (it only mounts when clubPickerSide !== null) --
// the import chain still executes at module-load time regardless. Same
// mocking pattern already established in groups.test.ts.
jest.mock("../../src/lib/supabase", () => ({
  supabase: { from: jest.fn(), rpc: jest.fn(), storage: { from: jest.fn() } },
}));
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
  removeItem: jest.fn().mockResolvedValue(undefined),
  multiRemove: jest.fn().mockResolvedValue(undefined),
}));

// --- expo-router ---------------------------------------------------------
const mockRouter = { replace: jest.fn(), push: jest.fn(), back: jest.fn(), dismissAll: jest.fn() };
let capturedBeforeRemove: ((e: { preventDefault: () => void; data: { action: unknown } }) => void) | null = null;
const mockDispatch = jest.fn();
const mockAddListener = jest.fn((event: string, cb: typeof capturedBeforeRemove extends infer T ? NonNullable<T> : never) => {
  if (event === "beforeRemove") capturedBeforeRemove = cb;
  return () => {};
});
let mockSearchParams: Record<string, string> = {};

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockSearchParams,
  useNavigation: () => ({ addListener: mockAddListener, dispatch: mockDispatch }),
  useRouter: () => mockRouter,
  Stack: { Screen: () => null },
}));

// --- i18n: identity translator, no LocaleProvider needed ------------------
jest.mock("../../src/lib/i18n", () => ({
  useTranslation: () => ({ t: (key: string) => key, locale: "en", isRTL: false, setLocale: jest.fn() }),
}));

// --- confirm/notify: spy so dialog-shown is directly observable ----------
const mockConfirmAction = jest.fn();
const mockNotify = jest.fn();
jest.mock("../../src/lib/confirm", () => ({
  confirmAction: (...args: unknown[]) => mockConfirmAction(...args),
  notify: (...args: unknown[]) => mockNotify(...args),
}));

// --- data hooks ------------------------------------------------------------
const mockGroup = { id: "group-1", default_game_version_id: "gv-1" };
jest.mock("../../src/hooks/useGroup", () => ({ useGroup: () => ({ currentGroup: mockGroup, currentRole: "owner" }) }));
jest.mock("../../src/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));

const PLAYERS = [
  { id: "p1", display_name: "Alice", avatar_url: null, custom_color: "#111" },
  { id: "p2", display_name: "Bob", avatar_url: null, custom_color: "#222" },
];
const CLUB_VERSIONS = [
  { id: "c1", club_id: "club-1", game_version_id: "gv-1", star_rating: 4, club: { id: "club-1", name: "Club One" } },
  { id: "c2", club_id: "club-2", game_version_id: "gv-1", star_rating: 4, club: { id: "club-2", name: "Club Two" } },
];

jest.mock("../../src/hooks/usePlayers", () => ({ usePlayers: () => ({ data: PLAYERS, isLoading: false }) }));
jest.mock("../../src/hooks/useClubVersions", () => ({ useClubVersions: () => ({ data: CLUB_VERSIONS, isLoading: false }) }));
jest.mock("../../src/hooks/useSeasons", () => ({ useSeasons: () => ({ data: [] }) }));
const mockWinnersStaySetSession = jest.fn();
const mockWinnersStayAdoptSession = jest.fn();
const mockWinnersStayRefetch = jest.fn();
let mockWinnersStaySession: unknown = null;
let mockWinnersStayVersion: number | null = null;
jest.mock("../../src/hooks/useWinnersStaySession", () => ({
  useWinnersStaySession: () => ({
    session: mockWinnersStaySession,
    version: mockWinnersStayVersion,
    setSession: mockWinnersStaySetSession,
    adoptSession: mockWinnersStayAdoptSession,
    refetch: mockWinnersStayRefetch,
  }),
}));
jest.mock("../../src/hooks/useClubFavorites", () => ({ useClubFavorites: () => ({ favoriteIds: [], toggleFavorite: jest.fn() }) }));
jest.mock("../../src/hooks/useRecentlyUsedClubs", () => ({ useRecentlyUsedClubs: () => ({ recentIds: [], recordUsage: jest.fn() }) }));
jest.mock("../../src/hooks/useNationalTeamsPreference", () => ({
  useNationalTeamsPreference: () => ({ includeNationalTeams: true, setIncludeNationalTeams: jest.fn() }),
}));

let mockMatchQuery = { data: undefined as unknown, isLoading: false, isError: false, error: null, refetch: jest.fn() };
let mockPreviousMatches: unknown[] = [];
jest.mock("../../src/hooks/useMatches", () => ({ useMatch: () => mockMatchQuery, useMatches: () => ({ data: mockPreviousMatches, isLoading: false }) }));

const PREVIOUS_MATCH = {
  id: "prev-match",
  match_type: "singles",
  is_overtime: false,
  is_penalties: false,
  notes: null,
  played_at: "2026-01-01T00:00:00Z",
  sides: [
    { id: "ps1", side_number: 1, score: 3, penalty_score: null, result: "win", club_version_id: "c2", club: { id: "club-2", name: "Club Two" }, players: [] },
    { id: "ps2", side_number: 2, score: 1, penalty_score: null, result: "loss", club_version_id: "c1", club: { id: "club-1", name: "Club One" }, players: [] },
  ],
};

const mockRecordMutateAsync = jest.fn();
const mockEditMutateAsync = jest.fn();
const mockRecordAndAdvanceMutateAsync = jest.fn();
jest.mock("../../src/hooks/useRecordMatch", () => ({ useRecordMatch: () => ({ mutateAsync: mockRecordMutateAsync, isPending: false }) }));
jest.mock("../../src/hooks/useEditMatch", () => ({ useEditMatch: () => ({ mutateAsync: mockEditMutateAsync, isPending: false }) }));
jest.mock("../../src/hooks/useRecordMatchAndAdvanceSession", () => ({
  useRecordMatchAndAdvanceSession: () => ({ mutateAsync: mockRecordAndAdvanceMutateAsync, isPending: false }),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const RecordMatchScreen = require("../../app/(app)/record-match").default;

/**
 * The "All players/clubs, no penalties, valid singles match" prefill --
 * seeded via the screen's OWN existing draw-result-prefill mechanism
 * (matchPrefill.ts), which requires no simulated PlayerPicker/ClubPickerSheet
 * taps to reach a submit-ready form: it's the same route-param path Winners
 * Stay and the Draw screens already use to hand off a fully-specified match.
 */
const VALID_PREFILL = {
  matchType: "singles",
  side1Players: "p1",
  side2Players: "p2",
  side1Club: "c1",
  side2Club: "c2",
};

function findByAccessibilityLabel(renderer: TestRenderer.ReactTestRenderer, label: string) {
  const matches = renderer.root.findAllByType(AnimatedPressable).filter((n) => n.props.accessibilityLabel === label);
  if (matches.length === 0) throw new Error(`No AnimatedPressable found with accessibilityLabel="${label}"`);
  return matches[0]!;
}

async function renderScreen(searchParams: Record<string, string>) {
  mockSearchParams = searchParams;
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(<RecordMatchScreen />);
    // Flushes the prefill effect (players/clubVersions are already loaded
    // synchronously in these mocks, so one microtask is enough for the
    // effect + its setState batch to settle).
    await Promise.resolve();
  });
  return renderer;
}

function tapSave(renderer: TestRenderer.ReactTestRenderer) {
  const button = findByAccessibilityLabel(renderer, "editMatch.saveMatchAction");
  return act(async () => {
    button.props.onPress();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function fireBeforeRemove() {
  if (!capturedBeforeRemove) throw new Error("beforeRemove listener was never registered");
  const event = { preventDefault: jest.fn(), data: { action: { type: "GO_BACK" } } };
  capturedBeforeRemove(event);
  return event;
}

beforeEach(() => {
  jest.clearAllMocks();
  capturedBeforeRemove = null;
  mockMatchQuery = { data: undefined, isLoading: false, isError: false, error: null, refetch: jest.fn() };
  mockPreviousMatches = [];
  mockWinnersStaySession = null;
  mockWinnersStayVersion = null;
});

describe("RecordMatchScreen -- save flow (create mode)", () => {
  it("pressing Save Match does not show the unsaved-changes dialog", async () => {
    mockRecordMutateAsync.mockResolvedValue("new-match-id");
    const renderer = await renderScreen(VALID_PREFILL);

    await tapSave(renderer);

    // The bug: router.replace's own beforeRemove event used to be blocked
    // because the create-mode success path never set the guard bypass.
    // Simulating that event directly here is what actually exercises the
    // fix, regardless of how the mocked router "really" wires navigation.
    const event = fireBeforeRemove();
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(mockConfirmAction).not.toHaveBeenCalled();
  });

  it("successful save navigates away normally", async () => {
    mockRecordMutateAsync.mockResolvedValue("new-match-id");
    const renderer = await renderScreen(VALID_PREFILL);

    await tapSave(renderer);

    expect(mockRecordMutateAsync).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).toHaveBeenCalledWith("/match/new-match-id");
  });

  it("failed save stays on screen (no navigation) and remains dirty", async () => {
    mockRecordMutateAsync.mockRejectedValue(new Error("network down"));
    const renderer = await renderScreen(VALID_PREFILL);

    await tapSave(renderer);

    expect(mockRouter.replace).not.toHaveBeenCalled();
    // Still dirty and still guarded -- a failed save must not have set the bypass.
    const event = fireBeforeRemove();
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(mockConfirmAction).toHaveBeenCalledTimes(1);
  });

  it("repeated save taps do not create duplicate matches", async () => {
    let resolveMutation!: (id: string) => void;
    mockRecordMutateAsync.mockReturnValue(new Promise((resolve) => (resolveMutation = resolve)));
    const renderer = await renderScreen(VALID_PREFILL);

    const button = findByAccessibilityLabel(renderer, "editMatch.saveMatchAction");
    await act(async () => {
      // Two taps issued before either has resolved -- isSubmitting (derived
      // from render state) can't have updated between them, so only the
      // synchronous submitGuardRef can prevent a second mutateAsync call.
      button.props.onPress();
      button.props.onPress();
      resolveMutation("only-match-id");
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockRecordMutateAsync).toHaveBeenCalledTimes(1);
  });
});

describe("RecordMatchScreen -- draw results save correctly (main Record Match screen)", () => {
  it("a 0-0 draw (create mode's own default score) saves successfully with both sides marked draw", async () => {
    mockRecordMutateAsync.mockResolvedValue("new-match-id");
    const renderer = await renderScreen(VALID_PREFILL);
    // VALID_PREFILL never touches the score -- create mode's own default
    // (side1Score/side2Score both start at 0) is already a 0-0 draw.

    await tapSave(renderer);

    expect(mockRecordMutateAsync).toHaveBeenCalledTimes(1);
    const payload = mockRecordMutateAsync.mock.calls[0]![0] as { sides: { score: number; result: string }[] };
    expect(payload.sides[0]!.score).toBe(0);
    expect(payload.sides[1]!.score).toBe(0);
    expect(payload.sides[0]!.result).toBe("draw");
    expect(payload.sides[1]!.result).toBe("draw");
    expect(mockRouter.replace).toHaveBeenCalledWith("/match/new-match-id");
  });

  it("a non-zero draw (2-2) saves successfully with both sides marked draw, not win/loss", async () => {
    mockRecordMutateAsync.mockResolvedValue("new-match-id");
    const renderer = await renderScreen(VALID_PREFILL);
    const steppers = renderer.root.findAllByType(ScoreStepper);
    act(() => {
      (steppers[0]!.props.onChange as (v: number) => void)(2);
      (steppers[1]!.props.onChange as (v: number) => void)(2);
    });

    await tapSave(renderer);

    expect(mockRecordMutateAsync).toHaveBeenCalledTimes(1);
    const payload = mockRecordMutateAsync.mock.calls[0]![0] as { sides: { score: number; result: string }[] };
    expect(payload.sides[0]!.score).toBe(2);
    expect(payload.sides[1]!.score).toBe(2);
    expect(payload.sides[0]!.result).toBe("draw");
    expect(payload.sides[1]!.result).toBe("draw");
  });

  it("repeated save taps on a draw do not create duplicate matches", async () => {
    let resolveMutation!: (id: string) => void;
    mockRecordMutateAsync.mockReturnValue(new Promise((resolve) => (resolveMutation = resolve)));
    const renderer = await renderScreen(VALID_PREFILL); // 0-0 draw by default

    const button = findByAccessibilityLabel(renderer, "editMatch.saveMatchAction");
    await act(async () => {
      button.props.onPress();
      button.props.onPress();
      resolveMutation("only-match-id");
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockRecordMutateAsync).toHaveBeenCalledTimes(1);
  });
});

const WINNERS_STAY_SESSION = {
  id: "session-1",
  groupId: "group-1",
  format: "duo" as const,
  activePlayerIds: ["p1", "p2"],
  currentPairA: { players: [{ id: "p1", display_name: "Alice", avatar_url: null, custom_color: "#111" }], consecutiveMatchesPlayed: 1 },
  currentPairB: { players: [{ id: "p2", display_name: "Bob", avatar_url: null, custom_color: "#222" }], consecutiveMatchesPlayed: 1 },
  pendingRotation: null,
  waitingQueue: [],
  roundNumber: 3,
  startedAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  lastRecordedMatchId: null,
  status: "active" as const,
  longestWinningRun: 1,
  previousSnapshot: null,
};

const WINNERS_STAY_PREFILL = { ...VALID_PREFILL, source: "winnersStay" };

describe("RecordMatchScreen -- session-linked create-mode save (atomic RPC, source=winnersStay)", () => {
  it("uses the atomic recordMatchAndAdvanceSession RPC instead of the plain recordMatch mutation when a session is active", async () => {
    mockWinnersStaySession = WINNERS_STAY_SESSION;
    mockWinnersStayVersion = 5;
    mockRecordAndAdvanceMutateAsync.mockResolvedValue({ ok: true, matchId: "new-match-id", version: 6 });
    const renderer = await renderScreen(WINNERS_STAY_PREFILL);

    await tapSave(renderer);

    expect(mockRecordAndAdvanceMutateAsync).toHaveBeenCalledTimes(1);
    expect(mockRecordMutateAsync).not.toHaveBeenCalled();
    const args = mockRecordAndAdvanceMutateAsync.mock.calls[0]![0] as { expectedVersion: number; nextSession: unknown };
    expect(args.expectedVersion).toBe(5);
    expect(args.nextSession).toBeTruthy();
  });

  it("on success, adopts the server-confirmed session/version locally and navigates to the new match", async () => {
    mockWinnersStaySession = WINNERS_STAY_SESSION;
    mockWinnersStayVersion = 5;
    mockRecordAndAdvanceMutateAsync.mockResolvedValue({ ok: true, matchId: "new-match-id", version: 6 });
    const renderer = await renderScreen(WINNERS_STAY_PREFILL);

    await tapSave(renderer);

    expect(mockWinnersStayAdoptSession).toHaveBeenCalledTimes(1);
    const [adoptedSession, adoptedVersion] = mockWinnersStayAdoptSession.mock.calls[0]!;
    expect(adoptedVersion).toBe(6);
    expect((adoptedSession as { lastRecordedMatchId: string }).lastRecordedMatchId).toBe("new-match-id");
    expect(mockRouter.replace).toHaveBeenCalledWith("/match/new-match-id");
  });

  it("does not auto-accept a pending rotation the way QuickMatchCard does -- leaves review to the Winners Stay screen", async () => {
    mockWinnersStaySession = WINNERS_STAY_SESSION;
    mockWinnersStayVersion = 5;
    mockRecordAndAdvanceMutateAsync.mockResolvedValue({ ok: true, matchId: "new-match-id", version: 6 });
    const renderer = await renderScreen(WINNERS_STAY_PREFILL);

    await tapSave(renderer);

    const args = mockRecordAndAdvanceMutateAsync.mock.calls[0]![0] as { nextSession: { pendingRotation: unknown } };
    const [adoptedSession] = mockWinnersStayAdoptSession.mock.calls[0]!;
    // Whatever the rotation engine proposed is passed straight through --
    // never separately "accepted" here (no acceptPendingRotation call).
    expect((adoptedSession as { pendingRotation: unknown }).pendingRotation).toEqual(args.nextSession.pendingRotation);
  });

  it("a stale rejection shows the friendly message, refetches, and does not navigate away", async () => {
    mockWinnersStaySession = WINNERS_STAY_SESSION;
    mockWinnersStayVersion = 5;
    mockRecordAndAdvanceMutateAsync.mockResolvedValue({ ok: "stale" });
    const renderer = await renderScreen(WINNERS_STAY_PREFILL);

    await tapSave(renderer);

    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(mockWinnersStayAdoptSession).not.toHaveBeenCalled();
    expect(mockWinnersStayRefetch).toHaveBeenCalledTimes(1);
    const errorTexts = renderer.root.findAllByType(require("react-native").Text).map((n) => n.props.children);
    expect(errorTexts.flat().join(" ")).toContain("home.quickMatchStaleSubmission");
  });

  it("a no_session rejection (session ended concurrently) shows the friendly message, refetches, and does not navigate away", async () => {
    mockWinnersStaySession = WINNERS_STAY_SESSION;
    mockWinnersStayVersion = 5;
    mockRecordAndAdvanceMutateAsync.mockResolvedValue({ ok: "no_session" });
    const renderer = await renderScreen(WINNERS_STAY_PREFILL);

    await tapSave(renderer);

    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(mockWinnersStayAdoptSession).not.toHaveBeenCalled();
    expect(mockWinnersStayRefetch).toHaveBeenCalledTimes(1);
    const errorTexts = renderer.root.findAllByType(require("react-native").Text).map((n) => n.props.children);
    expect(errorTexts.flat().join(" ")).toContain("home.quickMatchSessionEnded");
  });

  it("repeated save taps on a session-linked match do not create duplicate matches", async () => {
    mockWinnersStaySession = WINNERS_STAY_SESSION;
    mockWinnersStayVersion = 5;
    let resolveMutation!: (outcome: { ok: true; matchId: string; version: number }) => void;
    mockRecordAndAdvanceMutateAsync.mockReturnValue(new Promise((resolve) => (resolveMutation = resolve)));
    const renderer = await renderScreen(WINNERS_STAY_PREFILL);

    const button = findByAccessibilityLabel(renderer, "editMatch.saveMatchAction");
    await act(async () => {
      button.props.onPress();
      button.props.onPress();
      resolveMutation({ ok: true, matchId: "only-match-id", version: 6 });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockRecordAndAdvanceMutateAsync).toHaveBeenCalledTimes(1);
  });

  it("falls back to the plain recordMatch mutation when not linked to an active session (no session)", async () => {
    mockWinnersStaySession = null;
    mockWinnersStayVersion = null;
    mockRecordMutateAsync.mockResolvedValue("new-match-id");
    const renderer = await renderScreen(WINNERS_STAY_PREFILL);

    await tapSave(renderer);

    expect(mockRecordMutateAsync).toHaveBeenCalledTimes(1);
    expect(mockRecordAndAdvanceMutateAsync).not.toHaveBeenCalled();
  });

  it("falls back to the plain recordMatch mutation for a normal (non-winnersStay) create-mode save even if a session happens to be active", async () => {
    mockWinnersStaySession = WINNERS_STAY_SESSION;
    mockWinnersStayVersion = 5;
    mockRecordMutateAsync.mockResolvedValue("new-match-id");
    const renderer = await renderScreen(VALID_PREFILL);

    await tapSave(renderer);

    expect(mockRecordMutateAsync).toHaveBeenCalledTimes(1);
    expect(mockRecordAndAdvanceMutateAsync).not.toHaveBeenCalled();
  });
});

describe("RecordMatchScreen -- beforeRemove guard (manual navigation)", () => {
  it("manual back with unsaved changes still shows the dialog", async () => {
    const renderer = await renderScreen(VALID_PREFILL);
    void renderer;

    const event = fireBeforeRemove();
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(mockConfirmAction).toHaveBeenCalledTimes(1);
  });

  it("manual back with no changes does not show the dialog", async () => {
    // No prefill at all -- currentDraft matches BLANK_CREATE_DRAFT exactly, so isDirty is false.
    const renderer = await renderScreen({});
    void renderer;

    const event = fireBeforeRemove();
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(mockConfirmAction).not.toHaveBeenCalled();
  });
});

describe("RecordMatchScreen -- Same Clubs / Swap Clubs quick actions", () => {
  it("Same Clubs applies the previous match's clubs to the matching sides", async () => {
    mockPreviousMatches = [PREVIOUS_MATCH];
    const renderer = await renderScreen({});

    const button = findByAccessibilityLabel(renderer, "rotation.sameClubsAction");
    act(() => {
      button.props.onPress();
    });

    // PREVIOUS_MATCH: side1 -> Club Two (c2), side2 -> Club One (c1) -- "Same Clubs" keeps that mapping.
    const names = renderer.root.findAllByType(ClubBadge).map((b) => b.props.name);
    expect(names).toEqual(expect.arrayContaining(["Club Two", "Club One"]));
  });

  it("Swap Clubs applies the previous match's clubs with sides reversed", async () => {
    mockPreviousMatches = [PREVIOUS_MATCH];
    const renderer = await renderScreen({});

    const sameButton = findByAccessibilityLabel(renderer, "rotation.sameClubsAction");
    act(() => {
      sameButton.props.onPress();
    });
    const afterSame = renderer.root.findAllByType(ClubBadge).map((b) => b.props.name);

    const swapButton = findByAccessibilityLabel(renderer, "rotation.swapClubsAction");
    act(() => {
      swapButton.props.onPress();
    });
    const afterSwap = renderer.root.findAllByType(ClubBadge).map((b) => b.props.name);

    // Same two clubs either way, but swap must reverse which side each lands on.
    expect(afterSwap.slice().sort()).toEqual(afterSame.slice().sort());
    expect(afterSwap).not.toEqual(afterSame);
  });

  it("does not offer Same Clubs / Swap Clubs when there is no previous match", async () => {
    mockPreviousMatches = [];
    const renderer = await renderScreen({});

    expect(() => findByAccessibilityLabel(renderer, "rotation.sameClubsAction")).toThrow();
    expect(() => findByAccessibilityLabel(renderer, "rotation.swapClubsAction")).toThrow();
  });

  it("does not offer Same Clubs / Swap Clubs when the previous match's club is no longer in the current club list", async () => {
    mockPreviousMatches = [
      {
        ...PREVIOUS_MATCH,
        sides: [
          { ...PREVIOUS_MATCH.sides[0], club_version_id: "no-longer-available", club: { id: "gone", name: "Gone Club" } },
          PREVIOUS_MATCH.sides[1],
        ],
      },
    ];
    const renderer = await renderScreen({});

    expect(() => findByAccessibilityLabel(renderer, "rotation.sameClubsAction")).toThrow();
  });
});
