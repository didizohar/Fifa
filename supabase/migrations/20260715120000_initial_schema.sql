-- FC Rival: initial schema
-- UUIDs use gen_random_uuid(), built into Postgres core since v13 -- no
-- extension needed (uuid-ossp requires a schema-qualified call on Supabase
-- hosted projects since it's installed outside the default search_path).

-- 1. GAME VERSIONS & SEASONS
CREATE TABLE game_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL UNIQUE, -- e.g. 'EA Sports FC 26'
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2. GROUPS
CREATE TABLE groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    logo_url TEXT,
    invite_code VARCHAR(20) UNIQUE NOT NULL,
    default_game_version_id UUID REFERENCES game_versions(id) ON DELETE SET NULL,
    timezone VARCHAR(50) DEFAULT 'Asia/Jerusalem',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ DEFAULT NULL
);

CREATE TABLE seasons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL, -- e.g. 'Season 1', 'Summer 2026'
    is_active BOOLEAN DEFAULT TRUE,
    start_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    end_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 3. GROUP MEMBERS (Auth vs Group Mapping)
CREATE TABLE group_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_group_user UNIQUE (group_id, user_id)
);

-- 4. CLUBS & MASTER VERSIONS
-- (created before player_profiles so preferred_club_id can reference it)
CREATE TABLE clubs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    country VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ DEFAULT NULL
);

CREATE TABLE club_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id UUID REFERENCES clubs(id) ON DELETE CASCADE,
    game_version_id UUID REFERENCES game_versions(id) ON DELETE CASCADE,
    star_rating NUMERIC(2,1) CHECK (star_rating >= 0.5 AND star_rating <= 5.0),
    attack_rating INT CHECK (attack_rating BETWEEN 1 AND 99),
    midfield_rating INT CHECK (midfield_rating BETWEEN 1 AND 99),
    defense_rating INT CHECK (defense_rating BETWEEN 1 AND 99),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_club_version UNIQUE (club_id, game_version_id)
);

-- 5. PLAYER PROFILES
CREATE TABLE player_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
    linked_user_id UUID DEFAULT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    display_name VARCHAR(50) NOT NULL,
    nickname VARCHAR(50),
    avatar_url TEXT,
    custom_color VARCHAR(7) DEFAULT '#CCFF00',
    is_active BOOLEAN DEFAULT TRUE,
    singles_elo INT DEFAULT 1000,
    doubles_elo INT DEFAULT 1000,
    preferred_club_id UUID DEFAULT NULL REFERENCES clubs(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    CONSTRAINT unique_group_player_name UNIQUE (group_id, display_name)
);

-- 6. MATCHES MASTER TABLE
CREATE TABLE matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
    season_id UUID REFERENCES seasons(id) ON DELETE SET NULL,
    game_version_id UUID REFERENCES game_versions(id),
    match_type VARCHAR(10) NOT NULL CHECK (match_type IN ('singles', 'doubles')),
    is_overtime BOOLEAN DEFAULT FALSE,
    is_penalties BOOLEAN DEFAULT FALSE,
    screenshot_url TEXT,
    notes TEXT,
    created_by UUID REFERENCES auth.users(id),
    played_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ DEFAULT NULL
);

-- 7. MATCH SIDES
CREATE TABLE match_sides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id UUID REFERENCES matches(id) ON DELETE CASCADE,
    side_number SMALLINT NOT NULL CHECK (side_number IN (1, 2)),
    club_version_id UUID REFERENCES club_versions(id),
    score INT NOT NULL CHECK (score >= 0),
    penalty_score INT DEFAULT NULL CHECK (penalty_score >= 0),
    result VARCHAR(10) NOT NULL CHECK (result IN ('win', 'loss', 'draw')),
    CONSTRAINT unique_match_side_node UNIQUE (match_id, side_number)
);

-- 8. MATCH PLAYERS
CREATE TABLE match_players (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_side_id UUID REFERENCES match_sides(id) ON DELETE CASCADE,
    player_id UUID REFERENCES player_profiles(id) ON DELETE RESTRICT,
    CONSTRAINT unique_side_player UNIQUE (match_side_id, player_id)
);

-- 9. ELO HISTORICAL AUDIT TRAIL
CREATE TABLE elo_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id UUID REFERENCES player_profiles(id) ON DELETE CASCADE,
    match_id UUID REFERENCES matches(id) ON DELETE CASCADE,
    match_type VARCHAR(10) NOT NULL,
    rating_before INT NOT NULL,
    rating_after INT NOT NULL,
    recorded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_matches_lookup ON matches(group_id, played_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_side_metrics ON match_sides(match_id, result);
CREATE INDEX idx_historical_elo_timeline ON elo_history(player_id, recorded_at ASC);
CREATE INDEX idx_group_members_user ON group_members(user_id);
CREATE INDEX idx_player_profiles_group ON player_profiles(group_id) WHERE deleted_at IS NULL;
