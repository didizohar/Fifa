-- FC Rival: permanent group deletion ("Delete League" in League Management /
-- Settings). Owner/admin only, requires typing the exact group name as a
-- server-side-verified confirmation (not just a client-side gate), and
-- performs a genuine hard delete rather than the soft-delete the original
-- schema comments anticipated ("No DELETE policy: removal is a soft delete
-- via the UPDATE policy above" on groups_update, 20260715120300_rls_policies.sql).
--
-- Soft-delete was deliberately rejected here: fetchMyGroups() and every
-- other group-scoped query in the app read groups.deleted_at exactly
-- nowhere today, so flipping that flag would leave the group fully visible
-- everywhere until every query in the app were individually audited to
-- respect it -- the same class of risk 20260730090000_league_season_management.sql
-- explicitly called out and avoided for match deletion. A hard delete lets
-- the existing ON DELETE CASCADE chain do the (already-correct) work
-- instead of inventing a second, easy-to-miss deletion convention.
--
-- Full cascade, traced against the actual schema, not assumed:
--   groups
--     -> seasons              (group_id CASCADE)
--     -> group_members        (group_id CASCADE) -- every member, not just the caller
--     -> player_profiles      (group_id CASCADE)
--       -> elo_history        (player_id CASCADE)
--       -> match_players      (player_id RESTRICT -- safe: see below)
--     -> matches               (group_id CASCADE)
--       -> match_sides        (match_id CASCADE)
--         -> match_players    (match_side_id CASCADE)
--       -> elo_history        (match_id CASCADE)
--     -> clubs (custom only; group_id IS NULL built-ins are untouched)  (group_id CASCADE)
--       -> club_versions (custom only)                                  (club_id CASCADE)
--
-- match_players.player_id is ON DELETE RESTRICT, which would normally block
-- deleting a player who's played matches -- it's safe here because those
-- same match_players rows are ALSO being cascade-removed (via
-- matches -> match_sides -> match_players) within this same statement;
-- Postgres checks referential integrity against the final state of the
-- whole statement, not row-by-row.
--
-- NOT covered by any foreign key at all, and handled explicitly below:
-- avatar image files in the `avatars` storage bucket (path
-- {group_id}/{player_id}/{filename}). Storage objects aren't governed by
-- table foreign keys -- without this, they'd silently remain accessible
-- forever in a public bucket after every row referencing them is gone.

CREATE OR REPLACE FUNCTION delete_group(p_group_id UUID, p_confirm_name TEXT) RETURNS VOID AS $$
DECLARE
    v_actual_name TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF NOT is_group_admin(p_group_id) THEN
        RAISE EXCEPTION 'Not authorized to delete this group' USING ERRCODE = 'insufficient_privilege';
    END IF;

    SELECT name INTO v_actual_name FROM groups WHERE id = p_group_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Group not found' USING ERRCODE = 'no_data_found';
    END IF;

    IF trim(p_confirm_name) <> trim(v_actual_name) THEN
        RAISE EXCEPTION 'Group name does not match' USING ERRCODE = 'invalid_parameter_value';
    END IF;

    DELETE FROM storage.objects
    WHERE bucket_id = 'avatars'
      AND (storage.foldername(name))[1] = p_group_id::text;

    -- Cascades everything in the dependency tree documented above.
    DELETE FROM groups WHERE id = p_group_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION delete_group(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION delete_group(UUID, TEXT) TO authenticated;
