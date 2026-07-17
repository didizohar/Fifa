-- FC Rival: cap avatar uploads
--
-- The avatars bucket (20260715120400_avatar_storage.sql) had no
-- file_size_limit or allowed_mime_types, so any authenticated group member
-- could upload an arbitrarily large file to storage -- an unbounded
-- storage-cost/DoS-shaped gap. The client already re-compresses to JPEG at
-- quality 0.7 before uploading (src/lib/storage.ts), so 5MB comfortably
-- covers any real photo while rejecting abuse; this only restricts inputs
-- no legitimate client ever sends.

update storage.buckets
set file_size_limit = 5242880, -- 5 MiB
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'avatars';
