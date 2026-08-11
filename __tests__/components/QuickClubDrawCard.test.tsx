import TestRenderer, { act } from "react-test-renderer";
import { Text } from "react-native";
import { AnimatedPressable } from "../../src/components/AnimatedPressable";
import { ClubBadge } from "../../src/components/ClubBadge";
import { QuickClubDrawCard } from "../../src/components/QuickClubDrawCard";

jest.mock("../../src/lib/i18n", () => ({
  useTranslation: () => ({ t: (key: string, params?: Record<string, string>) => (params ? `${key}:${JSON.stringify(params)}` : key), locale: "en", isRTL: false, setLocale: jest.fn() }),
}));

let mockClubVersionsData: unknown[] = [];
jest.mock("../../src/hooks/useClubVersions", () => ({
  useClubVersions: () => ({ data: mockClubVersionsData, isLoading: false }),
}));

let mockPool: "large" | "small" = "large";
const mockSetPool = jest.fn((next: "large" | "small") => {
  mockPool = next;
});
jest.mock("../../src/hooks/useQuickDrawPoolPreference", () => ({
  useQuickDrawPoolPreference: () => ({ pool: mockPool, isHydrated: true, setPool: mockSetPool }),
}));

function clubVersion(id: string, starRating: number, league: string | null = null) {
  return { id: `cv-${id}`, club_id: id, game_version_id: "gv-1", star_rating: starRating, club: { id, name: id, deleted_at: null, group_id: null, league } };
}

function nationalTeamClubVersion(id: string, starRating: number) {
  return clubVersion(id, starRating, "National Teams");
}

/** Large pool = 4.5/5; small pool = 3.5/4. Includes an unrelated 3-star club to prove it's never drawn by either pool. */
const MIXED_POOL = [
  clubVersion("a", 4.5),
  clubVersion("b", 4.5),
  clubVersion("c", 5),
  clubVersion("d", 3.5),
  clubVersion("e", 4),
  clubVersion("f", 3),
];

function renderCard() {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<QuickClubDrawCard groupId="group-1" gameVersionId="gv-1" />);
  });
  return renderer;
}

/** JSX order: Large chip, Small chip, then the Draw button -- all three render as AnimatedPressable. */
function pressers(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root.findAllByType(AnimatedPressable);
}

function pressDraw(renderer: TestRenderer.ReactTestRenderer) {
  const buttons = pressers(renderer);
  act(() => {
    (buttons[buttons.length - 1]!.props.onPress as () => void)();
  });
}

describe("QuickClubDrawCard -- pool selection replaces Random/By Stars", () => {
  beforeEach(() => {
    mockClubVersionsData = MIXED_POOL;
    mockPool = "large";
    mockSetPool.mockClear();
  });

  it("draws two clubs from the Large pool (4.5/5 stars) by default", () => {
    const renderer = renderCard();
    pressDraw(renderer);
    const badges = renderer.root.findAllByType(ClubBadge);
    expect(badges).toHaveLength(2);
    for (const badge of badges) {
      expect([4.5, 5]).toContain(badge.props.starRating);
    }
  });

  it("draws two clubs from the Small pool (3.5/4 stars) when that's the persisted preference", () => {
    mockPool = "small";
    const renderer = renderCard();
    pressDraw(renderer);
    const badges = renderer.root.findAllByType(ClubBadge);
    expect(badges).toHaveLength(2);
    for (const badge of badges) {
      expect([3.5, 4]).toContain(badge.props.starRating);
    }
  });

  it("tapping the Small pool chip persists the choice via useQuickDrawPoolPreference", () => {
    const renderer = renderCard();
    const [largeChip, smallChip] = pressers(renderer);
    void largeChip;
    act(() => {
      (smallChip!.props.onPress as () => void)();
    });
    expect(mockSetPool).toHaveBeenCalledWith("small");
  });

  it("never draws the unrelated 3/4.5-adjacent 3-star or exactly-4-star clubs when Large is selected", () => {
    const renderer = renderCard();
    for (let i = 0; i < 15; i++) {
      pressDraw(renderer);
      const badges = renderer.root.findAllByType(ClubBadge);
      for (const badge of badges) {
        expect(badge.props.starRating).not.toBe(3);
        expect(badge.props.starRating).not.toBe(4);
      }
    }
  });

  it("shows a pool-specific message when fewer than two clubs exist in the selected pool", () => {
    mockClubVersionsData = [clubVersion("a", 4.5), clubVersion("b", 3.5), clubVersion("c", 3)];
    const renderer = renderCard();
    pressDraw(renderer);
    expect(renderer.root.findAllByType(ClubBadge)).toHaveLength(0);
    const texts = renderer.root.findAllByType(Text);
    expect(texts.some((t) => t.props.children === "home.quickClubDrawNotEnoughPoolClubs")).toBe(true);
    expect(texts.some((t) => t.props.children === "home.quickClubDrawNotEnoughClubs")).toBe(false);
  });

  it("shows the general empty message when there aren't even two clubs overall", () => {
    mockClubVersionsData = [clubVersion("a", 4.5)];
    const renderer = renderCard();
    pressDraw(renderer);
    const texts = renderer.root.findAllByType(Text);
    expect(texts.some((t) => t.props.children === "home.quickClubDrawNotEnoughClubs")).toBe(true);
    expect(texts.some((t) => t.props.children === "home.quickClubDrawNotEnoughPoolClubs")).toBe(false);
  });

  it("never assigns the same club to both sides across repeated draws", () => {
    const renderer = renderCard();
    for (let i = 0; i < 15; i++) {
      pressDraw(renderer);
      const badges = renderer.root.findAllByType(ClubBadge);
      expect(badges[0]!.props.name).not.toBe(badges[1]!.props.name);
    }
  });
});

