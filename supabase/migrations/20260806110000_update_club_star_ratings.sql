-- FC Rival: refresh built-in club star ratings to feel current and balanced.
--
-- Ratings are cosmetic/display-only (same note as the original seed --
-- elo.ts never reads them, and Win-Rate-based statistics/rankings don't
-- depend on them either). This is a data correction, not a schema change:
-- club id, name, logo/colors, and league are all untouched, only
-- star_rating moves. Scoped to club_id IS NULL clubs (the shared built-in
-- database) via clubs.group_id IS NULL, so a group's own custom clubs --
-- even one that happened to share a name with a club below -- can never be
-- touched by this migration.
--
-- Matches by club NAME (not id) for the same reason the original seed
-- files do: club_versions rows are per (club_id, game_version_id), and this
-- should apply to every game version a club has a version under, not just
-- 'EA Sports FC 26' specifically.

UPDATE club_versions cv
SET star_rating = r.star_rating
FROM (VALUES
    ('Real Madrid', 5.0),
    ('FC Barcelona', 4.5),
    ('Atletico Madrid', 4.0),
    ('Manchester City', 5.0),
    ('Manchester United', 3.5),
    ('Liverpool', 4.5),
    ('Arsenal', 4.5),
    ('Chelsea', 4.5),
    ('Tottenham Hotspur', 3.5),
    ('Newcastle United', 3.5),
    ('Bayern Munich', 5.0),
    ('Borussia Dortmund', 4.0),
    ('Paris Saint-Germain', 5.0),
    ('Juventus', 4.0),
    ('Inter Milan', 4.5),
    ('AC Milan', 4.0),
    ('Napoli', 4.0),
    ('Ajax', 3.0),
    ('Benfica', 3.5),
    ('Al Nassr', 3.0),
    ('Aston Villa', 3.5),
    ('West Ham United', 3.0),
    ('Brighton & Hove Albion', 3.0),
    ('Everton', 3.0),
    ('Fulham', 3.0),
    ('Sevilla FC', 3.0),
    ('Real Sociedad', 3.5),
    ('Real Betis', 3.0),
    ('Villarreal CF', 3.5),
    ('Athletic Bilbao', 3.5),
    ('AS Roma', 3.5),
    ('SS Lazio', 3.5),
    ('Atalanta BC', 4.0),
    ('ACF Fiorentina', 3.0),
    ('RB Leipzig', 4.0),
    ('Bayer Leverkusen', 4.5),
    ('Eintracht Frankfurt', 3.5),
    ('VfB Stuttgart', 3.5),
    ('Olympique de Marseille', 3.5),
    ('AS Monaco', 3.5),
    ('Olympique Lyonnais', 3.0),
    ('LOSC Lille', 3.0),
    ('PSV Eindhoven', 3.5),
    ('Feyenoord', 3.5),
    ('FC Porto', 3.5),
    ('Sporting CP', 4.0),
    ('Brazil', 5.0),
    ('Argentina', 5.0),
    ('France National Team', 4.5),
    ('England National Team', 4.5),
    ('Spain National Team', 5.0),
    ('Germany National Team', 4.0),
    ('Portugal National Team', 4.5),
    ('Netherlands National Team', 4.0)
) AS r(name, star_rating)
JOIN clubs c ON c.name = r.name AND c.group_id IS NULL
WHERE cv.club_id = c.id;
