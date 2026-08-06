-- FC Rival: self-service account deletion ("Delete Account" in Settings).
-- App Store Guideline 5.1.1(v) requires users be able to initiate deletion
-- of their account from within the app. This is a DIFFERENT operation from
-- delete_group (20260805120000_delete_group.sql): it removes the AUTH
-- IDENTITY (email/password, the auth.users row) itself, not a single
-- group's data.
--
-- Ownership safety: a user who is the sole 'owner' of a group that still
-- has OTHER members cannot be deleted outright -- that would silently
-- orphan the group (nobody left who could ever manage or delete it). The
-- caller must transfer ownership or delete those groups first; this
-- function reports exactly which ones block it, by name, so the client can
-- show a clear, actionable error. A group where the caller is the ONLY
-- member has no one else who could ever use it once the account is gone,
-- so it's deleted outright here (same avatar-cleanup + cascade delete_group
-- already performs, just inlined per-group since Storage cleanup needs
-- each group's id individually).
--
-- What happens to the rest of the caller's data, traced against the actual
-- schema -- only three foreign keys reference auth.users(id) anywhere in
-- any migration (confirmed by grep, not assumed):
--   group_members.user_id           ON DELETE CASCADE  -- membership in every OTHER (multi-member) group vanishes -- expected, their account is gone
--   player_profiles.linked_user_id  ON DELETE SET NULL -- their player profile (name/avatar/stats) stays as shared group history, just unlinked from any login
--   matches.created_by              NO ACTION (would block the delete outright) -- explicitly nulled below before the delete, same "keep the shared record, drop the login link" intent as linked_user_id
--
-- This deliberately does NOT delete player_profiles rows, match history, or
-- statistics belonging to a group the caller doesn't solely own -- that
-- data belongs to the shared group and its other members, not exclusively
-- to this account.

CREATE OR REPLACE FUNCTION delete_own_account() RETURNS VOID AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_blocking_groups TEXT;
    v_solo_group RECORD;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT string_agg(g.name, ', ') INTO v_blocking_groups
    FROM group_members gm
    JOIN groups g ON g.id = gm.group_id
    WHERE gm.user_id = v_uid
      AND gm.role = 'owner'
      AND EXISTS (
        SELECT 1 FROM group_members other
        WHERE other.group_id = gm.group_id AND other.user_id <> v_uid
      );

    IF v_blocking_groups IS NOT NULL THEN
        RAISE EXCEPTION 'Transfer ownership or delete these groups before deleting your account: %', v_blocking_groups
          USING ERRCODE = 'insufficient_privilege';
    END IF;

    FOR v_solo_group IN
        SELECT gm.group_id
        FROM group_members gm
        WHERE gm.user_id = v_uid
          AND gm.role = 'owner'
          AND NOT EXISTS (
            SELECT 1 FROM group_members other
            WHERE other.group_id = gm.group_id AND other.user_id <> v_uid
          )
    LOOP
        DELETE FROM storage.objects
        WHERE bucket_id = 'avatars'
          AND (storage.foldername(name))[1] = v_solo_group.group_id::text;

        DELETE FROM groups WHERE id = v_solo_group.group_id;
    END LOOP;

    -- Must happen before the auth.users delete below -- matches.created_by
    -- has no ON DELETE clause, so that delete would otherwise fail outright
    -- for any user who has ever recorded a match.
    UPDATE matches SET created_by = NULL WHERE created_by = v_uid;

    -- Cascades: group_members (every remaining membership), player_profiles
    -- (unlinked via SET NULL, never deleted).
    DELETE FROM auth.users WHERE id = v_uid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION delete_own_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION delete_own_account() TO authenticated;