describe("national teams are always excluded from Quick Club Draw", () => {
  beforeEach(() => {
    mockPool = "large";
  });

  it("never draws a national team, even though club teams at the same star rating exist", () => {
    mockClubVersionsData = [nationalTeamClubVersion("brazil", 5), nationalTeamClubVersion("argentina", 4.5), clubVersion("a", 4.5), clubVersion("b", 5)];
    const renderer = renderCard();
    for (let i = 0; i < 15; i++) {
      pressDraw(renderer);
      const badges = renderer.root.findAllByType(ClubBadge);
      expect(badges.map((b) => b.props.name)).not.toContain("brazil");
      expect(badges.map((b) => b.props.name)).not.toContain("argentina");
    }
  });

  it("club teams remain eligible (not accidentally excluded alongside national teams)", () => {
    mockClubVersionsData = [nationalTeamClubVersion("brazil", 5), clubVersion("a", 4.5), clubVersion("b", 5)];
    const renderer = renderCard();
    pressDraw(renderer);
    const badges = renderer.root.findAllByType(ClubBadge);
    expect(badges).toHaveLength(2);
    for (const badge of badges) expect(["a", "b"]).toContain(badge.props.name);
  });

  it("reports 'not enough clubs' when only national teams are available -- never falls back to drawing them", () => {
    mockClubVersionsData = [nationalTeamClubVersion("brazil", 5), nationalTeamClubVersion("argentina", 4.5)];
    const renderer = renderCard();
    pressDraw(renderer);
    expect(renderer.root.findAllByType(ClubBadge)).toHaveLength(0);
    const texts = renderer.root.findAllByType(Text);
    expect(texts.some((t) => t.props.children === "home.quickClubDrawNotEnoughClubs")).toBe(true);
  });

  it("Large/Small pool filtering still works correctly with national teams excluded", () => {
    mockClubVersionsData = [
      nationalTeamClubVersion("brazil", 4.5),
      nationalTeamClubVersion("germany", 3.5),
      clubVersion("small-a", 3.5),
      clubVersion("small-b", 4),
      clubVersion("large-a", 4.5),
      clubVersion("large-b", 5),
    ];

    mockPool = "small";
    let renderer = renderCard();
    pressDraw(renderer);
    let badges = renderer.root.findAllByType(ClubBadge);
    expect(badges).toHaveLength(2);
    for (const badge of badges) {
      expect([3.5, 4]).toContain(badge.props.starRating);
      expect(badge.props.name).not.toBe("brazil");
      expect(badge.props.name).not.toBe("germany");
    }

    mockPool = "large";
    renderer = renderCard();
    pressDraw(renderer);
    badges = renderer.root.findAllByType(ClubBadge);
    expect(badges).toHaveLength(2);
    for (const badge of badges) {
      expect([4.5, 5]).toContain(badge.props.starRating);
      expect(badge.props.name).not.toBe("brazil");
    }
  });

  it("Bayer Leverkusen (4.0 stars, a club team) resolves to the Small pool and is eligible to draw", () => {
    mockClubVersionsData = [clubVersion("Bayer Leverkusen", 4.0), clubVersion("small-b", 3.5)];
    mockPool = "small";
    const renderer = renderCard();
    pressDraw(renderer);
    const badges = renderer.root.findAllByType(ClubBadge);
    expect(badges.map((b) => b.props.name)).toContain("Bayer Leverkusen");
  });
});
