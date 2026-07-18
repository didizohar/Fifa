# FC Rival

Group stats & Elo tracking for FIFA/EA FC matches. Expo (React Native) + Supabase.

## Status

- **Stage 1** — database schema, RLS, and the atomic match + Elo write path.
- **Stage 2** — mobile MVP: auth, groups, players (with avatars), match
  recording (singles + doubles), a dark "premium sports" theme, and the
  core Home/Players/History/Settings tabs.
- **Stage 3** — advanced statistics (player profile: goals, streaks,
  head-to-head, club/doubles-partner breakdowns, Elo progression charts),
  a Leaderboards tab (11 ranked categories with sorting and an
  Overall/Singles/Doubles filter), combinable match-history filters,
  dashboard widgets, CSV export (matches/leaderboards/player stats), and a
  visual refresh (shared card shadows/glow, podium medals, tabbed player
  profile).

App entry is `expo-router/entry`; screens live under `app/`. The mobile
SDK version outruns what App Store Expo Go supports, so day-to-day
development uses an EAS development build (`eas.json`) rather than plain
Expo Go — see `npx expo start --dev-client`.

## Setup

```bash
npm install
cp .env.example .env   # then fill in EXPO_PUBLIC_SUPABASE_ANON_KEY
```

The Supabase project is `axytjgrlttbjcmflvmph` (already referenced in
`supabase/config.toml`). To push the migrations:

```bash
supabase login
supabase link --project-ref axytjgrlttbjcmflvmph
supabase db push
```

To develop against a local Supabase instance instead:

```bash
supabase start
supabase db reset   # applies supabase/migrations/*.sql in order
```

## Database

Migrations, in order, under `supabase/migrations/`:

1. `initial_schema` — all tables from the product spec, with foreign keys
   that were missing from the original draft (`seasons.group_id`,
   `group_members.user_id`, `player_profiles.linked_user_id` /
   `preferred_club_id`).
2. `group_rpcs` — `create_group` / `join_group_by_invite_code`, the only
   sanctioned way to create a group or add a member (RLS blocks direct
   `INSERT` on `groups` / `group_members`).
3. `match_elo_rpc` — `record_match_and_apply_elo`: writes a match, both
   sides, all players, and every player's new Elo rating in one
   transaction. Uses optimistic concurrency (`UPDATE ... WHERE elo =
   rating_before`) per player, so a stale read aborts the *entire*
   transaction — no partial writes are possible.
4. `rls_policies` — Row Level Security on every table, scoped to group
   membership. `matches` / `match_sides` / `match_players` / `elo_history`
   have no client-facing write policies at all: the RPC above
   (`SECURITY DEFINER`) is the only way to write them. A trigger
   additionally blocks direct `UPDATE`s to `player_profiles.singles_elo` /
   `doubles_elo` outside that same RPC.

## Elo

`src/lib/elo.ts` — pure function, no I/O, so it's unit tested directly.
Standard Elo (`K=32`) with a goal-difference multiplier for decisive wins
and a compressed swing for shootout-decided draws. `src/lib/matchService.ts`
wraps it: reads current ratings, computes the new ones, and calls
`record_match_and_apply_elo`, retrying up to 3 times if the RPC reports a
concurrency conflict (another match for one of the same players landed in
between).

## Statistics, filters, and export (Stage 3)

All business logic is pure and I/O-free, mirroring `elo.ts`'s testable
style — every function below is unit tested, no component-rendering
tests needed:

- `src/lib/stats.ts` — per-player stats (goals, streaks, head-to-head,
  club/doubles-partner breakdowns) and group-wide leaderboard functions.
  `MIN_SAMPLE_SIZE` (3) is the shared threshold below which a computed
  stat or chart isn't a reliable sample.
- `src/lib/matchFilters.ts` — combinable match-history filters (player,
  opponent, club, date range, type, result, search).
- `src/lib/csv.ts` — CSV serialization for matches/leaderboards/player
  stats; `src/lib/exportFile.ts` hands the result to a browser download
  (web) or the native share sheet via `expo-sharing` (iOS/Android).

Data fetching (`fetchGroupMatchHistory`, `fetchEloHistory`, etc.) lives in
`src/lib/matches.ts` and is uncapped — leaderboards and filters need a
player's/group's whole history, not a recency-limited preview list.

## Testing

```bash
npm test           # jest -- all pure business logic
npx tsc --noEmit    # typecheck
npx expo-doctor     # SDK/dependency alignment
```

## Releases

See [CHANGELOG.md](CHANGELOG.md) for the version history, or the
[GitHub Releases page](https://github.com/didizohar/Fifa/releases) for
tagged builds.
