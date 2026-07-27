-- Additive, nullable manual rating used only to balance draw teams/clubs.
-- Deliberately separate from singles_elo/doubles_elo (trg_protect_elo_columns
-- is untouched) -- never read by leaderboards, stats, or matchmaking, and
-- never presented as an objective performance score.
ALTER TABLE player_profiles
    ADD COLUMN draw_level SMALLINT DEFAULT NULL CHECK (draw_level BETWEEN 1 AND 5);
