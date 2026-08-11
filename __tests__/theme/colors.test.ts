import { colors, darkColors, lightColors } from "../../src/theme/colors";
import { createShadows, shadows } from "../../src/theme/shadows";
import { createTypography, typography } from "../../src/theme/typography";

// Same standard WCAG relative-luminance contrast formula the inline
// comments in colors.ts were measured with.
function srgbToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function relativeLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const [R, G, B] = [r, g, b].map(srgbToLinear);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}
function contrastRatio(hexA: string, hexB: string): number {
  const [l1, l2] = [relativeLuminance(hexA), relativeLuminance(hexB)].sort((a, b) => b - a);
  return (l1 + 0.05) / (l2 + 0.05);
}

describe("theme static exports -- backward compatibility (unmigrated components must stay light-only, byte-for-byte)", () => {
  it("colors is exactly lightColors", () => {
    expect(colors).toEqual(lightColors);
  });

  it("typography is exactly createTypography(lightColors)", () => {
    expect(typography).toEqual(createTypography(lightColors));
  });

  it("shadows is exactly createShadows(lightColors)", () => {
    expect(shadows).toEqual(createShadows(lightColors));
  });
});

describe("darkColors -- shape parity with lightColors", () => {
  it("has exactly the same keys as lightColors (no token exists in only one palette)", () => {
    expect(Object.keys(darkColors).sort()).toEqual(Object.keys(lightColors).sort());
  });

  it("every value is actually different from the light palette (no accidental copy-paste leaving a token un-dark-ified)", () => {
    for (const key of Object.keys(lightColors) as (keyof typeof lightColors)[]) {
      expect(darkColors[key]).not.toBe(lightColors[key]);
    }
  });
});

describe("darkColors -- WCAG AA contrast against its own background/surface/surfaceElevated", () => {
  const AA_TEXT = 4.5;
  // Colors used as actual text/icon fills elsewhere in the app (RankingRow,
  // ScoreStepper, StatTile, CareerSummaryCard, FormStrip, MatchRow, podium
  // rows, etc.) -- see the comments in colors.ts for exactly why each of
  // these specific keys (and not e.g. accentMuted, border, which are
  // fills/dividers only) is held to the stricter text-level minimum.
  const textRoleKeys: (keyof typeof darkColors)[] = ["textPrimary", "textSecondary", "textMuted", "accent", "accentOrange", "win", "loss", "draw", "gold", "silver", "bronze"];
  const backgrounds: (keyof typeof darkColors)[] = ["background", "surface", "surfaceElevated", "surfaceStrong"];

  it.each(textRoleKeys)("%s clears 4.5:1 against every dark background/surface tone", (key) => {
    for (const bgKey of backgrounds) {
      const ratio = contrastRatio(darkColors[key], darkColors[bgKey]);
      expect(ratio).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });
});
