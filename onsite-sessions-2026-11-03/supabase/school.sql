-- =====================================================================
--  ON-site Sessions: members' school
--  Paste this whole file into Supabase → SQL Editor → New query → Run.
--
--  Safe on your live database:
--    • it ADDS one empty column (school) to profiles and a small
--      sign-up step;
--    • no existing account, role, session, progress or attendance row
--      is changed or deleted;
--    • running it twice does nothing the second time.
--
--  Members can already edit their own profile, so they fill in their
--  school themselves the next time they open the site.
-- =====================================================================

alter table public.profiles add column if not exists school text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_school_len') then
    alter table public.profiles add constraint profiles_school_len check (school is null or length(school) <= 120);
  end if;
end $$;

-- Save the school typed on the sign-up page. It runs right after the
-- existing sign-up step has created the profile, and it can never block a
-- sign-up: anything odd is simply skipped.
create or replace function public.save_signup_school() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v text := left(trim(coalesce(new.raw_user_meta_data->>'school', '')), 120);
begin
  if v <> '' then
    begin
      update public.profiles set school = v where id = new.id and (school is null or school = '');
    exception when others then null;   -- never stop someone from signing up
    end;
  end if;
  return new;
end $$;

-- (triggers on the same table run in name order, so this one runs after
--  "on_auth_user_created", which makes the profile)
drop trigger if exists on_auth_user_created_school on auth.users;
create trigger on_auth_user_created_school
  after insert on auth.users
  for each row execute function public.save_signup_school();
