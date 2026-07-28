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
-- Those are denormalized, order-dependent values not yet surfaced
-- anywhere in the UI -- reversing and reapplying a historical Elo delta
-- correctly would require replaying every match recorded after this one,
-- which is out of scope here. All other statistics (win rate, goals,
-- streaks, leaderboards, records, achievements, analytics, trends) are
-- recalculated from match history on every fetch and need no special
-- handling from this function.
--
-- Like record_match_and_apply_elo, validation of player counts/uniqueness/
-- scores is the client's job (src/lib/validation/matchForm.ts) -- this
-- function trusts its caller and relies on the same CHECK constraints
-- already on matches/match_sides.

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

    IF array_length(p_s1_players, 1) IS NULL OR array_length(p_s2_players, 1) IS NULL THEN
        RAISE EXCEPTION 'Both sides need at least one player';
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
