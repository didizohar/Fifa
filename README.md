# FC Rival

Group stats & Elo tracking for FIFA/EA FC matches. Expo (React Native) + Supabase.

## Status

Stage 1 (Core Infrastructure) only: database schema, RLS, and the atomic
match + Elo write path. No screens yet — see `App.tsx` placeholder.

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

## Testing

```bash
npm test
```
