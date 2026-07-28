-- FC Rival: stop computing/applying Elo when recording a match.
--
-- FC Rival's rankings are entirely Win-Rate-based (see
-- src/lib/stats.ts's computeWinRateLeaderboard / computeWinRateRank) --
-- Elo is no longer an active product feature. This adds a new record_match()
-- RPC that inserts a match/sides/players exactly like
-- record_match_and_apply_elo, but never touches singles_elo/doubles_elo or
-- elo_history. The app now calls this instead.
--
-- record_match_and_apply_elo (20260715120200_match_elo_rpc.sql) is left
-- entirely alone -- historical migrations are not rewritten, and it isn't
-- being dropped, just no longer called -- so no historical match/rating
-- data is altered by this migration. singles_elo/doubles_elo/elo_history
-- are intentionally retained as unused legacy fields (see PlayerProfile's
-- docstring in src/lib/types/database.ts) rather than dropped: removing
-- columns that already have a protective trigger wired to them is a
-- separate, higher-risk change than simply not writing to them anymore.
--
-- Also closes a gap the original function had: record_match_and_apply_elo
-- never checked group membership, only that *some* user was authenticated.
-- This one does, plus the same score/result/player-count/duplicate
-- consistency backstops added to update_match in the previous migration.

CREATE OR REPLACE FUNCTION record_match(
    p_group_id UUID,
    p_season_id UUID,
    p_game_version_id UUID,
    p_match_type VARCHAR,
    p_is_overtime BOOLEAN,
    p_is_penalties BOOLEAN,
    p_screenshot_url TEXT,
    p_notes TEXT,
    p_s1_club_version_id UUID, p_s1_score INT, p_s1_penalty INT, p_s1_result VARCHAR, p_s1_players UUID[],
    p_s2_club_version_id UUID, p_s2_score INT, p_s2_penalty INT, p_s2_result VARCHAR, p_s2_players UUID[]
) RETURNS UUID AS $$
DECLARE
    v_match_id UUID;
    v_side1_id UUID;
    v_side2_id UUID;
    v_required_players INT;
    i INT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF NOT is_group_member(p_group_id) THEN
        RAISE EXCEPTION 'Not a member of this group' USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF p_match_type NOT IN ('singles', 'doubles') THEN
        RAISE EXCEPTION 'Invalid match_type: %', p_match_type;
    END IF;

    v_required_players := CASE WHEN p_match_type = 'singles' THEN 1 ELSE 2 END;
    IF COALESCE(array_length(p_s1_players, 1), 0) != v_required_players
       OR COALESCE(array_length(p_s2_players, 1), 0) != v_required_players THEN
        RAISE EXCEPTION 'Each side needs exactly % player(s) for a % match', v_required_players, p_match_type;
    END IF;

    IF (SELECT COUNT(DISTINCT x) FROM unnest(p_s1_players) x) != array_length(p_s1_players, 1)
       OR (SELECT COUNT(DISTINCT x) FROM unnest(p_s2_players) x) != array_length(p_s2_players, 1) THEN
        RAISE EXCEPTION 'A side cannot list the same player twice';
    END IF;

    IF EXISTS (SELECT 1 FROM unnest(p_s1_players) x WHERE x = ANY(p_s2_players)) THEN
        RAISE EXCEPTION 'A player cannot be on both sides of the same match';
    END IF;

    IF p_s1_score = p_s2_score THEN
        IF p_is_penalties THEN
            IF p_s1_penalty IS NULL OR p_s2_penalty IS NULL OR p_s1_penalty = p_s2_penalty THEN
                RAISE EXCEPTION 'A level match decided by penalties needs two different penalty scores';
            END IF;
            IF (p_s1_penalty > p_s2_penalty AND (p_s1_result != 'win' OR p_s2_result != 'loss'))
               OR (p_s2_penalty > p_s1_penalty AND (p_s2_result != 'win' OR p_s1_result != 'loss')) THEN
                RAISE EXCEPTION 'Result does not match the penalty shootout scores';
            END IF;
        ELSIF p_s1_result != 'draw' OR p_s2_result != 'draw' THEN
            RAISE EXCEPTION 'A level match without penalties must be a draw';
        END IF;
    ELSIF (p_s1_score > p_s2_score AND (p_s1_result != 'win' OR p_s2_result != 'loss'))
       OR (p_s2_score > p_s1_score AND (p_s2_result != 'win' OR p_s1_result != 'loss')) THEN
        RAISE EXCEPTION 'Result does not match the score';
    END IF;

    INSERT INTO matches (group_id, season_id, game_version_id, match_type, is_overtime, is_penalties, screenshot_url, notes, created_by)
    VALUES (p_group_id, p_season_id, p_game_version_id, p_match_type, p_is_overtime, p_is_penalties, p_screenshot_url, p_notes, auth.uid())
    RETURNING id INTO v_match_id;

    INSERT INTO match_sides (match_id, side_number, club_version_id, score, penalty_score, result)
    VALUES (v_match_id, 1, p_s1_club_version_id, p_s1_score, p_s1_penalty, p_s1_result)
    RETURNING id INTO v_side1_id;

    INSERT INTO match_sides (match_id, side_number, club_version_id, score, penalty_score, result)
    VALUES (v_match_id, 2, p_s2_club_version_id, p_s2_score, p_s2_penalty, p_s2_result)
    RETURNING id INTO v_side2_id;

    FOR i IN 1..array_length(p_s1_players, 1) LOOP
        INSERT INTO match_players (match_side_id, player_id) VALUES (v_side1_id, p_s1_players[i]);
    END LOOP;

    FOR i IN 1..array_length(p_s2_players, 1) LOOP
        INSERT INTO match_players (match_side_id, player_id) VALUES (v_side2_id, p_s2_players[i]);
    END LOOP;

    RETURN v_match_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION record_match(
    UUID, UUID, UUID, VARCHAR, BOOLEAN, BOOLEAN, TEXT, TEXT,
    UUID, INT, INT, VARCHAR, UUID[],
    UUID, INT, INT, VARCHAR, UUID[]
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION record_match(
    UUID, UUID, UUID, VARCHAR, BOOLEAN, BOOLEAN, TEXT, TEXT,
    UUID, INT, INT, VARCHAR, UUID[],
    UUID, INT, INT, VARCHAR, UUID[]
) TO authenticated;
