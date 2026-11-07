-- =====================================================================
--  ON-site Sessions: collab partners on sessions
--  Paste this whole file into Supabase → SQL Editor → New query → Run.
--
--  Safe on your live database:
--    • it ADDS a new "collabs" table and one empty column (collab_id)
--      to sessions;
--    • no existing session, account, progress or attendance row is
--      changed or deleted (existing sessions simply have no collab);
--    • running it twice does nothing the second time.
-- =====================================================================

-- 1. Collab partners (name + small logo image)
create table if not exists public.collabs (
  id          serial primary key,
  name        text not null,
  logo        text,                 -- small image stored as text, or a link to one
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'collabs_logo_size') then
    alter table public.collabs add constraint collabs_logo_size check (logo is null or length(logo) <= 300000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'collabs_name_len') then
    alter table public.collabs add constraint collabs_name_len check (length(trim(name)) between 1 and 60);
  end if;
end $$;

-- Life vs. Logic is added once (its logo ships with the website files)
insert into public.collabs (name, logo)
select 'Life vs. Logic', 'img/life-vs-logic.png'
where not exists (select 1 from public.collabs where lower(name) = 'life vs. logic');

-- 2. Which collab a session belongs to (empty = no collab)
alter table public.sessions add column if not exists collab_id int references public.collabs(id) on delete set null;

-- 3. Who can do what
alter table public.collabs enable row level security;

drop policy if exists "collabs read"   on public.collabs;
drop policy if exists "collabs insert" on public.collabs;
drop policy if exists "collabs update" on public.collabs;
drop policy if exists "collabs delete" on public.collabs;
-- everyone signed in can see collabs (students see the logos)
create policy "collabs read"   on public.collabs for select to authenticated using (true);
-- teachers and admins can add a new collab while posting a session
create policy "collabs insert" on public.collabs for insert to authenticated
  with check (public.my_role() in ('teacher', 'admin'));
-- only admins can rename or remove one
create policy "collabs update" on public.collabs for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "collabs delete" on public.collabs for delete to authenticated
  using (public.is_admin());

-- =====================================================================
--  OPTIONAL (run separately, only if you want it): mark every existing
--  Biology and Math session as a Life vs. Logic collab in one go.
--  Remove the two leading dashes on the next 4 lines, then Run.
-- =====================================================================
-- update public.sessions
--   set collab_id = (select id from public.collabs where lower(name) = 'life vs. logic')
-- where collab_id is null
--   and subject_id in (select id from public.subjects where slug in ('math', 'biology'));
