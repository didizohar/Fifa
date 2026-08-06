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
jest.mock("../../src/hooks/usePlayers", () => ({ usePlayers: () => ({ data: mockPlayersData, isLoading: false }) }));

let mockParticipantIds: string[] = [];
jest.mock("../../src/hooks/useLastWinnersStayParticipants", () => ({
  useLastWinnersStayParticipants: () => ({ participantIds: mockParticipantIds, isHydrated: true, setParticipantIds: jest.fn() }),
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

beforeEach(() => {
  jest.clearAllMocks();
  mockPlayersData = [{ id: "p1" }, { id: "p2" }, { id: "p3" }, { id: "p4" }, { id: "p5" }];
  mockParticipantIds = [];
});

describe("StartEveningScreen -- no previous session", () => {
  it("shows only New Session, not Continue Previous Session", () => {
    const renderer = renderScreen();
    expect(() => findByAccessibilityLabelStartingWith(renderer, "rotation.startEveningNewSession")).not.toThrow();
    expect(() => findByAccessibilityLabelStartingWith(renderer, "rotation.startEveningContinueSession")).toThrow();
  });

  it("New Session replaces with a plain /winners-stay push, no params", () => {
    const renderer = renderScreen();
    const card = findByAccessibilityLabelStartingWith(renderer, "rotation.startEveningNewSession");
    act(() => {
      (card.props.onPress as () => void)();
    });
    expect(mockRouter.replace).toHaveBeenCalledWith("/winners-stay");
  });
});

describe("StartEveningScreen -- previous session exists", () => {
  beforeEach(() => {
    mockParticipantIds = ["p1", "p2", "p3", "p4"];
  });

  it("shows both cards", () => {
    const renderer = renderScreen();
    expect(() => findByAccessibilityLabelStartingWith(renderer, "rotation.startEveningNewSession")).not.toThrow();
    expect(() => findByAccessibilityLabelStartingWith(renderer, "rotation.startEveningContinueSession")).not.toThrow();
  });

  it("Continue Previous Session passes the previous participants as preselectPlayerIds, sorted stably", () => {
    const renderer = renderScreen();
    const card = findByAccessibilityLabelStartingWith(renderer, "rotation.startEveningContinueSession");
    act(() => {
      (card.props.onPress as () => void)();
    });
    expect(mockRouter.replace).toHaveBeenCalledWith({
      pathname: "/winners-stay",
      params: { preselectPlayerIds: "p1,p2,p3,p4" },
    });
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it("drops archived/deleted players, notifies, and falls back to plain selection when too few valid players remain", () => {
    mockParticipantIds = ["p1", "p2", "p3", "p_deleted"];
    const renderer = renderScreen();
    const card = findByAccessibilityLabelStartingWith(renderer, "rotation.startEveningContinueSession");
    act(() => {
      (card.props.onPress as () => void)();
    });
    expect(mockNotify).toHaveBeenCalledWith("rotation.startEveningPlayersRemovedNotice");
    // Only 3 valid ids remain (below MIN_PARTICIPANTS = 4) -- falls back to plain selection.
    expect(mockRouter.replace).toHaveBeenCalledWith("/winners-stay");
  });

  it("continues with the filtered list (no fallback) when enough valid players remain after filtering", () => {
    mockParticipantIds = ["p1", "p2", "p3", "p4", "p_deleted"];
    const renderer = renderScreen();
    const card = findByAccessibilityLabelStartingWith(renderer, "rotation.startEveningContinueSession");
    act(() => {
      (card.props.onPress as () => void)();
    });
    expect(mockNotify).toHaveBeenCalledWith("rotation.startEveningPlayersRemovedNotice");
    expect(mockRouter.replace).toHaveBeenCalledWith({
      pathname: "/winners-stay",
      params: { preselectPlayerIds: "p1,p2,p3,p4" },
    });
  });
});
