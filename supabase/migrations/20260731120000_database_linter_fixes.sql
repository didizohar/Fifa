-- FC Rival: database linter fixes (security + performance)
--
-- Every change here is either (a) a pure hardening/no-op for real callers,
-- or (b) an additive index. Nothing here changes what any currently-working
-- client call returns, and no RLS policy becomes more permissive.
--
-- Skipped on purpose, with reasoning:
--   - is_group_member() / is_group_admin() PUBLIC execute grants are left
--     alone. Revoking PUBLIC here (unlike the plain top-level RPCs below)
--     risks turning an RLS policy evaluation for the `anon` role into a hard
--     permission-denied error instead of the current silent empty-result-set
--     behavior on any table whose policy calls them -- a real behavior
--     change this migration is not willing to risk without live testing.
--   - player_profiles.linked_user_id has no covering index added: grepping
--     the client, nothing currently filters on it (`WHERE linked_user_id =
--     ...`), so there is no real query to speed up yet.
--   - extension_in_public could not be checked from migration files alone
--     (Supabase provisions some default extensions outside of any
--     migration) -- verify this one directly in Dashboard > Advisors.

-- ---------------------------------------------------------------------
-- 1. SECURITY: record_match_and_apply_elo never checked group membership,
-- only that *some* user was authenticated (this was already known and
-- documented in 20260728110000_remove_elo_from_match_recording.sql, which
-- introduced record_match specifically to fix it going forward). The app
-- has not called this function since that migration -- confirmed via
-- `grep -rn "record_match_and_apply_elo" src app`, which only matches
-- comments -- but it is still live, still SECURITY DEFINER, and still
-- reachable by ANY authenticated user directly through the RPC API
-- (Supabase does not know the frontend stopped calling it). Without this
-- check, any authenticated user could pass an arbitrary p_group_id
-- belonging to a group they are not a member of and write a fabricated
-- match, plus mutate the Elo ratings of players in that group. Adding the
-- same is_group_member() check record_match already has closes this with
-- zero effect on any real caller, since there are none today.
--
-- Also removes the `i INT;` DECLARE: plpgsql's `FOR i IN ...` loop syntax
-- auto-declares its own loop-scoped `i`, which shadows this explicit one --
-- confirmed dead/unused via `supabase db lint --linked`. Purely cosmetic;
-- the auto-declared loop variable is what was actually being used all along.
CREATE OR REPLACE FUNCTION record_match_and_apply_elo(
    p_group_id UUID,
    p_season_id UUID,
    p_game_version_id UUID,
    p_match_type VARCHAR,
    p_is_overtime BOOLEAN,
    p_is_penalties BOOLEAN,
    p_screenshot_url TEXT,
    p_notes TEXT,
    p_elo_field VARCHAR,
    p_s1_club_version_id UUID, p_s1_score INT, p_s1_penalty INT, p_s1_result VARCHAR,
    p_s1_players UUID[], p_s1_ratings_before INT[], p_s1_rating_after INT,
    p_s2_club_version_id UUID, p_s2_score INT, p_s2_penalty INT, p_s2_result VARCHAR,
    p_s2_players UUID[], p_s2_ratings_before INT[], p_s2_rating_after INT
) RETURNS UUID AS $$
DECLARE
    v_match_id UUID;
    v_side1_id UUID;
    v_side2_id UUID;
    v_player_id UUID;
BEGIN
    IF array_length(p_s1_players, 1) IS DISTINCT FROM array_length(p_s1_ratings_before, 1)
       OR array_length(p_s2_players, 1) IS DISTINCT FROM array_length(p_s2_ratings_before, 1) THEN
        RAISE EXCEPTION 'players and ratings_before arrays must be the same length per side';
    END IF;

    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF NOT is_group_member(p_group_id) THEN
        RAISE EXCEPTION 'Not a member of this group' USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF p_elo_field NOT IN ('singles_elo', 'doubles_elo') THEN
        RAISE EXCEPTION 'Invalid elo_field: %', p_elo_field;
    END IF;

    PERFORM set_config('app.elo_write_allowed', 'true', true);

    INSERT INTO matches (
        group_id, season_id, game_version_id, match_type,
        is_overtime, is_penalties, screenshot_url, notes, created_by
    )
    VALUES (
        p_group_id, p_season_id, p_game_version_id, p_match_type,
        p_is_overtime, p_is_penalties, p_screenshot_url, p_notes, auth.uid()
    )
    RETURNING id INTO v_match_id;

    INSERT INTO match_sides (match_id, side_number, club_version_id, score, penalty_score, result)
    VALUES (v_match_id, 1, p_s1_club_version_id, p_s1_score, p_s1_penalty, p_s1_result)
    RETURNING id INTO v_side1_id;

    INSERT INTO match_sides (match_id, side_number, club_version_id, score, penalty_score, result)
    VALUES (v_match_id, 2, p_s2_club_version_id, p_s2_score, p_s2_penalty, p_s2_result)
    RETURNING id INTO v_side2_id;

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

