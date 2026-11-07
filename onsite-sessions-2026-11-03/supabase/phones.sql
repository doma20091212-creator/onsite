-- =====================================================================
--  ON-site Sessions: members' phone numbers (for session feedback)
--  Paste this whole file into Supabase → SQL Editor → New query → Run.
--
--  Safe on your live database:
--    • it ADDS one new private table and a small sign-up step;
--    • no existing account, role, session, progress or attendance row
--      is changed or deleted;
--    • running it twice does nothing the second time.
--
--  Privacy: a number can be read only by its owner and by admins.
--  Teachers and other students can't see it.
-- =====================================================================

create table if not exists public.profile_phones (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  phone       text not null,
  updated_at  timestamptz not null default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profile_phones_format') then
    alter table public.profile_phones
      add constraint profile_phones_format check (phone ~ '^\+?[0-9]{8,15}$');
  end if;
end $$;

alter table public.profile_phones enable row level security;

drop policy if exists "phones read"   on public.profile_phones;
drop policy if exists "phones insert" on public.profile_phones;
drop policy if exists "phones update" on public.profile_phones;
drop policy if exists "phones delete" on public.profile_phones;
create policy "phones read"   on public.profile_phones for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy "phones insert" on public.profile_phones for insert to authenticated
  with check (user_id = auth.uid());
create policy "phones update" on public.profile_phones for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "phones delete" on public.profile_phones for delete to authenticated
  using (user_id = auth.uid());

-- Save the number typed on the sign-up page. This is its own small step
-- (separate from the existing sign-up function), and it can never block a
-- sign-up: a missing or badly formatted number is simply skipped.
create or replace function public.save_signup_phone() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v text := regexp_replace(coalesce(new.raw_user_meta_data->>'phone', ''), '[^0-9+]', '', 'g');
begin
  if v ~ '^\+?[0-9]{8,15}$' then
    begin
      insert into public.profile_phones (user_id, phone) values (new.id, v)
      on conflict (user_id) do update set phone = excluded.phone, updated_at = now();
    exception when others then null;   -- never stop someone from signing up
    end;
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created_phone on auth.users;
create trigger on_auth_user_created_phone
  after insert on auth.users
  for each row execute function public.save_signup_phone();
