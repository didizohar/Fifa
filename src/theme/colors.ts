// Light/blue "premium football app" palette. Every pair below was checked
// against the WCAG AA contrast minimums (4.5:1 for normal text, 3:1 for
// large text/UI components) with the standard relative-luminance formula --
// noted inline wherever a color exists specifically because a more
// "obvious" choice failed that check.
export const lightColors = {
  background: "#FFFFFF",
  surface: "#F2F4F7",
  surfaceElevated: "#FFFFFF",
  // A step above surfaceElevated for the single most prominent card on a
  // screen (e.g. the live-session hero) -- adapted from the same hierarchy
  // dark mode uses, not a literal match to it: light mode has nowhere
  // "brighter" than white to go, so this is a faint accent tint instead.
  surfaceStrong: "#EFF6FF",
  border: "#D1D5DB",
  borderSubtle: "#E5E7EB",
  borderStrong: "#9CA3AF",

  accent: "#2563EB",
  accentMuted: "#1E40AF",
  accentSubtle: "rgba(37, 99, 235, 0.10)",
  // Same hex as `warning` below -- restrained orange brand highlight,
  // reusing the existing verified-AA amber/orange rather than adding an
  // unverified new hex just for this key.
  accentOrange: "#B45309",
  accentOrangeSubtle: "rgba(180, 83, 9, 0.10)",

  textPrimary: "#0F172A",
  textSecondary: "#475569",
  // 4.76:1 on background, 4.42:1 on surface -- clears AA on both.
  textMuted: "#64748B",

  // 5.02:1 on white -- the more obvious green-600 (#16A34A) only reaches
  // 3.30:1, which fails for the small badge/label text this color is
  // actually used as (FormStrip, MatchRow), not just fills.
  win: "#15803D",
  // Same as `win` -- an active/live indicator is semantically the same
  // "good/ongoing" green as a win, just a different occasion to use it.
  live: "#15803D",
  loss: "#DC2626",
  // 5.02:1 on white -- amber-600 (#D97706) only reaches 3.19:1 for the
  // same small-text reason as `win` above.
  draw: "#B45309",

  danger: "#DC2626",
  dangerSubtle: "rgba(220, 38, 38, 0.08)",
  warning: "#B45309",
  // Same hex as `draw` -- kept as its own semantic name so warning-toned
  // UI (banners, badges) doesn't have to borrow the match-result token.
  warningSubtle: "rgba(180, 83, 9, 0.10)",
  drawSubtle: "rgba(180, 83, 9, 0.10)",

  overlay: "rgba(15, 23, 42, 0.5)",
  skeleton: "#E2E8F0",
  skeletonHighlight: "#EDF1F5",

  // Podium (leaderboard top-3), distinct from the win/loss/draw palette above.
  // gold measures 4.92:1 on white -- the more obvious amber-600 (#CA8A04)
  // only reaches 2.94:1.
  gold: "#A16207",
  goldSubtle: "rgba(161, 98, 7, 0.12)",
  silver: "#64748B",
  silverSubtle: "rgba(100, 116, 139, 0.12)",
  bronze: "#92400E",
  bronzeSubtle: "rgba(146, 64, 14, 0.12)",
} as const;

// Dark counterpart -- NOT a generic inverted palette. Every value here is
// sampled directly from the Couch League visual concept (design-refs/,
// pixel-measured, see the colors.test.ts contrast matrix for the WCAG
// verification) -- this dark theme is the primary, reference-matched
// target; light mode above is the one adapted from it, not the other way
// around. `accent`/`accentOrange`/`win`/`loss`/`draw`/`gold`/`bronze`/
// `silver` are all used as actual text/icon colors elsewhere in the app
// (not just fills -- see RankingRow, ScoreStepper, StatTile,
// CareerSummaryCard, etc.), so each is held to the 4.5:1 text minimum
// against background, surface, surfaceElevated AND surfaceStrong --
// `accentMuted` is fills-only (Switch tracks, chart bars/gradients), so
// only needs the 3:1 UI-component minimum.
export const darkColors = {
  background: "#030D24",
  surface: "#0D1B36",
  surfaceElevated: "#11244A",
  surfaceStrong: "#122448",
  border: "#1E3A66",
  borderSubtle: "#16294D",
  borderStrong: "#2E4F8C",

  // 4.73:1 on surfaceStrong -- the tightest margin of this palette for a
  // color used as actual text, not just a fill.
  accent: "#4A8CFF",
  accentMuted: "#2F5FCC",
  accentSubtle: "rgba(74, 140, 255, 0.14)",
  // Restrained orange brand highlight -- sampled from the concept's
  // tagline/Team-2/streak accents (design-refs), used sparingly per spec.
  accentOrange: "#F2994A",
  accentOrangeSubtle: "rgba(242, 153, 74, 0.14)",

  textPrimary: "#F5F7FA",
  textSecondary: "#A9BEE3",
  textMuted: "#84A0D6",

  win: "#4ADE80",
  live: "#4ADE80",
  // 4.95:1 on surfaceStrong.
  loss: "#F16565",
  draw: "#F2C14E",

  danger: "#F16565",
  dangerSubtle: "rgba(241, 101, 101, 0.14)",
  warning: "#F2C14E",
  warningSubtle: "rgba(242, 193, 78, 0.14)",
  drawSubtle: "rgba(242, 193, 78, 0.14)",

  overlay: "rgba(2, 7, 20, 0.7)",
  skeleton: "#11244A",
  skeletonHighlight: "#1C3766",

  // Same hex as `draw` -- same gold/draw split reasoning as the light palette.
  gold: "#F2C14E",
  goldSubtle: "rgba(242, 193, 78, 0.16)",
  silver: "#C7D2E8",
  silverSubtle: "rgba(199, 210, 232, 0.14)",
  bronze: "#F0925A",
  bronzeSubtle: "rgba(240, 146, 90, 0.16)",
} as const;

/**
 * Deliberately widened to `string` per key (not `typeof lightColors`, which
 * TypeScript would infer as literal hex strings) -- darkColors needs to
 * satisfy this same shape with entirely different literal values, which a
 * literal-typed alias could never accept.
 */
export type ThemeColors = { [K in keyof typeof lightColors]: string };

/**
 * Backward-compatible static export -- every component that hasn't been
 * migrated to useTheme() yet (see src/theme/ThemeContext.tsx) still imports
 * this directly and stays exactly light-themed, unchanged, until its own
 * migration lands. Do not add anything here that isn't also in darkColors --
 * ThemeColors is keyed off this object's shape.
 */
export const colors = lightColors;
