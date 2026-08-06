import TestRenderer, { act } from "react-test-renderer";
import { AnimatedPressable } from "../../src/components/AnimatedPressable";

const mockRouter = { replace: jest.fn(), push: jest.fn(), back: jest.fn() };
jest.mock("expo-router", () => ({
  useRouter: () => mockRouter,
}));

jest.mock("../../src/lib/i18n", () => ({
  useTranslation: () => ({ t: (key: string) => key, locale: "en", isRTL: false, setLocale: jest.fn() }),
}));

const mockNotify = jest.fn();
jest.mock("../../src/lib/confirm", () => ({
  notify: (...args: unknown[]) => mockNotify(...args),
}));

jest.mock("../../src/hooks/useGroup", () => ({ useGroup: () => ({ currentGroupId: "group-1" }) }));

let mockPlayersData: { id: string }[] = [];
let mockPlayersLoading = false;
jest.mock("../../src/hooks/usePlayers", () => ({ usePlayers: () => ({ data: mockPlayersData, isLoading: mockPlayersLoading }) }));

let mockParticipantIds: string[] = [];
jest.mock("../../src/hooks/useLastWinnersStayParticipants", () => ({
  useLastWinnersStayParticipants: () => ({ participantIds: mockParticipantIds, isHydrated: true, setParticipantIds: jest.fn() }),
}));

interface MockSessionShape {
  id: string;
  groupId: string;
  status: "active" | "completed";
  activePlayerIds: string[];
  currentPairA: { players: [{ id: string; display_name: string; avatar_url: null; custom_color: string }, { id: string; display_name: string; avatar_url: null; custom_color: string }]; consecutiveMatchesPlayed: number };
  currentPairB: null;
  pendingRotation: null;
  waitingQueue: never[];
  roundNumber: number;
  startedAt: string;
  updatedAt: string;
  lastRecordedMatchId: null;
  longestWinningRun: number;
  previousSnapshot: null;
}

function makeSession(overrides: Partial<MockSessionShape> & { id: string; groupId: string; status: "active" | "completed" }): MockSessionShape {
  const player = (id: string) => ({ id, display_name: id, avatar_url: null, custom_color: "#111" });
  return {
    activePlayerIds: ["p1", "p2", "p3", "p4"],
    currentPairA: { players: [player("p1"), player("p2")], consecutiveMatchesPlayed: 1 },
    currentPairB: null,
    pendingRotation: null,
    waitingQueue: [],
    roundNumber: 1,
    startedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:10:00.000Z",
    lastRecordedMatchId: null,
    longestWinningRun: 1,
    previousSnapshot: null,
    ...overrides,
  };
}

type MockSession = MockSessionShape | null;
let mockSession: MockSession = null;
let mockSetSessionImpl: (next: MockSession) => Promise<void> = async (next) => {
  mockSession = next;
};
const mockSetSession = jest.fn((next: MockSession) => mockSetSessionImpl(next));
jest.mock("../../src/hooks/useWinnersStaySession", () => ({
  useWinnersStaySession: () => ({ session: mockSession, isHydrated: true, setSession: mockSetSession }),
}));

const mockSetHistory = jest.fn();
jest.mock("../../src/hooks/useWinnersStaySessionHistory", () => ({
  useWinnersStaySessionHistory: () => ({ history: [], setHistory: mockSetHistory }),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const StartEveningScreen = require("../../app/(app)/start-evening").default;

function renderScreen() {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<StartEveningScreen />);
  });
  return renderer;
}

function findByAccessibilityLabelStartingWith(renderer: TestRenderer.ReactTestRenderer, prefix: string) {
  const matches = renderer.root
    .findAllByType(AnimatedPressable)
    .filter((n) => typeof n.props.accessibilityLabel === "string" && n.props.accessibilityLabel.startsWith(prefix));
  if (matches.length === 0) throw new Error(`No AnimatedPressable found with accessibilityLabel starting with "${prefix}"`);
  return matches[0]!;
}

