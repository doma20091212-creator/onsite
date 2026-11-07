-- =====================================================================
--  ON-site Sessions: extras (leaderboard, announcements, live updates)
--  Paste this whole file into Supabase → SQL Editor → New query → Run.
--
--  Safe on your live database:
--    • it only ADDS: one column (show_on_board, off for everyone),
--      one table (announcements) and one function (leaderboard);
--    • no existing account, role, session, progress, rating, phone or
--      attendance row is changed or deleted;
--    • running it twice does nothing the second time.
--  Run it after schema.sql and dorm-sessions.sql.
-- =====================================================================

-- ---------- Leaderboard opt-in (every member starts hidden) ----------
alter table public.profiles add column if not exists show_on_board boolean not null default false;

-- ---------- Announcements ----------
create table if not exists public.announcements (
  id          bigint generated always as identity primary key,
  body        text not null check (char_length(body) between 1 and 500),
  subject_id  int references public.subjects(id) on delete cascade,      -- null = everyone
  kind        text not null default 'info' check (kind in ('info','important','celebrate')),
  ends_at     timestamptz,                                                -- null = until deleted
  created_by  uuid references auth.users(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now()
);
create index if not exists announcements_created_idx on public.announcements(created_at desc);

alter table public.announcements enable row level security;
drop policy if exists "announcements read"   on public.announcements;
drop policy if exists "announcements insert" on public.announcements;
drop policy if exists "announcements delete" on public.announcements;
-- everyone signed in can read them
create policy "announcements read" on public.announcements for select to authenticated using (true);
-- admins post to anyone; teachers post to their own subject only
create policy "announcements insert" on public.announcements for insert to authenticated
  with check (
    created_by = auth.uid()
    and (public.is_admin() or (public.my_role() = 'teacher' and subject_id is not null and subject_id = public.my_subject()))
  );
-- admins delete any; others only their own
create policy "announcements delete" on public.announcements for delete to authenticated
  using (public.is_admin() or created_by = auth.uid());

-- ---------- Leaderboard ----------
-- Students who switched "Show me on the leaderboard" on, ranked by finished sessions.
-- Only a first name + initial leaves the database. You always see your own row.
-- p_days = 7 for "this week", null for "all time".
create or replace function public.leaderboard(p_days int default 7)
returns table (user_id uuid, name text, finished int, minutes int, is_me boolean)
language sql stable security definer set search_path = public as $$
  with pr as (
    select g.user_id,
           count(*) filter (where g.completed)::int as finished,
           coalesce(round(sum(least(g.max_seconds, coalesce(nullif(g.duration_seconds, 0), g.max_seconds))) / 60), 0)::int as minutes
    from public.progress g
    join public.sessions s on s.id = g.session_id and s.published
    where p_days is null or g.updated_at >= now() - make_interval(days => p_days)
    group by g.user_id
  )
  select p.id,
         trim(split_part(trim(p.full_name), ' ', 1)
              || coalesce(' ' || nullif(left(split_part(trim(p.full_name), ' ', 2), 1), '') || '.', '')),
         coalesce(pr.finished, 0),
         coalesce(pr.minutes, 0),
         p.id = auth.uid()
  from public.profiles p
  left join pr on pr.user_id = p.id
  where auth.uid() is not null
    and p.role = 'student'
    and (p.show_on_board or p.id = auth.uid())
    and (coalesce(pr.finished, 0) > 0 or coalesce(pr.minutes, 0) > 0 or p.id = auth.uid())
  order by 3 desc, 4 desc, 2
  limit 100
$$;
revoke all on function public.leaderboard(int) from public;
revoke all on function public.leaderboard(int) from anon;
grant execute on function public.leaderboard(int) to authenticated;

-- ---------- Live updates ----------
-- New check-ins appear on the teacher's screen instantly, and new announcements pop up
-- for everyone, without refreshing. (The usual security rules still apply.)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.attendance;    exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.announcements; exception when duplicate_object then null; end;
  end if;
end $$;
