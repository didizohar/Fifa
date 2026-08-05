/**
 * Single source of truth mapping every pushed (app) stack route name to its
 * translated screen title. `app/(app)/_layout.tsx` uses this for each
 * screen's own `title`, and `HeaderBackButton.tsx` uses the SAME map to
 * look up what a screen further down the stack should say when it's the
 * "previous screen" for whichever one is now on top -- so the two can
 * never drift out of sync.
 *
 * "(tabs)" has no header of its own (headerShown: false), but still needs
 * an entry here: it's what a back button shows when returning from a
 * screen pushed directly off a tab (e.g. Trends -> back to "Dashboard").
 */
export const ROUTE_TITLE_KEYS: Record<string, string> = {
  "(tabs)": "home.dashboard",
  "player/new": "common.addPlayer",
  "player/[id]/index": "common.playerTitle",
  "player/[id]/edit": "common.editPlayer",
  "match/[id]": "common.matchTitle",
  "draw/index": "draw.title",
  "draw/players": "draw.randomPlayers",
  "draw/teams": "draw.createTeams",
  "draw/clubs": "draw.drawClubs",
  "draw/matchup": "draw.fullMatchup",
  "league-management": "league.title",
  "league-table": "leagueTable.title",
  "monthly-summary": "monthlySummary.title",
  trends: "trendsScreen.title",
  insights: "insightsScreen.title",
  "custom-clubs": "customClubs.title",
  "season-history": "seasonHistory.title",
  "season/[id]": "seasonHistory.detailsTitle",
};
