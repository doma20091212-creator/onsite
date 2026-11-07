-- =====================================================================
--  ON-site Sessions: session ratings (1 to 5 stars + optional comment)
--  Paste this whole file into Supabase → SQL Editor → New query → Run.
--
--  Safe on your live database:
--    • it ADDS one new table; no existing account, role, session,
--      progress, phone or attendance row is changed or deleted;
--    • running it twice does nothing the second time.
--
--  Who sees what:
--    • a student sees and changes only their own rating;
--    • admins see every rating; a teacher sees the ratings of
--      their own subject's sessions;
--    • students never see other students' ratings.
-- =====================================================================

create table if not exists public.session_ratings (
  user_id     uuid not null references auth.users(id) on delete cascade,
  session_id  uuid not null references public.sessions(id) on delete cascade,
  stars       smallint not null,
  comment     text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, session_id)
);
create index if not exists session_ratings_session_idx on public.session_ratings(session_id);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'session_ratings_stars') then
    alter table public.session_ratings add constraint session_ratings_stars check (stars between 1 and 5);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'session_ratings_comment_len') then
    alter table public.session_ratings add constraint session_ratings_comment_len check (char_length(comment) <= 500);
  end if;
end $$;

alter table public.session_ratings enable row level security;

drop policy if exists "ratings own"        on public.session_ratings;
drop policy if exists "ratings staff read" on public.session_ratings;
-- your own rating: read, add, change, remove
create policy "ratings own" on public.session_ratings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
-- admins: all ratings; teachers: their subject's sessions
create policy "ratings staff read" on public.session_ratings for select to authenticated
  using (
    public.is_admin()
    or exists (select 1 from public.sessions s
               where s.id = session_ratings.session_id and public.can_manage_subject(s.subject_id))
  );
