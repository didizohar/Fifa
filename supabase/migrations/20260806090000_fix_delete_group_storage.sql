-- FC Rival: fix delete_group's avatar cleanup.
--
-- The original delete_group (20260805120000_delete_group.sql) tried to
-- remove avatar files with a direct `DELETE FROM storage.objects`. Supabase
-- blocks raw SQL DML against storage.objects (confirmed live: it raises
-- "Direct deletion from storage tables is not allowed. Use the Storage API
-- instead.") -- and even if it didn't, deleting only the metadata row would
-- leave the actual file behind in the underlying object store, since that's
-- not driven by this table at all. Deleting a group's avatars now has to
-- happen client-side through supabase.storage.from("avatars").remove(...)
-- (see clearGroupAvatars in src/lib/groups.ts), not in this function.
--
-- Because this line raised on every group that had at least one avatar
-- uploaded, and it ran inside the same transaction as the actual group
-- deletion, EVERY such delete_group call rolled back entirely -- the group,
-- its players, matches, everything stayed fully intact. This was a
-- confirmed, silent full-transaction failure, not just an orphaned-file
-- leak.
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

    -- Cascades everything in the dependency tree documented in
    -- 20260805120000_delete_group.sql. Avatar storage cleanup happens
    -- client-side, after this succeeds -- see useDeleteGroup.ts.
    DELETE FROM groups WHERE id = p_group_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION delete_group(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION delete_group(UUID, TEXT) TO authenticated;
