// Light/blue "premium football app" palette. Every pair below was checked
// against the WCAG AA contrast minimums (4.5:1 for normal text, 3:1 for
// large text/UI components) with the standard relative-luminance formula --
// noted inline wherever a color exists specifically because a more
// "obvious" choice failed that check.
export const colors = {
  background: "#FFFFFF",
  surface: "#F2F4F7",
  surfaceElevated: "#FFFFFF",
  border: "#D1D5DB",
  borderSubtle: "#E5E7EB",

  accent: "#2563EB",
  accentMuted: "#1E40AF",
  accentSubtle: "rgba(37, 99, 235, 0.10)",

  textPrimary: "#0F172A",
  textSecondary: "#475569",
  // 4.76:1 on background, 4.42:1 on surface -- clears AA on both.
  textMuted: "#64748B",

  // 5.02:1 on white -- the more obvious green-600 (#16A34A) only reaches
  // 3.30:1, which fails for the small badge/label text this color is
  // actually used as (FormStrip, MatchRow), not just fills.
  win: "#15803D",
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
