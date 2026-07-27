import en from "../src/lib/i18n/translations/en";
import he from "../src/lib/i18n/translations/he";

function collectKeyPaths(obj: unknown, prefix = ""): string[] {
  if (typeof obj !== "object" || obj === null) return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([key, value]) => collectKeyPaths(value, prefix ? `${prefix}.${key}` : key));
}

describe("translation key completeness", () => {
  it("has an identical key set in every locale, so a screen never falls back to a missing string", () => {
    const enKeys = collectKeyPaths(en).sort();
    const heKeys = collectKeyPaths(he).sort();
    expect(heKeys).toEqual(enKeys);
  });

  it("never leaves a key with an empty string value", () => {
    for (const [locale, dict] of [["en", en] as const, ["he", he] as const]) {
      for (const path of collectKeyPaths(dict)) {
        const value = path.split(".").reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], dict);
        expect(typeof value === "string" && value.trim().length > 0).toBe(true);
        if (!(typeof value === "string" && value.trim().length > 0)) {
          throw new Error(`${locale}.${path} is empty`);
        }
      }
    }
  });

  it("keeps the same {placeholder} names between locales for keys that use interpolation", () => {
    const placeholderNames = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();

    for (const path of collectKeyPaths(en)) {
      const enValue = path.split(".").reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], en) as string;
      const heValue = path.split(".").reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], he) as string;
      expect(placeholderNames(heValue)).toEqual(placeholderNames(enValue));
    }
  });
});

/**
 * Explicit, named coverage for every Stage 6.1 (draw + Hebrew/RTL) surface --
 * the Draw hub, all four draw screens, the Draw Level editor, Record Match
 * prefill, and the shared picker/error/stepper components they all render
 * through. The generic key-parity test above already covers the whole tree
 * structurally; this one exists so a reviewer can see, key by key, that the
 * specific strings this stage introduced are present and non-empty in both
 * locales, without having to cross-reference every screen by hand.
 */
describe("Stage 6.1 draw translation coverage", () => {
  const stage61Keys = [
    // Draw hub
    "draw.title",
    "draw.subtitle",
    "draw.randomPlayers",
    "draw.randomPlayersSubtitle",
    "draw.createTeams",
    "draw.createTeamsSubtitle",
    "draw.drawClubs",
    "draw.drawClubsSubtitle",
    "draw.fullMatchup",
    "draw.fullMatchupSubtitle",
    // Shared draw configuration
    "draw.eligiblePlayers",
    "draw.activeOnly",
    "draw.includeArchived",
    "draw.selectPlayers",
    "draw.selectAll",
    "draw.clearSelection",
    "draw.gameVersion",
    // Random Player Draw
    "draw.howMany",
    "draw.drawButton",
    "draw.resultTitle",
    "draw.notEnoughPlayers",
    "draw.notEnoughPlayersMessage",
    "draw.zeroPlayers",
    "draw.zeroPlayersMessage",
    // Team Draw
    "draw.teamCount",
    "draw.teamLabel",
    "draw.teamPlayerCount",
    "draw.teamMode",
    "draw.modeRandom",
    "draw.modeBalanced",
    "draw.teamSizeNote",
    "draw.teamNamePlaceholder",
    "draw.movePlayer",
    // Club Draw (all five modes + star filters + handicap)
    "draw.clubMode",
    "draw.clubModeRandom",
    "draw.clubModeExactStars",
    "draw.clubModeStarRange",
    "draw.clubModeBalanced",
    "draw.clubModeHandicap",
    "draw.exactStarsLabel",
    "draw.starRangeLabel",
    "draw.rangeFrom",
    "draw.rangeTo",
    "draw.allowDuplicateClubs",
    "draw.noClubsInRange",
    "draw.noClubsInRangeMessage",
    "draw.duplicateClubsUsed",
    "draw.handicapExplanation",
    "draw.balancedExplanation",
    "draw.missingDrawLevel",
    // Full Matchup
    "draw.matchTypeSingles",
    "draw.matchTypeDoubles",
    "draw.randomizeSides",
    "draw.side",
    "draw.matchupStep1",
    "draw.matchupStep2",
    "draw.redrawPlayersOnly",
    "draw.redrawTeamsOnly",
    "draw.redrawClubsOnly",
    "draw.proceedToRecordMatch",
    "draw.vs",
    // Draw Level editor
    "draw.drawLevelLabel",
    "draw.drawLevelHint",
    "draw.clearDrawLevel",
    // Record Match prefill
    "draw.prefillBannerMessage",
    // Lock/unlock, redraw/reset, share/copy -- shared across every draw screen
    "common.lock",
    "common.unlock",
    "common.redraw",
    "common.redrawAll",
    "common.reset",
    "common.resetAll",
    "common.skip",
    "common.share",
    "common.copy",
    "common.copied",
    "common.clear",
    // Shared picker/error/stepper components rendered by every draw screen
    "common.searchPlayers",
    "common.playersSelectedCount",
    "common.noPlayersMatch",
    "common.somethingWentWrong",
    "common.retry",
    "common.decreaseLabel",
    "common.increaseLabel",
    "common.valueLabel",
    "common.addPlayer",
  ];

  const readPath = (dict: unknown, path: string) => path.split(".").reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], dict);

  it.each(stage61Keys)("%s exists as a non-empty string in English and Hebrew", (path) => {
    const enValue = readPath(en, path);
    const heValue = readPath(he, path);
    expect(typeof enValue === "string" && enValue.trim().length > 0).toBe(true);
    expect(typeof heValue === "string" && heValue.trim().length > 0).toBe(true);
  });
});
