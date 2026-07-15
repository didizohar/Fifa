-- FC Rival: Row Level Security
--
-- All match-authoritative tables (matches, match_sides, match_players,
-- elo_history) have NO client-facing INSERT/UPDATE policies: the only way
-- to write them is through record_match_and_apply_elo, which is
-- SECURITY DEFINER and therefore bypasses RLS entirely. This is
-- deliberate defense-in-depth for the atomicity guarantee -- a client
-- cannot partially write a match even by accident.

-- ---------------------------------------------------------------------
-- Helpers (SECURITY DEFINER so they can read group_members without
-- triggering recursive RLS evaluation on group_members itself)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION is_group_member(p_group_id UUID) RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = p_group_id AND user_id = auth.uid()
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION is_group_admin(p_group_id UUID) RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = p_group_id AND user_id = auth.uid() AND role IN ('owner', 'admin')
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- ---------------------------------------------------------------------
-- Column-level guard for player_profiles.singles_elo / doubles_elo
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
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_protect_elo_columns
BEFORE UPDATE ON player_profiles
FOR EACH ROW EXECUTE FUNCTION protect_elo_columns();

-- ---------------------------------------------------------------------
-- game_versions / clubs / club_versions: shared reference data.
-- Readable by any authenticated user, writable only by service_role.
-- ---------------------------------------------------------------------
ALTER TABLE game_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY game_versions_select ON game_versions FOR SELECT
    USING (auth.role() = 'authenticated');

ALTER TABLE clubs ENABLE ROW LEVEL SECURITY;
CREATE POLICY clubs_select ON clubs FOR SELECT
    USING (auth.role() = 'authenticated');

ALTER TABLE club_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY club_versions_select ON club_versions FOR SELECT
    USING (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------
-- groups
-- ---------------------------------------------------------------------
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY groups_select ON groups FOR SELECT
    USING (is_group_member(id));

CREATE POLICY groups_update ON groups FOR UPDATE
    USING (is_group_admin(id))
    WITH CHECK (is_group_admin(id));
-- No INSERT policy: creation goes through create_group().
-- No DELETE policy: removal is a soft delete via the UPDATE policy above.

-- ---------------------------------------------------------------------
-- seasons
-- ---------------------------------------------------------------------
ALTER TABLE seasons ENABLE ROW LEVEL SECURITY;

CREATE POLICY seasons_select ON seasons FOR SELECT
    USING (is_group_member(group_id));

CREATE POLICY seasons_insert ON seasons FOR INSERT
    WITH CHECK (is_group_admin(group_id));

CREATE POLICY seasons_update ON seasons FOR UPDATE
    USING (is_group_admin(group_id))
    WITH CHECK (is_group_admin(group_id));

CREATE POLICY seasons_delete ON seasons FOR DELETE
    USING (is_group_admin(group_id));

-- ---------------------------------------------------------------------
-- group_members
-- ---------------------------------------------------------------------
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY group_members_select ON group_members FOR SELECT
    USING (is_group_member(group_id));

CREATE POLICY group_members_update ON group_members FOR UPDATE
    USING (is_group_admin(group_id))
    WITH CHECK (is_group_admin(group_id));

CREATE POLICY group_members_delete ON group_members FOR DELETE
    USING (is_group_admin(group_id) OR user_id = auth.uid());
-- No INSERT policy: membership is only granted via create_group() /
-- join_group_by_invite_code().

-- ---------------------------------------------------------------------
-- player_profiles
-- ---------------------------------------------------------------------
ALTER TABLE player_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY player_profiles_select ON player_profiles FOR SELECT
    USING (is_group_member(group_id));

CREATE POLICY player_profiles_insert ON player_profiles FOR INSERT
    WITH CHECK (is_group_member(group_id));

CREATE POLICY player_profiles_update ON player_profiles FOR UPDATE
    USING (is_group_admin(group_id) OR linked_user_id = auth.uid())
    WITH CHECK (is_group_admin(group_id) OR linked_user_id = auth.uid());
-- No DELETE policy: removal is a soft delete (deleted_at) via the UPDATE
-- policy above. singles_elo/doubles_elo are additionally protected by
-- trg_protect_elo_columns regardless of this policy.

-- ---------------------------------------------------------------------
-- matches / match_sides / match_players / elo_history
-- All writes go through record_match_and_apply_elo (SECURITY DEFINER).
-- Only SELECT policies are defined here.
-- ---------------------------------------------------------------------
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY matches_select ON matches FOR SELECT
    USING (is_group_member(group_id));

ALTER TABLE match_sides ENABLE ROW LEVEL SECURITY;
CREATE POLICY match_sides_select ON match_sides FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM matches m
        WHERE m.id = match_sides.match_id AND is_group_member(m.group_id)
    ));

ALTER TABLE match_players ENABLE ROW LEVEL SECURITY;
CREATE POLICY match_players_select ON match_players FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM match_sides ms
        JOIN matches m ON m.id = ms.match_id
        WHERE ms.id = match_players.match_side_id AND is_group_member(m.group_id)
    ));

ALTER TABLE elo_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY elo_history_select ON elo_history FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM matches m
        WHERE m.id = elo_history.match_id AND is_group_member(m.group_id)
    ));
