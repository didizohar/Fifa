# Changelog

All notable changes to FC Rival are documented here. Format loosely
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this
project doesn't publish to a registry, so versions are stage tags rather
than strict semver releases.

## [0.3.0-stage3] - 2026-07-18

Advanced statistics, leaderboards, filtering, dashboard/profile redesign,
and CSV export on top of the Stage 2 mobile MVP.

### Added

**Statistics & charts**
- Player profile: lifetime stats, last-10 form guide, current/longest
  win and loss streaks, goals scored/conceded/per-match, clean sheets,
  biggest win/loss, club performance breakdown, doubles-partner
  breakdown, head-to-head record (with goals for/against/difference),
  and an Elo progression chart (singles + doubles).
- Charts show a "Not enough matches yet" state instead of a misleading
  flat bar when the sample is too small (`MIN_SAMPLE_SIZE`, 3 matches).

**Leaderboards**
- New Leaderboards tab: Elo (Overall/Singles/Doubles), Win %, Most
  Matches, Longest Win/Loss Streak, Goals Scored, Goals Conceded, Goal
  Difference, Clean Sheets, Best Doubles Pair, and Monthly rankings
  (with month navigation).
- Global sort-direction toggle (best-first / worst-first).
- Podium medals for the top 3 and highlighting for the signed-in user's
  own row, everywhere `RankingRow` is used.

**Match history filters**
- Combinable filters on the History screen: player, opponent (relative
  to the selected player), club, date range, singles/doubles, win/loss/
  draw, and free-text search.

**Dashboard**
- Home screen gained quick actions, stat tiles (matches/players/this
  month), a "your form" card for the signed-in user's linked player,
  a most-active mini leaderboard, and a top-this-month highlight.

**Player profile redesign**
- Gradient hero section (avatar, name, rank among the group, recent
  form) and a 2x2 stat-tile grid, replacing the old plain header.
- Overview / Charts / Head-to-Head tabs replace one long stack of cards.

**Export**
- CSV export for match history (respects active filters), leaderboards
  (any category/sort), and full-roster player statistics -- browser
  download on web, native share sheet (`expo-sharing`) on iOS/Android.

**Design system**
- `src/theme/shadows.ts` (sm/md/lg/glow, platform-aware); `Card` gained
  `variant` ("default" | "elevated" | "glow") and `compact` props, so
  every existing card gets a subtle shadow for free.
- New shared components: `FormStrip`, `BarChart`, `Sparkline`,
  `SegmentedControl`, `StatTile`, `ExportButton`.
- `Screen` centers content with a max-width on web so cards/charts don't
  stretch across a wide browser window.

**EAS / dev tooling**
- `expo-dev-client` + `eas.json` (development/preview/production
  profiles), since App Store Expo Go no longer supports this project's
  SDK. EAS project linked (`@didizzz/fc-rival`).

### Changed
- History now sources from an uncapped group match history fetch
  instead of a 200-match-capped list, so filters are correct over a
  group's whole history.
- `RankingRow`'s props generalized from Elo-specific fields to
  `{value, detail}` so every leaderboard category (and Home) reuses it.
- Package versions realigned to what Expo SDK 57 expects
  (`expo`, `expo-constants`, `expo-image-picker`, `expo-router`,
  `react`, `react-dom`).

### Fixed
- `storage.ts`'s avatar upload was using SDK 57's `expo-file-system` top-
  level export, which only ships typed-but-throwing deprecation shims;
  switched to the working `expo-file-system/legacy` subpath (found while
  building CSV export, which hit the same issue).

### Internal
- Extracted `toPickablePlayer` to `src/lib/players.ts`, removing four
  duplicated inline player-mapping call sites.
- Consolidated five independent hardcoded "minimum sample size" values
  (3) into `stats.ts`'s exported `MIN_SAMPLE_SIZE`.
- 75 tests total (up from 34), all pure business-logic functions --
  `stats.ts`, `matchFilters.ts`, `csv.ts`.

## [0.2.0-stage2] - 2026-07-16

Mobile MVP: Expo Router app on top of the Stage 1 backend.

### Added
- Email auth (signup/login) with persistent session.
- Group create / join via invite code.
- Player roster: add, edit, archive, avatar upload to Supabase Storage.
- Singles and doubles match recording through the atomic
  `record_match_and_apply_elo` RPC, with client-side validation.
- Home dashboard (rankings, recent matches, win rate, current Elo),
  match history, match detail.
- Bottom-tab + stack navigation, dark "premium sports" theme, skeleton
  loading, empty/error states, pull-to-refresh.

## [0.1.0-stage1] - 2026-07-15

Core infrastructure: no screens yet.

### Added
- Database schema, Row Level Security policies scoped to group
  membership, and the atomic `record_match_and_apply_elo` RPC (writes a
  match, both sides, all players, and every player's new Elo rating in
  one transaction with optimistic concurrency).
- `src/lib/elo.ts`: pure Elo implementation (K=32, goal-difference
  multiplier, penalty-shootout compression), unit tested directly.
