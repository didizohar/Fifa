import TestRenderer, { act } from "react-test-renderer";
import { Text } from "react-native";
import { AnimatedPressable } from "../../src/components/AnimatedPressable";
import { ClubBadge } from "../../src/components/ClubBadge";
import { QuickClubDrawCard } from "../../src/components/QuickClubDrawCard";

jest.mock("../../src/lib/i18n", () => ({
  useTranslation: () => ({ t: (key: string) => key, locale: "en", isRTL: false, setLocale: jest.fn() }),
}));

let mockClubVersionsData: unknown[] = [];
jest.mock("../../src/hooks/useClubVersions", () => ({
  useClubVersions: () => ({ data: mockClubVersionsData, isLoading: false }),
}));

jest.mock("../../src/hooks/useNationalTeamsPreference", () => ({
  useNationalTeamsPreference: () => ({ includeNationalTeams: true, setIncludeNationalTeams: jest.fn() }),
}));

function clubVersion(id: string, starRating: number) {
  return { id: `cv-${id}`, club_id: id, game_version_id: "gv-1", star_rating: starRating, club: { id, name: id, deleted_at: null, group_id: null, league: null } };
}

/**
 * Deliberately more 3.5-star clubs than 4.5-star ones -- this is exactly the
 * shape of pool that used to make "By Stars" silently land on 3.5 (the level
 * with the most eligible clubs) instead of a fixed rating.
 */
const MIXED_POOL = [
  clubVersion("a", 3.5),
  clubVersion("b", 3.5),
  clubVersion("c", 3.5),
  clubVersion("d", 3.5),
  clubVersion("e", 4.5),
  clubVersion("f", 4.5),
  clubVersion("g", 5),
];

function renderCard() {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<QuickClubDrawCard groupId="group-1" gameVersionId="gv-1" />);
  });
  return renderer;
}

function pressByStars(renderer: TestRenderer.ReactTestRenderer) {
  const buttons = renderer.root.findAllByType(AnimatedPressable);
  // Random is first, By Stars is second -- matches the button row's JSX order.
  const byStarsButton = buttons[1]!;
  act(() => {
    (byStarsButton.props.onPress as () => void)();
  });
}

describe("QuickClubDrawCard -- By Stars is fixed to exactly 4.5", () => {
  beforeEach(() => {
    mockClubVersionsData = MIXED_POOL;
  });

  it("draws two clubs at exactly 4.5 stars, never the more numerous 3.5-star level", () => {
    const renderer = renderCard();
    pressByStars(renderer);
    const badges = renderer.root.findAllByType(ClubBadge);
    expect(badges).toHaveLength(2);
    for (const badge of badges) {
      expect(badge.props.starRating).toBe(4.5);
    }
  });

  it("keeps drawing exactly 4.5-star clubs across many repeated redraws, never falling back to 3.5, 4, or 5", () => {
    const renderer = renderCard();
    for (let i = 0; i < 15; i++) {
      pressByStars(renderer);
      const badges = renderer.root.findAllByType(ClubBadge);
      expect(badges).toHaveLength(2);
      for (const badge of badges) {
        expect(badge.props.starRating).toBe(4.5);
      }
    }
  });

  it("never assigns the same club to both sides across repeated redraws", () => {
    const renderer = renderCard();
    for (let i = 0; i < 15; i++) {
      pressByStars(renderer);
      const badges = renderer.root.findAllByType(ClubBadge);
      expect(badges[0]!.props.name).not.toBe(badges[1]!.props.name);
    }
  });

  it("shows a clear 'not enough 4.5-star clubs' message instead of silently using a different rating when fewer than two exist", () => {
    mockClubVersionsData = [clubVersion("a", 3.5), clubVersion("b", 3.5), clubVersion("c", 4.5)];
    const renderer = renderCard();
    pressByStars(renderer);
    expect(renderer.root.findAllByType(ClubBadge)).toHaveLength(0);
    const texts = renderer.root.findAllByType(Text);
    expect(texts.some((t) => t.props.children === "home.quickClubDrawNotEnoughStarClubs")).toBe(true);
    expect(texts.some((t) => t.props.children === "home.quickClubDrawNotEnoughClubs")).toBe(false);
  });

  it("shows the general empty message (not the star-specific one) when there aren't even two clubs overall", () => {
    mockClubVersionsData = [clubVersion("a", 3.5)];
    const renderer = renderCard();
    pressByStars(renderer);
    const texts = renderer.root.findAllByType(Text);
    expect(texts.some((t) => t.props.children === "home.quickClubDrawNotEnoughClubs")).toBe(true);
    expect(texts.some((t) => t.props.children === "home.quickClubDrawNotEnoughStarClubs")).toBe(false);
  });

  it("Random mode is unaffected -- still draws from the whole pool, not restricted to 4.5", () => {
    const renderer = renderCard();
    const seenRatings = new Set<number>();
    for (let i = 0; i < 20; i++) {
      const buttons = renderer.root.findAllByType(AnimatedPressable);
      act(() => {
        (buttons[0]!.props.onPress as () => void)();
      });
      const badges = renderer.root.findAllByType(ClubBadge);
      for (const badge of badges) seenRatings.add(badge.props.starRating as number);
    }
    // With this pool, Random drawing 20 times should surface more than just 4.5 -- proving it isn't restricted the way By Stars now is.
    expect(seenRatings.size).toBeGreaterThan(1);
  });
});
