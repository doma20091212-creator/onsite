-- =====================================================================
--  ON-site Sessions: DORM SESSIONS + ATTENDANCE (update)
--  Run this ONCE in Supabase → SQL Editor → New query → Run,
--  after schema.sql. Safe to run again; it won't duplicate anything.
-- =====================================================================

-- ---------- Dorms ----------
create table if not exists public.dorms (
  id       serial primary key,
  name_en  text not null,
  name_ar  text not null default '',
  sort     int  not null default 0
);
insert into public.dorms (name_en, name_ar, sort)
select * from (values ('Boys'' dorm', 'سكن البنين', 1), ('Girls'' dorm', 'سكن البنات', 2)) v(a, b, c)
where not exists (select 1 from public.dorms);

-- ---------- Dorm sessions (in-person lessons) ----------
create table if not exists public.live_sessions (
  id                uuid primary key default gen_random_uuid(),
  subject_id        int  not null references public.subjects(id) on delete restrict,
  dorm_id           int  references public.dorms(id) on delete set null,
  teacher_id        uuid references public.profiles(id) on delete set null,
  teacher_name      text not null default '',          -- shown name (also for teachers without an account)
  topic             text not null default '',
  location          text not null default '',          -- room / floor / common room
  starts_at         timestamptz not null default now(),
  duration_min      int  not null default 60 check (duration_min between 5 and 600),
  status            text not null default 'scheduled' check (status in ('scheduled','live','ended')),
  started_at        timestamptz,
  ended_at          timestamptz,
  code              text,                               -- current check-in code
  checkin_open      boolean not null default false,
  attended_count    int check (attended_count is null or attended_count >= 0),  -- headcount typed after the session
  notes             text not null default '',
  recording_id      uuid references public.sessions(id) on delete set null,     -- link to the recorded video
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now()
);
create index if not exists live_sessions_starts_idx on public.live_sessions(starts_at desc);
create unique index if not exists live_sessions_open_code_idx on public.live_sessions(code) where checkin_open;

-- ---------- Attendance (one row per student per dorm session) ----------
create table if not exists public.attendance (
  live_session_id  uuid not null references public.live_sessions(id) on delete cascade,
  user_id          uuid not null references public.profiles(id) on delete cascade,
  checked_in_at    timestamptz not null default now(),
  method           text not null default 'code' check (method in ('code','qr')),
  primary key (live_session_id, user_id)
);

-- ---------- Who may manage a dorm session ----------
create or replace function public.can_manage_live(p_teacher uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or (public.my_role() = 'teacher' and p_teacher = auth.uid())
$$;

-- ---------- Row Level Security ----------
alter table public.dorms enable row level security;
alter table public.live_sessions enable row level security;
alter table public.attendance enable row level security;

drop policy if exists "dorms read"  on public.dorms;
drop policy if exists "dorms admin" on public.dorms;
create policy "dorms read"  on public.dorms for select to authenticated using (true);
create policy "dorms admin" on public.dorms for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Students never read this table directly (codes stay hidden); they use check_in() and my_attendance().
drop policy if exists "live read"   on public.live_sessions;
drop policy if exists "live insert" on public.live_sessions;
drop policy if exists "live update" on public.live_sessions;
drop policy if exists "live delete" on public.live_sessions;
create policy "live read"   on public.live_sessions for select to authenticated using (public.can_manage_live(teacher_id));
create policy "live insert" on public.live_sessions for insert to authenticated with check (public.can_manage_live(teacher_id));
create policy "live update" on public.live_sessions for update to authenticated
  using (public.can_manage_live(teacher_id)) with check (public.can_manage_live(teacher_id));
create policy "live delete" on public.live_sessions for delete to authenticated using (public.can_manage_live(teacher_id));

drop policy if exists "attendance staff read"   on public.attendance;
drop policy if exists "attendance staff delete" on public.attendance;
create policy "attendance staff read" on public.attendance for select to authenticated
  using (exists (select 1 from public.live_sessions l where l.id = live_session_id and public.can_manage_live(l.teacher_id)));
create policy "attendance staff delete" on public.attendance for delete to authenticated
  using (exists (select 1 from public.live_sessions l where l.id = live_session_id and public.can_manage_live(l.teacher_id)));
-- (no insert policy: students check in only through check_in() below)

-- ---------- Student check-in ----------
create or replace function public.check_in(p_code text, p_method text default 'code') returns json
language plpgsql security definer set search_path = public as $$
declare
  ls public.live_sessions;
  added int;
begin
  if auth.uid() is null then
    return json_build_object('ok', false, 'reason', 'signin');
  end if;
  select * into ls from public.live_sessions
   where code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')) and checkin_open
   limit 1;
  if not found then
    return json_build_object('ok', false, 'reason', 'invalid');
  end if;
  insert into public.attendance (live_session_id, user_id, method)
  values (ls.id, auth.uid(), case when p_method = 'qr' then 'qr' else 'code' end)
  on conflict do nothing;
  get diagnostics added = row_count;
  return json_build_object(
    'ok', true, 'already', added = 0, 'id', ls.id, 'subject_id', ls.subject_id,
    'topic', ls.topic, 'teacher_name', ls.teacher_name,
    'dorm', (select name_en from public.dorms where id = ls.dorm_id),
    'dorm_ar', (select name_ar from public.dorms where id = ls.dorm_id));
end $$;

-- ---------- A student's own attendance history ----------
create or replace function public.my_attendance()
returns table (live_session_id uuid, subject_id int, topic text, teacher_name text,
               dorm text, dorm_ar text, starts_at timestamptz, checked_in_at timestamptz)
language sql stable security definer set search_path = public as $$
  select l.id, l.subject_id, l.topic, l.teacher_name, d.name_en, d.name_ar, l.starts_at, a.checked_in_at
    from public.attendance a
    join public.live_sessions l on l.id = a.live_session_id
    left join public.dorms d on d.id = l.dorm_id
   where a.user_id = auth.uid()
   order by a.checked_in_at desc
$$;

revoke all on function public.check_in(text, text) from public, anon;
revoke all on function public.my_attendance() from public, anon;
grant execute on function public.check_in(text, text) to authenticated;
grant execute on function public.my_attendance() to authenticated;
