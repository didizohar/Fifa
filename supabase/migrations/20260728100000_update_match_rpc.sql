-- FC Rival: atomic match edit
--
-- Lets a group admin/owner (or the player who originally recorded a match)
-- correct an already-recorded match's date/time, type, players, clubs,
-- score, penalties, and notes as a single atomic transaction. The match's
-- id and created_at are never touched; updated_at is bumped so the app can
-- show an "Edited" indicator. match_sides rows are updated in place
-- (preserving their own ids); match_players rows are replaced since there
-- is no stable identity for "this specific player slot" once the roster on
-- a side can change.
--
-- Deliberately does NOT touch singles_elo/doubles_elo or elo_history.
-- FC Rival's rankings are entirely Win-Rate-based -- Elo is not an active
-- product feature (see 20260728110000_remove_elo_from_match_recording.sql,
-- which also stops record_match from writing these columns going forward).
-- All statistics (win rate, goals, streaks, leaderboards, records,
-- achievements, analytics, trends) are recalculated from match history on
-- every fetch and need no special handling from this function.
--
-- The client (src/lib/validation/matchForm.ts) is still the primary UX for
-- catching bad input early, but unlike record_match_and_apply_elo, this
-- function does NOT simply trust its caller: since editing can rewrite an
-- already-recorded result, it re-checks player counts/uniqueness/overlap
-- and that the declared win/loss/draw result actually matches the score
-- (and penalty scores, when applicable) before writing anything.

CREATE OR REPLACE FUNCTION update_match(
    p_match_id UUID,
    p_group_id UUID,
    p_played_at TIMESTAMPTZ,
    p_match_type VARCHAR,
    p_is_overtime BOOLEAN,
    p_is_penalties BOOLEAN,
    p_notes TEXT,
    p_s1_club_version_id UUID, p_s1_score INT, p_s1_penalty INT, p_s1_result VARCHAR, p_s1_players UUID[],
    p_s2_club_version_id UUID, p_s2_score INT, p_s2_penalty INT, p_s2_result VARCHAR, p_s2_players UUID[]
) RETURNS UUID AS $$
DECLARE
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

    -- Confirms the match belongs to this group and isn't soft-deleted, and
    -- locks the row for the rest of the transaction so a concurrent edit
    -- (or a delete, if one is ever added) can't interleave with this one.
    -- Tying p_match_id to p_group_id here (not just checking membership in
    -- p_group_id in isolation) is what makes cross-group editing
    -- impossible: a caller can't pass a real match_id from a group they
    -- don't belong to, and can't launder it by claiming a group_id they
    -- ARE a member of either, since the row only matches when both are
    -- simultaneously true for the same match.
    PERFORM 1 FROM matches
        WHERE id = p_match_id AND group_id = p_group_id AND deleted_at IS NULL
        FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Match not found' USING ERRCODE = 'no_data_found';
    END IF;

    -- Authorization: group admins/owners may edit any match in their
    -- group; any other member may only edit a match they recorded.
    IF NOT is_group_admin(p_group_id) THEN
        PERFORM 1 FROM matches WHERE id = p_match_id AND created_by = auth.uid();
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Not authorized to edit this match' USING ERRCODE = 'insufficient_privilege';
        END IF;
    END IF;

    -- From here down: server-side backstops for everything the client
    -- (src/lib/validation/matchForm.ts) already validates. The client is
    -- still the primary UX for these errors; this is defense-in-depth so a
    -- buggy or malicious caller can never write inconsistent data.
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

    -- Score/result/penalty consistency -- the client derives result from
    -- score, but this function trusts whatever it's handed unless checked
    -- here, so a tampered request can't record a "win" for the side that
    -- actually lost.
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

    UPDATE matches
    SET played_at = p_played_at,
        match_type = p_match_type,
        is_overtime = p_is_overtime,
        is_penalties = p_is_penalties,
        notes = p_notes,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_match_id;

    SELECT id INTO v_side1_id FROM match_sides WHERE match_id = p_match_id AND side_number = 1;
    SELECT id INTO v_side2_id FROM match_sides WHERE match_id = p_match_id AND side_number = 2;

    -- Belt-and-braces: every match written by record_match_and_apply_elo
    -- always has both sides, but if either lookup ever came back NULL, the
    -- UPDATE ... WHERE id = NULL below and the match_players DELETE/INSERT
    -- calls would silently no-op or insert orphaned rows instead of erroring.
    IF v_side1_id IS NULL OR v_side2_id IS NULL THEN
        RAISE EXCEPTION 'Match % is missing one or both sides -- refusing to edit', p_match_id;
    END IF;

    UPDATE match_sides
    SET club_version_id = p_s1_club_version_id, score = p_s1_score, penalty_score = p_s1_penalty, result = p_s1_result
    WHERE id = v_side1_id;

    UPDATE match_sides
    SET club_version_id = p_s2_club_version_id, score = p_s2_score, penalty_score = p_s2_penalty, result = p_s2_result
    WHERE id = v_side2_id;

    DELETE FROM match_players WHERE match_side_id IN (v_side1_id, v_side2_id);

    FOR i IN 1..array_length(p_s1_players, 1) LOOP
        INSERT INTO match_players (match_side_id, player_id) VALUES (v_side1_id, p_s1_players[i]);
    END LOOP;

    FOR i IN 1..array_length(p_s2_players, 1) LOOP
        INSERT INTO match_players (match_side_id, player_id) VALUES (v_side2_id, p_s2_players[i]);
    END LOOP;

    RETURN p_match_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Defense-in-depth: only authenticated app users may ever call this (the
-- function's own auth.uid() check already enforces this at runtime, but
-- revoking PUBLIC's default EXECUTE grant means an unauthenticated/anon
-- request is rejected by Postgres itself, before this function's body --
-- and therefore this comment's reasoning -- even runs).
REVOKE ALL ON FUNCTION update_match(
    UUID, UUID, TIMESTAMPTZ, VARCHAR, BOOLEAN, BOOLEAN, TEXT,
    UUID, INT, INT, VARCHAR, UUID[],
    UUID, INT, INT, VARCHAR, UUID[]
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION update_match(
    UUID, UUID, TIMESTAMPTZ, VARCHAR, BOOLEAN, BOOLEAN, TEXT,
    UUID, INT, INT, VARCHAR, UUID[],
    UUID, INT, INT, VARCHAR, UUID[]
) TO authenticated;
