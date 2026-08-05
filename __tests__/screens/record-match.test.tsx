import TestRenderer, { act } from "react-test-renderer";
import { AnimatedPressable } from "../../src/components/AnimatedPressable";

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
const mockRouter = { replace: jest.fn(), push: jest.fn(), back: jest.fn() };
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
jest.mock("../../src/hooks/useWinnersStaySession", () => ({ useWinnersStaySession: () => ({ session: null, setSession: jest.fn() }) }));
jest.mock("../../src/hooks/useClubFavorites", () => ({ useClubFavorites: () => ({ favoriteIds: [], toggleFavorite: jest.fn() }) }));
jest.mock("../../src/hooks/useRecentlyUsedClubs", () => ({ useRecentlyUsedClubs: () => ({ recentIds: [], recordUsage: jest.fn() }) }));
jest.mock("../../src/hooks/useNationalTeamsPreference", () => ({
  useNationalTeamsPreference: () => ({ includeNationalTeams: true, setIncludeNationalTeams: jest.fn() }),
}));

let mockMatchQuery = { data: undefined as unknown, isLoading: false, isError: false, error: null, refetch: jest.fn() };
jest.mock("../../src/hooks/useMatches", () => ({ useMatch: () => mockMatchQuery }));

const mockRecordMutateAsync = jest.fn();
const mockEditMutateAsync = jest.fn();
jest.mock("../../src/hooks/useRecordMatch", () => ({ useRecordMatch: () => ({ mutateAsync: mockRecordMutateAsync, isPending: false }) }));
jest.mock("../../src/hooks/useEditMatch", () => ({ useEditMatch: () => ({ mutateAsync: mockEditMutateAsync, isPending: false }) }));

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
