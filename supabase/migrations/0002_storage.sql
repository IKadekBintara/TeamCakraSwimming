-- Storage bucket for athlete photos
-- Run after 0001_initial_schema.sql

insert into storage.buckets (id, name, public)
values ('athlete-photos', 'athlete-photos', true)
on conflict (id) do nothing;

-- Authenticated users can upload photos; public can read
create policy "athlete_photos_public_read"
  on storage.objects for select
  using (bucket_id = 'athlete-photos');

create policy "athlete_photos_auth_write"
  on storage.objects for insert
  with check (bucket_id = 'athlete-photos' and auth.role() = 'authenticated');

create policy "athlete_photos_auth_update"
  on storage.objects for update
  using (bucket_id = 'athlete-photos' and auth.role() = 'authenticated');

create policy "athlete_photos_auth_delete"
  on storage.objects for delete
  using (bucket_id = 'athlete-photos' and auth.role() = 'authenticated');
