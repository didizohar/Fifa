-- FC Rival: seed reference data
--
-- game_versions/clubs/club_versions have no client-write RLS policy (see
-- 20260715120300_rls_policies.sql) -- they're service-role/migration-only.
-- Without at least one club to pick, match recording (which requires a
-- club_version_id per side) is impossible, so the app needs this seed to
-- be usable at all. Idempotent via ON CONFLICT so re-running db push is
-- safe. Ratings are cosmetic/display-only -- elo.ts never reads them.

insert into game_versions (id, name, is_default)
values (gen_random_uuid(), 'EA Sports FC 26', true)
on conflict (name) do nothing;

insert into clubs (name, country) values
    ('Real Madrid', 'Spain'),
    ('FC Barcelona', 'Spain'),
    ('Atletico Madrid', 'Spain'),
    ('Manchester City', 'England'),
    ('Manchester United', 'England'),
    ('Liverpool', 'England'),
    ('Arsenal', 'England'),
    ('Chelsea', 'England'),
    ('Tottenham Hotspur', 'England'),
    ('Newcastle United', 'England'),
    ('Bayern Munich', 'Germany'),
    ('Borussia Dortmund', 'Germany'),
    ('Paris Saint-Germain', 'France'),
    ('Juventus', 'Italy'),
    ('Inter Milan', 'Italy'),
    ('AC Milan', 'Italy'),
    ('Napoli', 'Italy'),
    ('Ajax', 'Netherlands'),
    ('Benfica', 'Portugal'),
    ('Al Nassr', 'Saudi Arabia')
on conflict (name) do nothing;

insert into club_versions (club_id, game_version_id, star_rating, attack_rating, midfield_rating, defense_rating)
select c.id, gv.id, r.star_rating, r.attack_rating, r.midfield_rating, r.defense_rating
from (values
    ('Real Madrid', 4.5, 88, 85, 84),
    ('FC Barcelona', 4.5, 87, 86, 82),
    ('Atletico Madrid', 4.0, 82, 81, 85),
    ('Manchester City', 4.5, 87, 87, 84),
    ('Manchester United', 4.0, 83, 81, 80),
    ('Liverpool', 4.5, 85, 84, 83),
    ('Arsenal', 4.0, 84, 83, 81),
    ('Chelsea', 4.0, 82, 80, 80),
    ('Tottenham Hotspur', 3.5, 82, 79, 78),
    ('Newcastle United', 3.5, 80, 79, 80),
    ('Bayern Munich', 4.5, 86, 85, 83),
    ('Borussia Dortmund', 4.0, 83, 81, 78),
    ('Paris Saint-Germain', 4.5, 87, 84, 81),
    ('Juventus', 4.0, 82, 81, 82),
    ('Inter Milan', 4.0, 83, 82, 83),
    ('AC Milan', 4.0, 82, 80, 80),
    ('Napoli', 4.0, 83, 82, 80),
    ('Ajax', 3.5, 79, 79, 77),
    ('Benfica', 3.5, 80, 79, 78),
    ('Al Nassr', 3.5, 81, 78, 76)
) as r(name, star_rating, attack_rating, midfield_rating, defense_rating)
join clubs c on c.name = r.name
cross join (select id from game_versions where name = 'EA Sports FC 26') as gv
on conflict on constraint unique_club_version do nothing;
