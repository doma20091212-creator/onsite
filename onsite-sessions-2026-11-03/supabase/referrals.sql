-- =====================================================================
--  ON-site Sessions: invite links, points, prizes leaderboard,
--  and one account per phone number
--  Paste this whole file into Supabase → SQL Editor → New query → Run.
--
--  Safe on your live database:
--    • it only ADDS tables (referral_codes, referrals, referral_contest)
--      and functions;
--    • no existing account, role, session, progress, phone or
--      attendance row is changed or deleted;
--    • accounts that ALREADY share a phone number keep working; the rule
--      only stops NEW sign-ups and NEW number changes. Admins see a
--      "shared number" warning on those people in Manage → People.
--    • running it twice does nothing the second time.
--  Run it after schema.sql, phones.sql, school.sql and plus.sql.
-- =====================================================================

-- ---------- Phone numbers: one account per number ----------
-- 01012345678, +201012345678, 00201012345678 and 0101 234 5678 all count as the same number.
create or replace function public.norm_phone(p text) returns text
language sql immutable set search_path = public as $$
  select case
           when d like '0020%' then '0' || substr(d, 5)
           when d like '20%' and length(d) = 12 then '0' || substr(d, 3)
           else d
         end
  from (select regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g') as d) x
$$;
create index if not exists profile_phones_norm_idx on public.profile_phones (public.norm_phone(phone));

create or replace function public.phone_unique() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('phone:' || public.norm_phone(new.phone)));   -- two sign-ups at the same moment
  if exists (select 1 from public.profile_phones o
             where o.user_id <> new.user_id and public.norm_phone(o.phone) = public.norm_phone(new.phone)) then
    raise exception 'phone_taken' using hint = 'This phone number already belongs to another account.';
  end if;
  return new;
end $$;
drop trigger if exists profile_phones_unique on public.profile_phones;
create trigger profile_phones_unique
  before insert or update of phone on public.profile_phones
  for each row execute function public.phone_unique();

-- Sign-up: a number that already has an account stops the new account from being created.
-- (Anything else that goes wrong with the number still never blocks a sign-up.)
create or replace function public.save_signup_phone() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v text := regexp_replace(coalesce(new.raw_user_meta_data->>'phone', ''), '[^0-9+]', '', 'g');
begin
  if v ~ '^\+?[0-9]{8,15}$' then
    if exists (select 1 from public.profile_phones o where public.norm_phone(o.phone) = public.norm_phone(v)) then
      raise exception 'phone_taken' using hint = 'This phone number already belongs to another account.';
    end if;
    begin
      insert into public.profile_phones (user_id, phone) values (new.id, v)
      on conflict (user_id) do update set phone = excluded.phone, updated_at = now();
    exception when others then
      if sqlerrm = 'phone_taken' then raise; end if;
    end;
  end if;
  return new;
end $$;

-- Lets the sign-up form say "this number already has an account" before trying.
create or replace function public.phone_available(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select length(public.norm_phone(p)) >= 8
     and not exists (select 1 from public.profile_phones o
                     where public.norm_phone(o.phone) = public.norm_phone(p)
                       and o.user_id is distinct from auth.uid())
$$;
revoke all on function public.phone_available(text) from public;
grant execute on function public.phone_available(text) to anon, authenticated;

-- ---------- Invite codes ----------
create table if not exists public.referral_codes (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  code        text not null unique check (code ~ '^[A-Z2-9]{6,10}$'),
  created_at  timestamptz not null default now()
);
alter table public.referral_codes enable row level security;
drop policy if exists "ref codes read" on public.referral_codes;
create policy "ref codes read" on public.referral_codes for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
-- (no insert/update policy: codes are only made by my_ref_code() below)

-- "Get your link": returns your code, making one the first time.
create or replace function public.my_ref_code() returns text
language plpgsql volatile security definer set search_path = public as $$
declare c text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select code into c from public.referral_codes where user_id = auth.uid();
  if c is not null then return c; end if;
  for i in 1..20 loop
    c := (select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '') from generate_series(1, 6));
    begin
      insert into public.referral_codes (user_id, code) values (auth.uid(), c);
      return c;
    exception when unique_violation then
      select code into c from public.referral_codes where user_id = auth.uid();
      if c is not null then return c; end if;            -- made in another tab a moment ago
    end;
  end loop;
  raise exception 'could not make a code, try again';
end $$;
revoke all on function public.my_ref_code() from public, anon;
grant execute on function public.my_ref_code() to authenticated;

-- The sign-up page shows "Mariam invited you". Only a first name leaves the database.
create or replace function public.ref_info(p_code text) returns table (name text)
language sql stable security definer set search_path = public as $$
  select split_part(trim(p.full_name), ' ', 1)
  from public.referral_codes c join public.profiles p on p.id = c.user_id
  where c.code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'))
$$;
revoke all on function public.ref_info(text) from public;
grant execute on function public.ref_info(text) to anon, authenticated;