function tapNewSession(renderer: TestRenderer.ReactTestRenderer) {
  const card = findByAccessibilityLabelStartingWith(renderer, "rotation.startEveningNewSession");
  return act(async () => {
    card.props.onPress();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function tapContinue(renderer: TestRenderer.ReactTestRenderer) {
  const card = findByAccessibilityLabelStartingWith(renderer, "rotation.startEveningContinueSession");
  return act(async () => {
    card.props.onPress();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPlayersData = [{ id: "p1" }, { id: "p2" }, { id: "p3" }, { id: "p4" }, { id: "p5" }];
  mockPlayersLoading = false;
  mockParticipantIds = [];
  mockSession = null;
  mockSetSessionImpl = async (next) => {
    mockSession = next;
  };
});

describe("New Session -- always genuinely new, never a silent resume", () => {
  it("with no existing session: clears nothing, navigates to a plain /winners-stay", async () => {
    const renderer = renderScreen();
    await tapNewSession(renderer);
    expect(mockSetSession).not.toHaveBeenCalled();
    expect(mockRouter.replace).toHaveBeenCalledWith("/winners-stay");
  });

  it("with an existing ACTIVE session: archives + clears it before navigating (never leaves it in place for Winners Stay to pick back up)", async () => {
    mockSession = makeSession({ id: "old-active-id", groupId: "group-1", status: "active" })
    const renderer = renderScreen();
    await tapNewSession(renderer);

    expect(mockSetHistory).toHaveBeenCalled();
    expect(mockSetSession).toHaveBeenCalledWith(null);
    expect(mockSession).toBeNull();
    expect(mockRouter.replace).toHaveBeenCalledWith("/winners-stay");
  });

  it("with an existing COMPLETED session: also clears it (Winners Stay's own setup-screen check treats completed the same as active for this purpose)", async () => {
    mockSession = makeSession({ id: "old-completed-id", groupId: "group-1", status: "completed" })
    const renderer = renderScreen();
    await tapNewSession(renderer);
    expect(mockSetSession).toHaveBeenCalledWith(null);
  });

  it("awaits the clear before navigating -- navigation never fires while the AsyncStorage removal is still in flight", async () => {
    mockSession = makeSession({ id: "old-active-id", groupId: "group-1", status: "active" })
    let resolveClear!: () => void;
    mockSetSessionImpl = () =>
      new Promise((resolve) => {
        resolveClear = () => {
          mockSession = null;
          resolve();
        };
      });

    const renderer = renderScreen();
    const card = findByAccessibilityLabelStartingWith(renderer, "rotation.startEveningNewSession");

    let pressPromise!: Promise<void>;
    act(() => {
      pressPromise = card.props.onPress() as unknown as Promise<void>;
    });

    // The clear is still pending -- navigation must NOT have happened yet.
    await Promise.resolve();
    expect(mockRouter.replace).not.toHaveBeenCalled();

    await act(async () => {
      resolveClear();
      await pressPromise;
    });

    expect(mockRouter.replace).toHaveBeenCalledWith("/winners-stay");
  });

  it("double tap only clears/navigates once", async () => {
    mockSession = makeSession({ id: "old-active-id", groupId: "group-1", status: "active" })
    const renderer = renderScreen();
    const card = findByAccessibilityLabelStartingWith(renderer, "rotation.startEveningNewSession");
    await act(async () => {
      card.props.onPress();
      card.props.onPress();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockSetSession).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).toHaveBeenCalledTimes(1);
  });

  it("a failed clear shows a clear error and resets the processing guard (button usable again) instead of getting stuck", async () => {
    mockSession = makeSession({ id: "old-active-id", groupId: "group-1", status: "active" });
    mockSetSessionImpl = () => Promise.reject(new Error("storage exploded"));
    const renderer = renderScreen();
    const card = findByAccessibilityLabelStartingWith(renderer, "rotation.startEveningNewSession");

    await act(async () => {
      card.props.onPress();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockNotify).toHaveBeenCalledWith("rotation.startEveningError");
    expect(mockRouter.replace).not.toHaveBeenCalled();

    mockSetSessionImpl = async (next) => {
      mockSession = next;
    };
    await act(async () => {
      card.props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockRouter.replace).toHaveBeenCalledWith("/winners-stay");
  });
});

describe("Continue Previous Session -- one explicit rule, never a coin flip", () => {
  it("no previous session at all: the card is not shown", () => {
    const renderer = renderScreen();
    expect(() => findByAccessibilityLabelStartingWith(renderer, "rotation.startEveningContinueSession")).toThrow();
  });

  it("most recent session is ACTIVE: resumes it directly -- no clear, no new session, plain navigation", async () => {
    mockParticipantIds = ["p1", "p2", "p3", "p4"];
    mockSession = makeSession({ id: "active-id", groupId: "group-1", status: "active" })
    const renderer = renderScreen();
    await tapContinue(renderer);

    expect(mockSetSession).not.toHaveBeenCalled();
    expect(mockSetHistory).not.toHaveBeenCalled();
    expect(mockRouter.replace).toHaveBeenCalledWith("/winners-stay");
  });

  it("most recent session is COMPLETED: creates a genuinely new session with the same participants, never pretends to resume", async () => {
    mockParticipantIds = ["p1", "p2", "p3", "p4"];
    mockSession = makeSession({ id: "completed-id", groupId: "group-1", status: "completed" })
    const renderer = renderScreen();
    await tapContinue(renderer);

    expect(mockSetSession).toHaveBeenCalledWith(null);
    expect(mockRouter.replace).toHaveBeenCalledWith({
      pathname: "/winners-stay",
      params: { preselectPlayerIds: "p1,p2,p3,p4" },
    });
  });

  it("no existing session at all (already properly ended): creates a new session with the previous participants", async () => {
    mockParticipantIds = ["p1", "p2", "p3", "p4"];
    mockSession = null;
    const renderer = renderScreen();
    await tapContinue(renderer);

    expect(mockSetSession).not.toHaveBeenCalled(); // nothing to clear
    expect(mockRouter.replace).toHaveBeenCalledWith({
      pathname: "/winners-stay",
      params: { preselectPlayerIds: "p1,p2,p3,p4" },
    });
  });

  it("an active session belonging to a DIFFERENT group is ignored entirely -- not resumed, not cleared", async () => {
    mockParticipantIds = ["p1", "p2", "p3", "p4"];
    mockSession = makeSession({ id: "other-group-session", groupId: "some-other-group", status: "active" })
    const renderer = renderScreen();
    await tapContinue(renderer);

    expect(mockSetSession).not.toHaveBeenCalled();
    expect(mockRouter.replace).toHaveBeenCalledWith({
      pathname: "/winners-stay",
      params: { preselectPlayerIds: "p1,p2,p3,p4" },
    });
  });

  it("drops archived/deleted players, notifies, and falls back to plain selection when too few valid players remain", async () => {
    // Only "p1" survives filtering -- below the 2-player (duo) floor.
    mockParticipantIds = ["p1", "p_deleted1", "p_deleted2"];
    mockSession = makeSession({ id: "completed-id", groupId: "group-1", status: "completed" })
    const renderer = renderScreen();
    await tapContinue(renderer);

    expect(mockNotify).toHaveBeenCalledWith("rotation.startEveningPlayersRemovedNotice");
    expect(mockRouter.replace).toHaveBeenCalledWith("/winners-stay");
  });

  it("continues with exactly the 2-player (duo) floor when only two valid previous participants remain", async () => {
    mockParticipantIds = ["p1", "p2", "p_deleted"];
    mockSession = makeSession({ id: "completed-id", groupId: "group-1", status: "completed" })
    const renderer = renderScreen();
    await tapContinue(renderer);

    expect(mockNotify).toHaveBeenCalledWith("rotation.startEveningPlayersRemovedNotice");
    expect(mockRouter.replace).toHaveBeenCalledWith({
      pathname: "/winners-stay",
      params: { preselectPlayerIds: "p1,p2" },
    });
  });

  it("continues with the filtered list when enough valid players remain after dropping archived ones", async () => {
    mockParticipantIds = ["p1", "p2", "p3", "p4", "p_deleted"];
    mockSession = null;
    const renderer = renderScreen();
    await tapContinue(renderer);

    expect(mockNotify).toHaveBeenCalledWith("rotation.startEveningPlayersRemovedNotice");
    expect(mockRouter.replace).toHaveBeenCalledWith({
      pathname: "/winners-stay",
      params: { preselectPlayerIds: "p1,p2,p3,p4" },
    });
  });

  it("double tap only resolves once (active-session resume path)", async () => {
    mockParticipantIds = ["p1", "p2", "p3", "p4"];
    mockSession = makeSession({ id: "active-id", groupId: "group-1", status: "active" })
    const renderer = renderScreen();
    const card = findByAccessibilityLabelStartingWith(renderer, "rotation.startEveningContinueSession");
    await act(async () => {
      card.props.onPress();
      card.props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockRouter.replace).toHaveBeenCalledTimes(1);
  });

  it("double tap only resolves once (create-new path)", async () => {
    mockParticipantIds = ["p1", "p2", "p3", "p4"];
    mockSession = makeSession({ id: "completed-id", groupId: "group-1", status: "completed" })
    const renderer = renderScreen();
    const card = findByAccessibilityLabelStartingWith(renderer, "rotation.startEveningContinueSession");
    await act(async () => {
      card.props.onPress();
      card.props.onPress();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockSetSession).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).toHaveBeenCalledTimes(1);
  });

  it("most recent session is ACTIVE but has recorded zero matches (an abandoned draft): does NOT resume it -- discards it and creates a fresh session from the last real participant list instead", async () => {
    mockParticipantIds = ["p1", "p2", "p3", "p4"]; // captured by the LAST session that actually recorded a match
    mockSession = makeSession({ id: "draft-id", groupId: "group-1", status: "active", roundNumber: 0 });
    const renderer = renderScreen();
    await tapContinue(renderer);

    // The draft is discarded (cleared), not resumed -- and per the next
    // test, discarding a zero-match draft must not archive it either.
    expect(mockSetSession).toHaveBeenCalledWith(null);
    expect(mockRouter.replace).toHaveBeenCalledWith({
      pathname: "/winners-stay",
      params: { preselectPlayerIds: "p1,p2,p3,p4" },
    });
  });

  it("New Session: discarding an existing ACTIVE zero-match draft does NOT archive it into session history", async () => {
    mockSession = makeSession({ id: "draft-id", groupId: "group-1", status: "active", roundNumber: 0 });
    const renderer = renderScreen();
    await tapNewSession(renderer);

    expect(mockSetHistory).not.toHaveBeenCalled();
    expect(mockSetSession).toHaveBeenCalledWith(null);
    expect(mockRouter.replace).toHaveBeenCalledWith("/winners-stay");
  });

  it("Continue: discarding an active zero-match draft (falling through, not resuming) does NOT archive it into session history", async () => {
    mockParticipantIds = ["p1", "p2", "p3", "p4"];
    mockSession = makeSession({ id: "draft-id", groupId: "group-1", status: "active", roundNumber: 0 });
    const renderer = renderScreen();
    await tapContinue(renderer);

    expect(mockSetHistory).not.toHaveBeenCalled();
  });

  it("awaits the clear before navigating when the most recent session is completed (same race protection as New Session)", async () => {
    mockParticipantIds = ["p1", "p2", "p3", "p4"];
    mockSession = makeSession({ id: "completed-id", groupId: "group-1", status: "completed" })
    let resolveClear!: () => void;
    mockSetSessionImpl = () =>
      new Promise((resolve) => {
        resolveClear = () => {
          mockSession = null;
          resolve();
        };
      });

    const renderer = renderScreen();
    const card = findByAccessibilityLabelStartingWith(renderer, "rotation.startEveningContinueSession");

    let pressPromise!: Promise<void>;
    act(() => {
      pressPromise = card.props.onPress() as unknown as Promise<void>;
    });

    await Promise.resolve();
    expect(mockRouter.replace).not.toHaveBeenCalled();

    await act(async () => {
      resolveClear();
      await pressPromise;
    });

    expect(mockRouter.replace).toHaveBeenCalledWith({
      pathname: "/winners-stay",
      params: { preselectPlayerIds: "p1,p2,p3,p4" },
    });
  });
});

describe("Loading state", () => {
  it("both buttons stay disabled while player data is still loading", () => {
    mockParticipantIds = ["p1", "p2", "p3", "p4"];
    mockPlayersLoading = true;
    const renderer = renderScreen();
    const newCard = findByAccessibilityLabelStartingWith(renderer, "rotation.startEveningNewSession");
    const continueCard = findByAccessibilityLabelStartingWith(renderer, "rotation.startEveningContinueSession");
    expect(newCard.props.disabled).toBe(true);
    expect(continueCard.props.disabled).toBe(true);
  });
});
