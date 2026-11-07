-- =====================================================================
--  ON-site Sessions: teacher sign-up requests
--  Paste this whole file into Supabase → SQL Editor → New query → Run.
--
--  Safe on your live database:
--    • it only ADDS three empty columns to profiles and updates the
--      sign-up function;
--    • no existing account, role, session, progress or attendance row
--      is changed or deleted;
--    • running it twice does nothing the second time.
-- =====================================================================

-- 1. Where a pending "I'm a teacher" request is kept
alter table public.profiles add column if not exists requested_role    text;
alter table public.profiles add column if not exists requested_subject int references public.subjects(id) on delete set null;
alter table public.profiles add column if not exists requested_at      timestamptz;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_requested_role_check') then
    alter table public.profiles
      add constraint profiles_requested_role_check check (requested_role is null or requested_role = 'teacher');
  end if;
end $$;

-- 2. Sign-up: everyone still starts as a student (the very first account
--    ever is still the admin). Choosing "Teacher" only files a request;
--    an admin has to approve it before the account becomes a teacher.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  first_admin boolean := not exists (select 1 from public.profiles where role = 'admin');
  wants_teacher boolean := coalesce(new.raw_user_meta_data->>'requested_role', '') = 'teacher' and not first_admin;
begin
  insert into public.profiles (id, full_name, role, requested_role, requested_subject, requested_at)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    case when first_admin then 'admin' else 'student' end,
    case when wants_teacher then 'teacher' end,
    case when wants_teacher then (select s.id from public.subjects s where s.slug = new.raw_user_meta_data->>'requested_subject') end,
    case when wants_teacher then now() end
  );
  return new;
end $$;

-- The trigger itself is unchanged (it already calls handle_new_user).
-- Nothing else is needed: students can already edit their own profile
-- (so they can send or cancel a request), the existing protect_role
-- trigger still stops anyone except an admin from changing a role,
-- and admins can already update any profile (approve / decline).
