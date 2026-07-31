-- FC Rival: expand the built-in club database with league/colors, and add
-- more clubs across Premier League, La Liga, Serie A, Bundesliga, Ligue 1,
-- Eredivisie, Liga Portugal, and national teams.
--
-- Star ratings and colors here are reasonable editorial defaults for
-- display purposes only (same "cosmetic, elo.ts never reads them" note as
-- the original seed) -- they are NOT guaranteed to match any specific
-- current EA Sports FC release, which changes every year. Every rating is
-- freely editable afterward (see the Custom Clubs / club-editing UI);
-- nothing here is load-bearing for match recording, statistics, or
-- rankings, all of which are Win-Rate-based and club-rating-independent.
-- Idempotent via ON CONFLICT, matching 20260715120500_seed_reference_data.sql.

-- Backfill league + kit colors onto the 20 clubs from the original seed.
UPDATE clubs SET league = 'La Liga', primary_color = '#FFFFFF', secondary_color = '#FEBE10' WHERE name = 'Real Madrid';
UPDATE clubs SET league = 'La Liga', primary_color = '#A50044', secondary_color = '#004D98' WHERE name = 'FC Barcelona';
UPDATE clubs SET league = 'La Liga', primary_color = '#CB3524', secondary_color = '#272E61' WHERE name = 'Atletico Madrid';
UPDATE clubs SET league = 'Premier League', primary_color = '#6CABDD', secondary_color = '#1C2C5B' WHERE name = 'Manchester City';
UPDATE clubs SET league = 'Premier League', primary_color = '#DA291C', secondary_color = '#FBE122' WHERE name = 'Manchester United';
UPDATE clubs SET league = 'Premier League', primary_color = '#C8102E', secondary_color = '#00B2A9' WHERE name = 'Liverpool';
UPDATE clubs SET league = 'Premier League', primary_color = '#EF0107', secondary_color = '#023474' WHERE name = 'Arsenal';
UPDATE clubs SET league = 'Premier League', primary_color = '#034694', secondary_color = '#DBA111' WHERE name = 'Chelsea';
UPDATE clubs SET league = 'Premier League', primary_color = '#132257', secondary_color = '#FFFFFF' WHERE name = 'Tottenham Hotspur';
UPDATE clubs SET league = 'Premier League', primary_color = '#241F20', secondary_color = '#FFFFFF' WHERE name = 'Newcastle United';
UPDATE clubs SET league = 'Bundesliga', primary_color = '#DC052D', secondary_color = '#0066B2' WHERE name = 'Bayern Munich';
UPDATE clubs SET league = 'Bundesliga', primary_color = '#FDE100', secondary_color = '#000000' WHERE name = 'Borussia Dortmund';
UPDATE clubs SET league = 'Ligue 1', primary_color = '#004170', secondary_color = '#DA291C' WHERE name = 'Paris Saint-Germain';
UPDATE clubs SET league = 'Serie A', primary_color = '#000000', secondary_color = '#FFFFFF' WHERE name = 'Juventus';
UPDATE clubs SET league = 'Serie A', primary_color = '#0068A8', secondary_color = '#000000' WHERE name = 'Inter Milan';
UPDATE clubs SET league = 'Serie A', primary_color = '#FB090B', secondary_color = '#000000' WHERE name = 'AC Milan';
UPDATE clubs SET league = 'Serie A', primary_color = '#12A0D7', secondary_color = '#003087' WHERE name = 'Napoli';
UPDATE clubs SET league = 'Eredivisie', primary_color = '#D2122E', secondary_color = '#FFFFFF' WHERE name = 'Ajax';
UPDATE clubs SET league = 'Liga Portugal', primary_color = '#E31B23', secondary_color = '#FFFFFF' WHERE name = 'Benfica';
UPDATE clubs SET league = 'Saudi Pro League', primary_color = '#FFE800', secondary_color = '#003DA5' WHERE name = 'Al Nassr';

