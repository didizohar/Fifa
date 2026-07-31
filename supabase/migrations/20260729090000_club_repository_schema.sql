-- FC Rival: club repository schema -- league/colors/logo metadata, and a
-- real path for group-scoped custom clubs (previously clubs/club_versions
-- were service-role/migration-only, with no way for a user to create one).
--
-- group_id on clubs distinguishes built-in clubs (group_id IS NULL, shared
-- across every group, still service-role-only to write) from custom clubs
-- (group_id set, owned by that group, writable by its members). This is
-- purely additive: every existing club/club_version row, and every match
-- that references one, is untouched.

ALTER TABLE clubs
    ADD COLUMN league VARCHAR(60),
    ADD COLUMN primary_color VARCHAR(7),
    ADD COLUMN secondary_color VARCHAR(7),
    ADD COLUMN logo_url TEXT,
    ADD COLUMN group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
    ADD COLUMN notes TEXT;

-- Duplicate detection needs to ignore case, leading/trailing spaces, and
-- repeated internal spaces ("Real Madrid" == "real madrid" == "  REAL
-- MADRID"). IMMUTABLE so it can back an index.
CREATE OR REPLACE FUNCTION normalize_club_name(p_name TEXT) RETURNS TEXT AS $$
    SELECT lower(regexp_replace(trim(p_name), '\s+', ' ', 'g'));
$$ LANGUAGE sql IMMUTABLE;

-- The original bare UNIQUE(name) predates group_id and would incorrectly
-- forbid two different groups from both naming a custom club the same
-- thing. Replaced with two correctly-scoped, normalization-aware indexes
-- below: built-in names unique across the whole app, custom names unique
-- per group.
ALTER TABLE clubs DROP CONSTRAINT IF EXISTS clubs_name_key;

CREATE UNIQUE INDEX idx_clubs_builtin_unique_name ON clubs (normalize_club_name(name))
    WHERE group_id IS NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX idx_clubs_custom_unique_name ON clubs (group_id, normalize_club_name(name))
    WHERE group_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX idx_clubs_league ON clubs (league) WHERE deleted_at IS NULL;
CREATE INDEX idx_clubs_group ON clubs (group_id) WHERE group_id IS NOT NULL AND deleted_at IS NULL;

-- ---------------------------------------------------------------------
-- RLS: built-in clubs (group_id IS NULL) remain service-role-only to
-- write, and visible to every authenticated user, exactly as before.
-- Custom clubs (group_id IS NOT NULL) are writable and visible only to
-- members of the owning group.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS clubs_select ON clubs;
CREATE POLICY clubs_select ON clubs FOR SELECT
    USING (group_id IS NULL OR is_group_member(group_id));

CREATE POLICY clubs_insert_custom ON clubs FOR INSERT
    WITH CHECK (group_id IS NOT NULL AND is_group_member(group_id));

CREATE POLICY clubs_update_custom ON clubs FOR UPDATE
    USING (group_id IS NOT NULL AND is_group_member(group_id))
    WITH CHECK (group_id IS NOT NULL AND is_group_member(group_id));
-- No DELETE policy: a custom club is soft-deleted (deleted_at) via the
-- UPDATE policy above, same convention as player_profiles.

DROP POLICY IF EXISTS club_versions_select ON club_versions;
CREATE POLICY club_versions_select ON club_versions FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM clubs c WHERE c.id = club_versions.club_id AND (c.group_id IS NULL OR is_group_member(c.group_id))
    ));

CREATE POLICY club_versions_insert_custom ON club_versions FOR INSERT
    WITH CHECK (EXISTS (
        SELECT 1 FROM clubs c WHERE c.id = club_versions.club_id AND c.group_id IS NOT NULL AND is_group_member(c.group_id)
    ));

CREATE POLICY club_versions_update_custom ON club_versions FOR UPDATE
    USING (EXISTS (
        SELECT 1 FROM clubs c WHERE c.id = club_versions.club_id AND c.group_id IS NOT NULL AND is_group_member(c.group_id)
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM clubs c WHERE c.id = club_versions.club_id AND c.group_id IS NOT NULL AND is_group_member(c.group_id)
    ));