-- Defense-in-depth, matching the pattern update_match/record_match/
-- start_new_season/delete_season already use: revoking PUBLIC's default
-- EXECUTE grant means an anon/unauthenticated request is rejected by
-- Postgres itself, before the function body (and therefore the
-- is_group_member() check above) even runs.
REVOKE ALL ON FUNCTION record_match_and_apply_elo(
    UUID, UUID, UUID, VARCHAR, BOOLEAN, BOOLEAN, TEXT, TEXT, VARCHAR,
    UUID, INT, INT, VARCHAR, UUID[], INT[], INT,
    UUID, INT, INT, VARCHAR, UUID[], INT[], INT
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION record_match_and_apply_elo(
    UUID, UUID, UUID, VARCHAR, BOOLEAN, BOOLEAN, TEXT, TEXT, VARCHAR,
    UUID, INT, INT, VARCHAR, UUID[], INT[], INT,
    UUID, INT, INT, VARCHAR, UUID[], INT[], INT
) TO authenticated;

-- Same defense-in-depth for create_group / join_group_by_invite_code: both
-- already reject anon callers internally via `auth.uid() IS NULL`, so this
-- changes nothing for any real caller -- it just makes Postgres itself
-- reject the attempt one layer earlier, consistent with every RPC added
-- after 20260715120100_group_rpcs.sql.
REVOKE ALL ON FUNCTION create_group(VARCHAR, VARCHAR, UUID, VARCHAR) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_group(VARCHAR, VARCHAR, UUID, VARCHAR) TO authenticated;

REVOKE ALL ON FUNCTION join_group_by_invite_code(VARCHAR) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION join_group_by_invite_code(VARCHAR) TO authenticated;

-- ---------------------------------------------------------------------
-- 2. Cosmetic-only: same dead/shadowed-variable cleanup as above, for the
-- two other functions `supabase db lint --linked` flagged. Both already
-- have correct authorization checks -- only the redundant `i INT;`
-- DECLARE is removed, nothing else changes.
-- ---------------------------------------------------------------------
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
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF NOT is_group_member(p_group_id) THEN
        RAISE EXCEPTION 'Not a member of this group' USING ERRCODE = 'insufficient_privilege';
    END IF;

    PERFORM 1 FROM matches
        WHERE id = p_match_id AND group_id = p_group_id AND deleted_at IS NULL
        FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Match not found' USING ERRCODE = 'no_data_found';
    END IF;

    IF NOT is_group_admin(p_group_id) THEN
        PERFORM 1 FROM matches WHERE id = p_match_id AND created_by = auth.uid();
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Not authorized to edit this match' USING ERRCODE = 'insufficient_privilege';
        END IF;
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

-- ---------------------------------------------------------------------
-- 3. Hardening: fix search_path (function_search_path_mutable). Neither
-- function is SECURITY DEFINER, so this is not closing a privilege
-- escalation path -- it's the general Postgres/Supabase best practice of
-- never leaving a function's name resolution dependent on the caller's
-- session search_path. For normalize_club_name specifically, it also
-- guarantees the two unique indexes built on it always evaluate the same
-- way regardless of caller session settings (lower/regexp_replace/trim are
-- pg_catalog builtins either way, so behavior is unchanged).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION protect_elo_columns() RETURNS TRIGGER AS $$
BEGIN
    IF (NEW.singles_elo IS DISTINCT FROM OLD.singles_elo
        OR NEW.doubles_elo IS DISTINCT FROM OLD.doubles_elo)
       AND current_setting('app.elo_write_allowed', true) IS DISTINCT FROM 'true' THEN
        RAISE EXCEPTION 'singles_elo/doubles_elo can only be changed via record_match_and_apply_elo';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE OR REPLACE FUNCTION normalize_club_name(p_name TEXT) RETURNS TEXT AS $$
    SELECT lower(regexp_replace(trim(p_name), '\s+', ' ', 'g'));
$$ LANGUAGE sql IMMUTABLE SET search_path = public;

-- ---------------------------------------------------------------------
-- 4. Performance: auth_rls_initplan. Wraps direct auth.uid() comparisons
-- in (select auth.uid()) so Postgres evaluates it once per query (an
-- "InitPlan") instead of once per row scanned -- auth.uid() is constant
-- for the whole query/session, so this returns the exact same value, just
-- faster on large scans. Only the two policies with a *direct* column =
-- auth.uid() comparison are touched; every other policy in this schema
-- goes through is_group_member()/is_group_admin(), which are inherently
-- row-dependent via their group_id argument and would not benefit from
-- this rewrite.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS group_members_delete ON group_members;
CREATE POLICY group_members_delete ON group_members FOR DELETE
    USING (is_group_admin(group_id) OR user_id = (select auth.uid()));

DROP POLICY IF EXISTS player_profiles_update ON player_profiles;
CREATE POLICY player_profiles_update ON player_profiles FOR UPDATE
    USING (is_group_admin(group_id) OR linked_user_id = (select auth.uid()))
    WITH CHECK (is_group_admin(group_id) OR linked_user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- 5. Performance: unindexed_foreign_keys, only where a real query pattern
-- was confirmed against the current client code.
-- ---------------------------------------------------------------------

-- useSeasons() runs `.from("seasons").select("*").eq("group_id", groupId)`
-- (src/lib/seasons.ts) to list every season for a group, including
-- archived ones (shown in League Management's "Archived Leagues" list).
-- idx_seasons_one_active_per_group is a partial index that only covers
-- is_active = true rows and cannot serve this broader lookup.
CREATE INDEX IF NOT EXISTS idx_seasons_group ON seasons(group_id);

-- countMatchesForSeason() runs `.from("matches")...eq("season_id",
-- seasonId)` before every archive/delete confirmation, and delete_season's
-- `UPDATE matches SET season_id = NULL WHERE season_id = p_season_id` has
-- no covering index today -- both do a full scan of matches without this.
CREATE INDEX IF NOT EXISTS idx_matches_season ON matches(season_id) WHERE season_id IS NOT NULL;
