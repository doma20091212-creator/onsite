-- =====================================================================
--  ON-site Sessions — Supabase database setup
--  Paste this whole file into Supabase → SQL Editor → New query → Run.
--  Safe to run once on a fresh project.
-- =====================================================================

-- ---------- Subjects ----------
create table if not exists public.subjects (
  id         serial primary key,
  slug       text unique not null,
  name_en    text not null,
  name_ar    text not null,
  icon       text not null default '📘',
  color      text not null default '#8B5CF6',
  sort       int  not null default 0
);

insert into public.subjects (slug, name_en, name_ar, icon, color, sort) values
  ('math',      'Math',      'الرياضيات',  '➗', '#C6FF3D', 1),
  ('physics',   'Physics',   'الفيزياء',   '⚛️', '#38BDF8', 2),
  ('chemistry', 'Chemistry', 'الكيمياء',   '⚗️', '#F472B6', 3),
  ('biology',   'Biology',   'الأحياء',    '🧬', '#34D399', 4),
  ('geology',   'Geology',   'الجيولوجيا', '🪨', '#FBBF24', 5),
  ('mechanics', 'Mechanics', 'الميكانيكا', '⚙️', '#FB923C', 6),
  ('arabic',    'Arabic',    'اللغة العربية', 'ض', '#A78BFA', 7),
  ('english',   'English',   'اللغة الإنجليزية', 'Aa', '#60A5FA', 8)
on conflict (slug) do nothing;

-- ---------- Profiles (one per user) ----------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null default '',
  role        text not null default 'student' check (role in ('student','teacher','admin')),
  subject_id  int references public.subjects(id) on delete set null,  -- for teachers
  created_at  timestamptz not null default now()
);

-- ---------- Sessions (videos) ----------
create table if not exists public.sessions (
  id                uuid primary key default gen_random_uuid(),
  subject_id        int not null references public.subjects(id) on delete cascade,
  title             text not null,
  description       text not null default '',
  youtube_id        text not null,
  duration_seconds  int,
  position          int not null default 0,
  attachment_url    text,
  published         boolean not null default true,
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now()
);
create index if not exists sessions_subject_idx on public.sessions(subject_id, position);

-- ---------- Progress (one row per student per session) ----------
create table if not exists public.progress (
  user_id           uuid not null references auth.users(id) on delete cascade,
  session_id        uuid not null references public.sessions(id) on delete cascade,
  position_seconds  numeric not null default 0,
  duration_seconds  numeric,
  max_seconds       numeric not null default 0,   -- furthest point reached
  completed         boolean not null default false,
  notes             text not null default '',
  updated_at        timestamptz not null default now(),
  primary key (user_id, session_id)
);

-- ---------- Helper functions (avoid RLS recursion) ----------
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.my_subject() returns int
language sql stable security definer set search_path = public as $$
  select subject_id from public.profiles where id = auth.uid()
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.can_manage_subject(sid int) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or (public.my_role() = 'teacher' and public.my_subject() = sid)
$$;

-- ---------- New user → profile (first ever user becomes admin) ----------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    case when exists (select 1 from public.profiles where role = 'admin') then 'student' else 'admin' end
  );
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Block students from promoting themselves ----------
create or replace function public.protect_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.role is distinct from old.role or new.subject_id is distinct from old.subject_id)
     and auth.uid() is not null          -- SQL editor / service role may always change
     and not public.is_admin() then
    raise exception 'Only admins can change roles';
  end if;
  return new;
end $$;

drop trigger if exists profiles_protect_role on public.profiles;
create trigger profiles_protect_role
  before update on public.profiles
  for each row execute function public.protect_role();

-- ---------- Row Level Security ----------
alter table public.subjects enable row level security;
alter table public.profiles enable row level security;
alter table public.sessions enable row level security;
alter table public.progress enable row level security;

-- subjects: everyone signed in can read; admin manages
drop policy if exists "subjects read"  on public.subjects;
drop policy if exists "subjects admin" on public.subjects;
create policy "subjects read"  on public.subjects for select to authenticated using (true);
create policy "subjects admin" on public.subjects for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- profiles: see yourself; teachers/admins see everyone (names + roles only)
drop policy if exists "profiles read"         on public.profiles;
drop policy if exists "profiles update self"  on public.profiles;
drop policy if exists "profiles admin update" on public.profiles;
create policy "profiles read" on public.profiles for select to authenticated
  using (id = auth.uid() or public.my_role() in ('teacher','admin'));
create policy "profiles update self" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy "profiles admin update" on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- sessions: students see published ones; teachers manage their subject; admin manages all
drop policy if exists "sessions read"   on public.sessions;
drop policy if exists "sessions insert" on public.sessions;
drop policy if exists "sessions update" on public.sessions;
drop policy if exists "sessions delete" on public.sessions;
create policy "sessions read" on public.sessions for select to authenticated
  using (published or public.can_manage_subject(subject_id));
create policy "sessions insert" on public.sessions for insert to authenticated
  with check (public.can_manage_subject(subject_id));
create policy "sessions update" on public.sessions for update to authenticated
  using (public.can_manage_subject(subject_id)) with check (public.can_manage_subject(subject_id));
create policy "sessions delete" on public.sessions for delete to authenticated
  using (public.can_manage_subject(subject_id));

-- progress: you own your rows; admins see all; teachers see their subject's
drop policy if exists "progress own"        on public.progress;
drop policy if exists "progress staff read" on public.progress;
create policy "progress own" on public.progress for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "progress staff read" on public.progress for select to authenticated
  using (
    public.is_admin()
    or exists (select 1 from public.sessions s
               where s.id = progress.session_id and public.can_manage_subject(s.subject_id))
  );

-- =====================================================================
--  Handy snippets (run separately when needed)
-- =====================================================================
-- Make someone admin by email:
--   update public.profiles set role = 'admin'
--   where id = (select id from auth.users where email = 'you@example.com');
