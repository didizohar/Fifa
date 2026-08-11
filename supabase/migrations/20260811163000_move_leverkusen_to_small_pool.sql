-- Couch League: move Bayer Leverkusen into the "Small Clubs" pool.
--
-- Club tiers are not a separate category column -- every feature that
-- reads a club's tier (Quick Club Draw, the full Club Draw screen, Record
-- Match's club picker, the standalone Random Club Generator's Star Range
-- mode) derives it dynamically from club_versions.star_rating at query
-- time (see src/lib/clubPools.ts: small = 3.5-4.0, large = 4.5-5.0). So
-- moving Leverkusen into "Small" is purely a data correction -- no schema
-- or app code change is needed, and the change propagates everywhere
-- automatically.
--
-- Leverkusen was originally seeded at 4.0 (20260729090100_expand_club_database.sql)
-- and later bumped to 4.5 (20260806110000_update_club_star_ratings.sql, which
-- put it in "Large"). This restores 4.0 -- the club's own prior value, and
-- the top of the "Small" band.
--
-- Same scoping as the prior star-rating migration: matched by name, scoped
-- to clubs.group_id IS NULL (the shared built-in database only, never a
-- group's own custom club), applied to every game version the club has a
-- version under.

UPDATE club_versions cv
SET star_rating = 4.0
FROM clubs c
WHERE cv.club_id = c.id
  AND c.name = 'Bayer Leverkusen'
  AND c.group_id IS NULL;
