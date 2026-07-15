-- FC Rival: group creation / join RPCs
--
-- RLS on group_members requires an existing membership row to authorize
-- inserting a new one, which makes it impossible to add a group's very
-- first member (the owner) through a plain client-side INSERT. These two
-- SECURITY DEFINER functions are the only sanctioned way to create a group
-- or join one, and both are single, atomic transactions.

CREATE OR REPLACE FUNCTION create_group(
    p_name VARCHAR,
    p_invite_code VARCHAR,
    p_default_game_version_id UUID DEFAULT NULL,
    p_timezone VARCHAR DEFAULT 'Asia/Jerusalem'
) RETURNS UUID AS $$
DECLARE
    v_group_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    INSERT INTO groups (name, invite_code, default_game_version_id, timezone)
    VALUES (p_name, p_invite_code, p_default_game_version_id, p_timezone)
    RETURNING id INTO v_group_id;

    INSERT INTO group_members (group_id, user_id, role)
    VALUES (v_group_id, auth.uid(), 'owner');

    RETURN v_group_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION join_group_by_invite_code(
    p_invite_code VARCHAR
) RETURNS UUID AS $$
DECLARE
    v_group_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT id INTO v_group_id
    FROM groups
    WHERE invite_code = p_invite_code AND deleted_at IS NULL;

    IF v_group_id IS NULL THEN
        RAISE EXCEPTION 'Invalid invite code';
    END IF;

    INSERT INTO group_members (group_id, user_id, role)
    VALUES (v_group_id, auth.uid(), 'member')
    ON CONFLICT ON CONSTRAINT unique_group_user DO NOTHING;

    RETURN v_group_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