INSERT INTO clubs (name, country, league, primary_color, secondary_color) VALUES
    ('Aston Villa', 'England', 'Premier League', '#670E36', '#95BFE5'),
    ('West Ham United', 'England', 'Premier League', '#7A263A', '#1BB1E7'),
    ('Brighton & Hove Albion', 'England', 'Premier League', '#0057B8', '#FFFFFF'),
    ('Everton', 'England', 'Premier League', '#003399', '#FFFFFF'),
    ('Fulham', 'England', 'Premier League', '#FFFFFF', '#000000'),
    ('Sevilla FC', 'Spain', 'La Liga', '#D8232A', '#FFFFFF'),
    ('Real Sociedad', 'Spain', 'La Liga', '#0067B1', '#FFFFFF'),
    ('Real Betis', 'Spain', 'La Liga', '#00954C', '#FFFFFF'),
    ('Villarreal CF', 'Spain', 'La Liga', '#FFE667', '#005187'),
    ('Athletic Bilbao', 'Spain', 'La Liga', '#EE2523', '#FFFFFF'),
    ('AS Roma', 'Italy', 'Serie A', '#8E1F2F', '#F0BC42'),
    ('SS Lazio', 'Italy', 'Serie A', '#87CEEB', '#FFFFFF'),
    ('Atalanta BC', 'Italy', 'Serie A', '#1E71B8', '#000000'),
    ('ACF Fiorentina', 'Italy', 'Serie A', '#7C2946', '#FFFFFF'),
    ('RB Leipzig', 'Germany', 'Bundesliga', '#DD0741', '#FFFFFF'),
    ('Bayer Leverkusen', 'Germany', 'Bundesliga', '#E32221', '#000000'),
    ('Eintracht Frankfurt', 'Germany', 'Bundesliga', '#E1000F', '#000000'),
    ('VfB Stuttgart', 'Germany', 'Bundesliga', '#FFFFFF', '#E32219'),
    ('Olympique de Marseille', 'France', 'Ligue 1', '#2FAEE0', '#FFFFFF'),
    ('AS Monaco', 'France', 'Ligue 1', '#ED1C24', '#FFFFFF'),
    ('Olympique Lyonnais', 'France', 'Ligue 1', '#DA1F27', '#0056A3'),
    ('LOSC Lille', 'France', 'Ligue 1', '#E01D2B', '#004A9F'),
    ('PSV Eindhoven', 'Netherlands', 'Eredivisie', '#ED1C24', '#FFFFFF'),
    ('Feyenoord', 'Netherlands', 'Eredivisie', '#FF0000', '#000000'),
    ('FC Porto', 'Portugal', 'Liga Portugal', '#00447C', '#FFFFFF'),
    ('Sporting CP', 'Portugal', 'Liga Portugal', '#00594B', '#FFFFFF'),
    ('Brazil', 'Brazil', 'National Teams', '#FFDF00', '#009639'),
    ('Argentina', 'Argentina', 'National Teams', '#75AADB', '#FFFFFF'),
    ('France National Team', 'France', 'National Teams', '#0055A4', '#EF4135'),
    ('England National Team', 'England', 'National Teams', '#FFFFFF', '#CE1124'),
    ('Spain National Team', 'Spain', 'National Teams', '#AA151B', '#F1BF00'),
    ('Germany National Team', 'Germany', 'National Teams', '#000000', '#DD0000'),
    ('Portugal National Team', 'Portugal', 'National Teams', '#006600', '#FF0000'),
    ('Netherlands National Team', 'Netherlands', 'National Teams', '#FF6C00', '#FFFFFF')
ON CONFLICT DO NOTHING;

INSERT INTO club_versions (club_id, game_version_id, star_rating, attack_rating, midfield_rating, defense_rating)
SELECT c.id, gv.id, r.star_rating, r.attack_rating, r.midfield_rating, r.defense_rating
FROM (VALUES
    ('Aston Villa', 3.5, 79, 79, 78),
    ('West Ham United', 3.0, 76, 76, 75),
    ('Brighton & Hove Albion', 3.0, 76, 77, 74),
    ('Everton', 3.0, 74, 74, 75),
    ('Fulham', 3.0, 74, 75, 74),
    ('Sevilla FC', 3.5, 78, 78, 77),
    ('Real Sociedad', 3.5, 78, 78, 76),
    ('Real Betis', 3.0, 76, 77, 74),
    ('Villarreal CF', 3.5, 78, 77, 76),
    ('Athletic Bilbao', 3.5, 78, 78, 78),
    ('AS Roma', 3.5, 79, 79, 78),
    ('SS Lazio', 3.5, 79, 78, 77),
    ('Atalanta BC', 3.5, 80, 79, 76),
    ('ACF Fiorentina', 3.0, 77, 77, 75),
    ('RB Leipzig', 4.0, 82, 81, 79),
    ('Bayer Leverkusen', 4.0, 82, 82, 79),
    ('Eintracht Frankfurt', 3.5, 79, 78, 77),
    ('VfB Stuttgart', 3.0, 78, 77, 74),
    ('Olympique de Marseille', 3.5, 79, 78, 77),
    ('AS Monaco', 3.5, 80, 78, 76),
    ('Olympique Lyonnais', 3.5, 79, 78, 76),
    ('LOSC Lille', 3.0, 77, 77, 76),
    ('PSV Eindhoven', 3.5, 80, 79, 76),
    ('Feyenoord', 3.5, 79, 78, 77),
    ('FC Porto', 3.5, 80, 79, 78),
    ('Sporting CP', 3.5, 80, 79, 78),
    ('Brazil', 5.0, 90, 88, 86),
    ('Argentina', 5.0, 89, 89, 87),
    ('France National Team', 4.5, 88, 86, 86),
    ('England National Team', 4.0, 85, 84, 83),
    ('Spain National Team', 4.5, 86, 87, 84),
    ('Germany National Team', 4.5, 86, 85, 84),
    ('Portugal National Team', 4.5, 87, 85, 83),
    ('Netherlands National Team', 4.0, 84, 83, 82)
) AS r(name, star_rating, attack_rating, midfield_rating, defense_rating)
JOIN clubs c ON c.name = r.name
CROSS JOIN (SELECT id FROM game_versions WHERE name = 'EA Sports FC 26') AS gv
ON CONFLICT ON CONSTRAINT unique_club_version DO NOTHING;