-- ---------- Referrals (who joined with whose link) ----------
create table if not exists public.referrals (
  referred_id  uuid primary key references auth.users(id) on delete cascade,   -- one inviter per new account
  referrer_id  uuid not null references auth.users(id) on delete cascade,
  code         text,
  status       text not null default 'ok' check (status in ('ok', 'rejected')),
  created_at   timestamptz not null default now(),
  check (referred_id <> referrer_id)
);
create index if not exists referrals_referrer_idx on public.referrals(referrer_id);
alter table public.referrals enable row level security;
drop policy if exists "referrals read"         on public.referrals;
drop policy if exists "referrals admin update" on public.referrals;
-- you see the people you invited; admins see everything
create policy "referrals read" on public.referrals for select to authenticated
  using (referrer_id = auth.uid() or public.is_admin());
-- admins can mark an invite as fake ("rejected") or count it again
create policy "referrals admin update" on public.referrals for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
-- (no insert policy: referrals are only recorded at sign-up, below)

create or replace function public.save_signup_referral() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v text := upper(regexp_replace(coalesce(new.raw_user_meta_data->>'ref', ''), '[^A-Za-z0-9]', '', 'g'));
  r uuid;
begin
  if v <> '' then
    begin
      select user_id into r from public.referral_codes where code = v;
      if r is not null and r <> new.id then
        insert into public.referrals (referred_id, referrer_id, code) values (new.id, r, v)
        on conflict (referred_id) do nothing;
      end if;
    exception when others then null;   -- an invite problem never stops someone from signing up
    end;
  end if;
  return new;
end $$;
drop trigger if exists on_auth_user_created_referral on auth.users;
create trigger on_auth_user_created_referral
  after insert on auth.users
  for each row execute function public.save_signup_referral();

-- ---------- Contest settings (one row, edited by admins in Manage → Invites) ----------
create table if not exists public.referral_contest (
  id                 int primary key default 1 check (id = 1),
  points_per_invite  int not null default 10 check (points_per_invite between 1 and 10000),
  prize1             text not null default '' check (length(prize1) <= 120),
  prize2             text not null default '' check (length(prize2) <= 120),
  prize3             text not null default '' check (length(prize3) <= 120),
  starts_at          timestamptz,            -- invites before this don't count (start a new round)
  ends_at            timestamptz,            -- invites after this don't count
  updated_at         timestamptz not null default now()
);
insert into public.referral_contest (id) values (1) on conflict (id) do nothing;
alter table public.referral_contest enable row level security;
drop policy if exists "contest read"  on public.referral_contest;
drop policy if exists "contest admin" on public.referral_contest;
create policy "contest read"  on public.referral_contest for select to anon, authenticated using (true);
create policy "contest admin" on public.referral_contest for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------- The public leaderboard ----------
-- An invite counts when: the new account gave a phone number (unique, see above),
-- an admin hasn't rejected it, and it happened inside the contest dates.
-- Ties go to whoever reached the number first. Students only; first name + initial.
create or replace function public.invite_board() returns table (
  rank int, user_id uuid, name text, school text, invites int, points int, is_me boolean)
language sql stable security definer set search_path = public as $$
  with c as (select * from public.referral_contest where id = 1),
  r as (
    select f.referrer_id, count(*)::int as n, max(f.created_at) as last_at
    from public.referrals f
    join public.profile_phones ph on ph.user_id = f.referred_id
    cross join c
    where f.status = 'ok'
      and (c.starts_at is null or f.created_at >= c.starts_at)
      and (c.ends_at   is null or f.created_at <= c.ends_at)
    group by f.referrer_id
  )
  select (row_number() over (order by r.n desc, r.last_at asc))::int,
         p.id,
         trim(split_part(trim(p.full_name), ' ', 1)
              || coalesce(' ' || nullif(left(split_part(trim(p.full_name), ' ', 2), 1), '') || '.', '')),
         p.school,
         r.n,
         r.n * (select points_per_invite from c),
         p.id = auth.uid()
  from r join public.profiles p on p.id = r.referrer_id
  where auth.uid() is not null and p.role = 'student'
  order by 1
  limit 100
$$;
revoke all on function public.invite_board() from public, anon;
grant execute on function public.invite_board() to authenticated;

-- The people you invited (first name + initial) and whether each one counts.
create or replace function public.my_referrals() returns table (name text, joined_at timestamptz, state text)
language sql stable security definer set search_path = public as $$
  select trim(split_part(trim(p.full_name), ' ', 1)
              || coalesce(' ' || nullif(left(split_part(trim(p.full_name), ' ', 2), 1), '') || '.', '')),
         f.created_at,
         case when f.status = 'rejected' then 'rejected'
              when not exists (select 1 from public.profile_phones ph where ph.user_id = f.referred_id) then 'no_phone'
              when (select (starts_at is not null and f.created_at < starts_at) or (ends_at is not null and f.created_at > ends_at) from public.referral_contest where id = 1) then 'outside'
              else 'ok' end
  from public.referrals f join public.profiles p on p.id = f.referred_id
  where f.referrer_id = auth.uid()
  order by f.created_at desc
$$;
revoke all on function public.my_referrals() from public, anon;
grant execute on function public.my_referrals() to authenticated;

-- ---------- Live updates: "Ahmed just joined with your link!" ----------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.referrals; exception when duplicate_object then null; end;
  end if;
end $$;
