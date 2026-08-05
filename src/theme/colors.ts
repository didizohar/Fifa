export const colors = {
  background: "#0A0D0B",
  surface: "#141917",
  surfaceElevated: "#1C2320",
  border: "#2A322D",
  borderSubtle: "#20261F",

  accent: "#3EE07A",
  accentMuted: "#1FA35A",
  accentSubtle: "rgba(62, 224, 122, 0.14)",

  textPrimary: "#F4F7F5",
  textSecondary: "#9CA8A1",
  // WCAG AA requires 4.5:1 for normal-size text; the original (#6B756F) measured
  // 4.09:1 against background and 3.72:1 against surface -- failing on both. This
  // measures 5.23:1 / 4.77:1 respectively, a minimal lightening that clears the bar.
  textMuted: "#7C877F",

  win: "#3EE07A",
  loss: "#F87171",
  draw: "#F5C451",

  danger: "#F87171",
  dangerSubtle: "rgba(248, 113, 113, 0.14)",
  warning: "#F5C451",
  // Same hex as `draw`/`gold` -- kept as its own semantic name so warning-toned
  // UI (banners, badges) doesn't have to borrow the podium or match-result token.
  warningSubtle: "rgba(245, 196, 81, 0.14)",
  drawSubtle: "rgba(245, 196, 81, 0.14)",

  overlay: "rgba(4, 6, 5, 0.72)",
  skeleton: "#1B211F",
  skeletonHighlight: "#242C29",

  // Podium (leaderboard top-3), distinct from the win/loss/draw palette above.
  gold: "#F5C451",
  goldSubtle: "rgba(245, 196, 81, 0.14)",
  silver: "#C3CBD4",
  silverSubtle: "rgba(195, 203, 212, 0.12)",
  bronze: "#D48A54",
  bronzeSubtle: "rgba(212, 138, 84, 0.14)",
} as const;
