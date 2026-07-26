-- Additive, non-destructive: speeds up the per-player match lookups used by
-- fetchPlayerMatchHistory / fetchPlayerRecordRows (WHERE player_id IN (...)),
-- which the existing unique constraint on (match_side_id, player_id) doesn't serve.
CREATE INDEX IF NOT EXISTS idx_match_players_player ON match_players(player_id);
