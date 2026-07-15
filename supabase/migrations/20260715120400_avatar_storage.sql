-- FC Rival: avatar storage bucket
--
-- Public bucket -- avatars are non-sensitive display images and
-- player_profiles.avatar_url is a plain TEXT URL, so a public bucket avoids
-- signed-URL re-issuance complexity for zero MVP benefit. Path convention
-- is {group_id}/{player_id}/{filename}, so the write policies below can
-- extract group_id from the path and reuse is_group_member() from
-- 20260715120300_rls_policies.sql rather than inventing new authorization
-- logic.

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy avatars_insert on storage.objects for insert
    with check (
        bucket_id = 'avatars'
        and is_group_member((storage.foldername(name))[1]::uuid)
    );

create policy avatars_update on storage.objects for update
    using (
        bucket_id = 'avatars'
        and is_group_member((storage.foldername(name))[1]::uuid)
    )
    with check (
        bucket_id = 'avatars'
        and is_group_member((storage.foldername(name))[1]::uuid)
    );

create policy avatars_delete on storage.objects for delete
    using (
        bucket_id = 'avatars'
        and is_group_member((storage.foldername(name))[1]::uuid)
    );

-- Public bucket already serves plain GETs without RLS, but an explicit
-- select policy is added for defense-in-depth / clarity.
create policy avatars_select on storage.objects for select
    using (bucket_id = 'avatars');
