-- Couch League: shared, backend-authoritative active Winners Stay sessions.
--
-- Previously a "Winners Stay" session (see src/lib/rotation/session.ts,
-- src/hooks/useWinnersStaySession.ts) existed ONLY in AsyncStorage, keyed
-- per group per DEVICE. Two members of the same group starting/using a
-- session each saw their own, entirely independent copy -- there was no
-- shared backend state at all for this feature. This migration adds one.
--
-- One row per group represents that group's current active session (its
-- id, format, current pairs, waiting queue, pending rotation -- the exact
-- same WinnersStaySession shape the client already builds and persists,
-- stored as JSONB rather than normalized columns). Storing the whole
-- object as JSONB, instead of a schema redesign, is deliberate: every pure
-- function in session.ts (advanceWinnersStaySession, acceptPendingRotation,
-- generateWinnersStayRotation's Case 1-4 branching and random tie-breaks,
-- etc.) already operates on this exact shape and is fully tested --
-- reusing it here means the rotation engine itself needs zero changes,
-- only its persistence layer moves from AsyncStorage to Supabase.
--
-- `version` is an optimistic-concurrency token. A session mutation that
-- doesn't touch `matches` (accept/redraw/undo a rotation, edit the waiting
-- queue) is safe as a plain client-side
-- `UPDATE ... SET session = $x, version = version + 1 WHERE group_id = $g
-- AND version = $expected` -- a single UPDATE statement is already atomic
-- in Postgres, so a stale writer's WHERE clause simply matches zero rows
-- and the client can detect that (rowCount = 0) and refetch. Recording a
-- MATCH is different: it also needs a durable matches/match_sides/
-- match_players insert that must never happen twice for the same round,
-- so that path goes through the dedicated
-- record_match_and_advance_session() RPC below instead, which does the
-- version check, the match insert, and the session write as one atomic
-- transaction with the session row locked (SELECT ... FOR UPDATE) for the
-- duration -- a second, racing submission against the same expected
-- version genuinely cannot succeed, not just "is unlikely to."

CREATE TABLE active_sessions (
    group_id UUID PRIMARY KEY REFERENCES groups(id) ON DELETE CASCADE,
    session JSONB NOT NULL,
    version INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_by UUID REFERENCES auth.users(id)
);

ALTER TABLE active_sessions ENABLE ROW LEVEL SECURITY;

-- Same bar record_match already uses for who may record a match in a group
-- (any member, not owner/admin-only) -- session read/write is gated
-- identically, deliberately not a stricter or looser rule than the
-- existing product behavior it's replacing local-only state for.
CREATE POLICY active_sessions_select ON active_sessions FOR SELECT
    USING (is_group_member(group_id));

CREATE POLICY active_sessions_insert ON active_sessions FOR INSERT
    WITH CHECK (is_group_member(group_id));

CREATE POLICY active_sessions_update ON active_sessions FOR UPDATE
    USING (is_group_member(group_id))
    WITH CHECK (is_group_member(group_id));

-- Ending a session deletes its row (mirrors the exact previous local
-- semantics: AsyncStorage.removeItem on end/reset -- "no row" means "no
-- active session", the same meaning `session === null` already had).
CREATE POLICY active_sessions_delete ON active_sessions FOR DELETE
    USING (is_group_member(group_id));

REVOKE ALL ON active_sessions FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON active_sessions TO authenticated;

-- ---------------------------------------------------------------------
-- Atomic "record a match against this session, then advance it" RPC.
--
-- p_next_session is the FULL new session state the client already computed
-- locally (via the existing, unchanged advanceSessionAfterMatch /
-- acceptPendingRotation pure functions), with lastRecordedMatchId left as
-- whatever placeholder the client had (it doesn't know the real match id
-- yet -- this function fills in the real one via jsonb_set after the
-- insert, inside the same transaction, so the client never needs to
-- generate its own match UUID).
--
-- p_expected_version is the version the client last read active_sessions
-- for this group at. SELECT ... FOR UPDATE locks that row for the rest of
-- this transaction, so two concurrent calls against the same stale version
-- are fully serialized by Postgres itself: whichever commits first wins
-- (its match is inserted, version increments); the second one's row lock
-- wait ends only after the first commits, at which point its own
-- `v_current_version != p_expected_version` check now correctly fails
-- against the ALREADY-incremented version, and the whole transaction --
-- including the match insert -- rolls back. This is what makes "insert the
-- match" and "advance the session" fail together, not as two separate
-- unprotected steps.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION record_match_and_advance_session(
    p_group_id UUID,
    p_season_id UUID,
    p_game_version_id UUID,
    p_match_type VARCHAR,
    p_is_overtime BOOLEAN,
    p_is_penalties BOOLEAN,
    p_screenshot_url TEXT,
    p_notes TEXT,
    p_s1_club_version_id UUID, p_s1_score INT, p_s1_penalty INT, p_s1_result VARCHAR, p_s1_players UUID[],
    p_s2_club_version_id UUID, p_s2_score INT, p_s2_penalty INT, p_s2_result VARCHAR, p_s2_players UUID[],
    p_expected_version INT,
    p_next_session JSONB
) RETURNS TABLE(match_id UUID, new_version INT) AS $$
DECLARE
    v_match_id UUID;
    v_side1_id UUID;
    v_side2_id UUID;
    v_required_players INT;
    v_current_version INT;
    v_final_session JSONB;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF NOT is_group_member(p_group_id) THEN
        RAISE EXCEPTION 'Not a member of this group' USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- Same backstops record_match already applies (see
    -- 20260731120000_database_linter_fixes.sql) -- deliberately duplicated
    -- rather than calling record_match from here, since PL/pgSQL can't
    -- easily reuse another SECURITY DEFINER function's internal work
    -- without a second, separately-authorized call, and this function
    -- needs the match insert inside its OWN transaction/row lock anyway.
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

    -- Lock the session row for the rest of this transaction -- see the
    -- function-level comment for why this is what makes the concurrency
    -- guarantee real rather than best-effort.
    SELECT version INTO v_current_version
    FROM active_sessions
    WHERE group_id = p_group_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No active session for this group' USING ERRCODE = 'P0002';
    END IF;

    IF v_current_version != p_expected_version THEN
        RAISE EXCEPTION 'This match was already completed by another player. The session has moved to the next match.' USING ERRCODE = 'P0001';
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

    v_final_session := jsonb_set(p_next_session, '{lastRecordedMatchId}', to_jsonb(v_match_id::text));

    UPDATE active_sessions
    SET session = v_final_session, version = version + 1, updated_at = CURRENT_TIMESTAMP, updated_by = auth.uid()
    WHERE group_id = p_group_id;

    RETURN QUERY SELECT v_match_id, v_current_version + 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION record_match_and_advance_session(
    UUID, UUID, UUID, VARCHAR, BOOLEAN, BOOLEAN, TEXT, TEXT,
    UUID, INT, INT, VARCHAR, UUID[],
    UUID, INT, INT, VARCHAR, UUID[],
    INT, JSONB
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION record_match_and_advance_session(
    UUID, UUID, UUID, VARCHAR, BOOLEAN, BOOLEAN, TEXT, TEXT,
    UUID, INT, INT, VARCHAR, UUID[],
    UUID, INT, INT, VARCHAR, UUID[],
    INT, JSONB
) TO authenticated;
