-- FC Rival: atomic match + Elo write
--
-- Writes the match, both sides, all players, AND applies the Elo rating
-- change for every player in a single transaction. The Elo delta itself is
-- computed client-side (src/lib/elo.ts) since it's pure math and unit
-- tested there; this function only APPLIES it, using optimistic
-- concurrency (UPDATE ... WHERE <elo_field> = rating_before) so that if a
-- player's rating changed between the caller reading it and this call
-- committing, the whole transaction -- including the match row -- rolls
-- back instead of leaving a match recorded with a stale/partial Elo
-- update. Callers should catch the resulting exception and retry with
-- freshly re-read ratings.

CREATE OR REPLACE FUNCTION record_match_and_apply_elo(
    p_group_id UUID,
    p_season_id UUID,
    p_game_version_id UUID,
    p_match_type VARCHAR,
    p_is_overtime BOOLEAN,
    p_is_penalties BOOLEAN,
    p_screenshot_url TEXT,
    p_notes TEXT,
    p_elo_field VARCHAR, -- 'singles_elo' or 'doubles_elo'
    -- Side 1. p_s1_ratings_before is parallel to p_s1_players (each
    -- player's own current rating -- teammates on a doubles side can
    -- differ). p_s1_rating_after is the single new rating the whole side
    -- converges to, per the blueprint's per-side (not per-player) model.
    p_s1_club_version_id UUID, p_s1_score INT, p_s1_penalty INT, p_s1_result VARCHAR,
    p_s1_players UUID[], p_s1_ratings_before INT[], p_s1_rating_after INT,
    -- Side 2
    p_s2_club_version_id UUID, p_s2_score INT, p_s2_penalty INT, p_s2_result VARCHAR,
    p_s2_players UUID[], p_s2_ratings_before INT[], p_s2_rating_after INT
) RETURNS UUID AS $$
DECLARE
    v_match_id UUID;
    v_side1_id UUID;
    v_side2_id UUID;
    v_player_id UUID;
    i INT;
BEGIN
    IF array_length(p_s1_players, 1) IS DISTINCT FROM array_length(p_s1_ratings_before, 1)
       OR array_length(p_s2_players, 1) IS DISTINCT FROM array_length(p_s2_ratings_before, 1) THEN
        RAISE EXCEPTION 'players and ratings_before arrays must be the same length per side';
    END IF;

    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF p_elo_field NOT IN ('singles_elo', 'doubles_elo') THEN
        RAISE EXCEPTION 'Invalid elo_field: %', p_elo_field;
    END IF;

    -- Lets the trg_protect_elo_columns trigger (added in the RLS migration)
    -- allow the Elo writes below. Transaction-local (`is_local = true`),
    -- so it never leaks outside this call.
    PERFORM set_config('app.elo_write_allowed', 'true', true);

    -- 1. Match header
    INSERT INTO matches (
        group_id, season_id, game_version_id, match_type,
        is_overtime, is_penalties, screenshot_url, notes, created_by
    )
    VALUES (
        p_group_id, p_season_id, p_game_version_id, p_match_type,
        p_is_overtime, p_is_penalties, p_screenshot_url, p_notes, auth.uid()
    )
    RETURNING id INTO v_match_id;

    -- 2. Sides
    INSERT INTO match_sides (match_id, side_number, club_version_id, score, penalty_score, result)
    VALUES (v_match_id, 1, p_s1_club_version_id, p_s1_score, p_s1_penalty, p_s1_result)
    RETURNING id INTO v_side1_id;

    INSERT INTO match_sides (match_id, side_number, club_version_id, score, penalty_score, result)
    VALUES (v_match_id, 2, p_s2_club_version_id, p_s2_score, p_s2_penalty, p_s2_result)
    RETURNING id INTO v_side2_id;

    -- 3. Side 1 players + Elo (optimistic concurrency, per player)
    FOR i IN 1..array_length(p_s1_players, 1) LOOP
        v_player_id := p_s1_players[i];
        INSERT INTO match_players (match_side_id, player_id) VALUES (v_side1_id, v_player_id);

        IF p_elo_field = 'singles_elo' THEN
            UPDATE player_profiles SET singles_elo = p_s1_rating_after, updated_at = CURRENT_TIMESTAMP
            WHERE id = v_player_id AND singles_elo = p_s1_ratings_before[i];
        ELSE
            UPDATE player_profiles SET doubles_elo = p_s1_rating_after, updated_at = CURRENT_TIMESTAMP
            WHERE id = v_player_id AND doubles_elo = p_s1_ratings_before[i];
        END IF;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Elo concurrency conflict for player %: rating changed since it was read', v_player_id
                USING ERRCODE = 'serialization_failure';
        END IF;

        INSERT INTO elo_history (player_id, match_id, match_type, rating_before, rating_after)
        VALUES (v_player_id, v_match_id, p_match_type, p_s1_ratings_before[i], p_s1_rating_after);
    END LOOP;

    -- 4. Side 2 players + Elo (optimistic concurrency, per player)
    FOR i IN 1..array_length(p_s2_players, 1) LOOP
        v_player_id := p_s2_players[i];
        INSERT INTO match_players (match_side_id, player_id) VALUES (v_side2_id, v_player_id);

        IF p_elo_field = 'singles_elo' THEN
            UPDATE player_profiles SET singles_elo = p_s2_rating_after, updated_at = CURRENT_TIMESTAMP
            WHERE id = v_player_id AND singles_elo = p_s2_ratings_before[i];
        ELSE
            UPDATE player_profiles SET doubles_elo = p_s2_rating_after, updated_at = CURRENT_TIMESTAMP
            WHERE id = v_player_id AND doubles_elo = p_s2_ratings_before[i];
        END IF;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Elo concurrency conflict for player %: rating changed since it was read', v_player_id
                USING ERRCODE = 'serialization_failure';
        END IF;

        INSERT INTO elo_history (player_id, match_id, match_type, rating_before, rating_after)
        VALUES (v_player_id, v_match_id, p_match_type, p_s2_ratings_before[i], p_s2_rating_after);
    END LOOP;

    RETURN v_match_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
