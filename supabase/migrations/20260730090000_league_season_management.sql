-- FC Rival: competition league/season management
--
-- The `seasons` table (group-scoped competition leagues/seasons, distinct
-- from Club.league, a built-in classification like "Premier League") and
-- its RLS have existed since the initial schema, and matches.season_id
-- already references it -- this feature's data model was never missing,
-- it was simply never exposed by any UI or RPC. This migration adds the
-- only two things actually missing: a guarantee that a group has at most
-- one active season at a time, and the two admin-only lifecycle actions
-- ("Start New Season" / "Reset League", and "Delete League") the app now
-- exposes in League Management.
--
-- Deliberately NOT implemented here: hard/soft-deleting the matches inside
-- a deleted season. matches.deleted_at exists on the table but is not
-- filtered by any existing match-history/analytics query today (it has
-- never been set by anything) -- wiring in a destructive match-delete path
-- would require auditing and changing every match-reading query in the
-- app to respect it, which is exactly the kind of change that could
-- silently break match history/analytics if any read path were missed.
-- Given that risk, "Delete League" here only ever unassigns matches
-- (season_id -> NULL) and never removes match data -- see delete_season
-- below and the League Management screen copy, which is explicit that
-- matches are always preserved.

-- Defensive cleanup (belt-and-braces -- the seasons table has never had
-- app-driven writes before this migration, so this should be a no-op):
-- if any group somehow already has more than one active season, keep only
-- the most recently started one active.
UPDATE seasons s
SET is_active = false, end_date = COALESCE(end_date, CURRENT_TIMESTAMP)
WHERE is_active = true
  AND id NOT IN (
    SELECT DISTINCT ON (group_id) id
    FROM seasons
    WHERE is_active = true
    ORDER BY group_id, start_date DESC
  );

CREATE UNIQUE INDEX idx_seasons_one_active_per_group ON seasons (group_id) WHERE is_active = true;

-- ---------------------------------------------------------------------
-- start_new_season: ends the group's current active season (if any) and
-- starts a new one, atomically. This is "Reset League" / "Reset Standings"
-- too -- since standings are always computed live from match history
-- filtered by date, starting a new season IS the reset; no separate,
-- weaker "just reset standings" action is needed or offered.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION start_new_season(p_group_id UUID, p_name VARCHAR) RETURNS UUID AS $$
DECLARE
    v_new_season_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF NOT is_group_admin(p_group_id) THEN
        RAISE EXCEPTION 'Not authorized to manage this league' USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF trim(p_name) = '' THEN
        RAISE EXCEPTION 'Season name is required';
    END IF;

    UPDATE seasons
    SET is_active = false, end_date = CURRENT_TIMESTAMP
    WHERE group_id = p_group_id AND is_active = true;

    INSERT INTO seasons (group_id, name, is_active, start_date)
    VALUES (p_group_id, trim(p_name), true, CURRENT_TIMESTAMP)
    RETURNING id INTO v_new_season_id;

    RETURN v_new_season_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION start_new_season(UUID, VARCHAR) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION start_new_season(UUID, VARCHAR) TO authenticated;

-- ---------------------------------------------------------------------
-- delete_season: removes a user-created season/league record. Matches
-- that were tagged with this season are only ever unassigned
-- (season_id -> NULL) -- general match history, analytics, and league
-- table totals are entirely unaffected, since they never depend on
-- season_id being set. Nothing about a match's players, clubs, score, or
-- result is touched.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION delete_season(p_season_id UUID, p_group_id UUID) RETURNS VOID AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF NOT is_group_admin(p_group_id) THEN
        RAISE EXCEPTION 'Not authorized to manage this league' USING ERRCODE = 'insufficient_privilege';
    END IF;

    PERFORM 1 FROM seasons WHERE id = p_season_id AND group_id = p_group_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Season not found' USING ERRCODE = 'no_data_found';
    END IF;

    UPDATE matches SET season_id = NULL WHERE season_id = p_season_id;
    DELETE FROM seasons WHERE id = p_season_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION delete_season(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION delete_season(UUID, UUID) TO authenticated;
