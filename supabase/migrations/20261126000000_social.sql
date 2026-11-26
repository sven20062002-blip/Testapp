-- =====================================================================
-- Forge Social – Supabase migration
-- Contract: docs/SOCIAL_SCHEMA.md
--
-- Run once in the Supabase SQL editor (safe to run again).
-- Security model:
--   * Row Level Security on every table. The public "anon" key can do nothing.
--   * Signed-in users can only write their own rows; friendships, challenges and
--     duels are changed exclusively through the RPC functions below, which
--     validate every input and check friendship.
--   * Leaderboards, feed and challenge scores only ever contain the caller and
--     accepted friends who share their workouts. E-mail addresses are never exposed.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 40),
  color text not null default '#CDFF40' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  share_workouts boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester uuid not null references public.profiles (id) on delete cascade,
  addressee uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (requester <> addressee)
);
create unique index if not exists friendships_pair_uq
  on public.friendships (least(requester, addressee), greatest(requester, addressee));
create index if not exists friendships_requester_idx on public.friendships (requester);
create index if not exists friendships_addressee_idx on public.friendships (addressee);

create table if not exists public.workout_summaries (
  id uuid primary key,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null default '' check (char_length(name) <= 80),
  started_at timestamptz not null,
  ended_at timestamptz not null,
  duration_sec integer not null default 0 check (duration_sec >= 0),
  total_volume numeric not null default 0 check (total_volume >= 0),
  total_sets integer not null default 0 check (total_sets >= 0),
  total_reps integer not null default 0 check (total_reps >= 0),
  pr_count integer not null default 0 check (pr_count >= 0),
  created_at timestamptz not null default now(),
  check (ended_at >= started_at)
);
create index if not exists workout_summaries_user_idx on public.workout_summaries (user_id, ended_at desc);
create index if not exists workout_summaries_ended_idx on public.workout_summaries (ended_at desc);

create table if not exists public.exercise_summaries (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workout_summaries (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  exercise_key text not null check (char_length(exercise_key) between 1 and 80),
  exercise_name text not null default '' check (char_length(exercise_name) <= 80),
  performed_at timestamptz not null,
  sets integer not null default 0 check (sets >= 0),
  reps integer not null default 0 check (reps >= 0),
  volume numeric not null default 0 check (volume >= 0),
  top_weight numeric check (top_weight is null or top_weight >= 0),
  top_weight_reps integer check (top_weight_reps is null or top_weight_reps >= 0),
  best_e1rm numeric check (best_e1rm is null or best_e1rm >= 0),
  unique (workout_id, exercise_key)
);
create index if not exists exercise_summaries_user_key_idx on public.exercise_summaries (user_id, exercise_key, performed_at);
create index if not exists exercise_summaries_key_idx on public.exercise_summaries (exercise_key, performed_at);

create table if not exists public.reactions (
  workout_id uuid not null references public.workout_summaries (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  emoji text not null check (emoji in ('💪', '🔥', '👏', '🏆')),
  created_at timestamptz not null default now(),
  primary key (workout_id, user_id)
);
create index if not exists reactions_user_idx on public.reactions (user_id);

create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  creator uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 60),
  metric text not null check (metric in ('volume', 'e1rm', 'max_weight', 'workouts', 'sets')),
  exercise_key text check (exercise_key is null or char_length(exercise_key) between 1 and 80),
  exercise_name text check (exercise_name is null or char_length(exercise_name) <= 80),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (ends_at - starts_at <= interval '90 days'),
  check (metric not in ('e1rm', 'max_weight') or exercise_key is not null)
);
create index if not exists challenges_creator_idx on public.challenges (creator);

create table if not exists public.challenge_members (
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'invited' check (status in ('invited', 'joined', 'declined')),
  joined_at timestamptz,
  primary key (challenge_id, user_id)
);
create index if not exists challenge_members_user_idx on public.challenge_members (user_id);

create table if not exists public.duels (
  id uuid primary key default gen_random_uuid(),
  challenger uuid not null references public.profiles (id) on delete cascade,
  opponent uuid not null references public.profiles (id) on delete cascade,
  exercise_key text check (exercise_key is null or char_length(exercise_key) between 1 and 80),
  exercise_name text check (exercise_name is null or char_length(exercise_name) <= 80),
  metric text not null default 'volume' check (metric in ('volume', 'reps')),
  duration_min integer not null check (duration_min between 5 and 180),
  status text not null default 'pending' check (status in ('pending', 'active', 'finished', 'declined', 'cancelled')),
  started_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  check (challenger <> opponent)
);
create index if not exists duels_challenger_idx on public.duels (challenger);
create index if not exists duels_opponent_idx on public.duels (opponent);

create table if not exists public.duel_sets (
  id uuid primary key default gen_random_uuid(),
  duel_id uuid not null references public.duels (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  exercise_key text not null check (char_length(exercise_key) between 1 and 80),
  exercise_name text not null default '' check (char_length(exercise_name) <= 80),
  weight numeric not null default 0 check (weight >= 0 and weight <= 1500),
  reps integer not null check (reps between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists duel_sets_duel_idx on public.duel_sets (duel_id, created_at);

-- ---------------------------------------------------------------------
-- Helper functions (used by policies and RPCs)
-- ---------------------------------------------------------------------

create or replace function public.require_uid() returns uuid
language plpgsql stable security definer set search_path = public as $$
declare v uuid := auth.uid();
begin
  if v is null then raise exception 'not_authenticated'; end if;
  return v;
end $$;

create or replace function public.is_friend(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from friendships f
    where f.status = 'accepted'
      and least(f.requester, f.addressee) = least(a, b)
      and greatest(f.requester, f.addressee) = greatest(a, b)
  )
$$;

-- caller may see training data of `owner`: themselves or an accepted friend who shares
create or replace function public.can_see_user(owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    owner = auth.uid()
    or (public.is_friend(auth.uid(), owner)
        and exists (select 1 from profiles p where p.id = owner and p.share_workouts))
  )
$$;

create or replace function public.is_challenge_member(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from challenge_members m where m.challenge_id = cid and m.user_id = auth.uid())
$$;

create or replace function public.is_duel_participant(did uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from duels d where d.id = did and auth.uid() in (d.challenger, d.opponent))
$$;

-- a set may only be logged by a participant of an active, running duel (and for the duel's exercise)
create or replace function public.duel_accepts_set(did uuid, p_exercise_key text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from duels d
    where d.id = did
      and auth.uid() in (d.challenger, d.opponent)
      and d.status = 'active'
      and now() >= d.started_at
      and now() < d.ends_at
      and (d.exercise_key is null or d.exercise_key = p_exercise_key)
  )
$$;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.workout_summaries enable row level security;
alter table public.exercise_summaries enable row level security;
alter table public.reactions enable row level security;
alter table public.challenges enable row level security;
alter table public.challenge_members enable row level security;
alter table public.duels enable row level security;
alter table public.duel_sets enable row level security;

-- profiles: public card for signed-in users; own row writable
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (true);
drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert to authenticated with check (id = auth.uid());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- friendships: read own, write via RPC only
drop policy if exists friendships_select on public.friendships;
create policy friendships_select on public.friendships for select to authenticated
  using (auth.uid() in (requester, addressee));

-- workout summaries
drop policy if exists workouts_select on public.workout_summaries;
create policy workouts_select on public.workout_summaries for select to authenticated using (public.can_see_user(user_id));
drop policy if exists workouts_insert on public.workout_summaries;
create policy workouts_insert on public.workout_summaries for insert to authenticated with check (user_id = auth.uid());
drop policy if exists workouts_update on public.workout_summaries;
create policy workouts_update on public.workout_summaries for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists workouts_delete on public.workout_summaries;
create policy workouts_delete on public.workout_summaries for delete to authenticated using (user_id = auth.uid());

-- exercise summaries
drop policy if exists exsum_select on public.exercise_summaries;
create policy exsum_select on public.exercise_summaries for select to authenticated using (public.can_see_user(user_id));
drop policy if exists exsum_insert on public.exercise_summaries;
create policy exsum_insert on public.exercise_summaries for insert to authenticated
  with check (user_id = auth.uid()
              and exists (select 1 from public.workout_summaries w where w.id = workout_id and w.user_id = auth.uid()));
drop policy if exists exsum_update on public.exercise_summaries;
create policy exsum_update on public.exercise_summaries for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid()
              and exists (select 1 from public.workout_summaries w where w.id = workout_id and w.user_id = auth.uid()));
drop policy if exists exsum_delete on public.exercise_summaries;
create policy exsum_delete on public.exercise_summaries for delete to authenticated using (user_id = auth.uid());

-- reactions: visible/allowed on workouts the caller can see
drop policy if exists reactions_select on public.reactions;
create policy reactions_select on public.reactions for select to authenticated
  using (exists (select 1 from public.workout_summaries w where w.id = workout_id and public.can_see_user(w.user_id)));
drop policy if exists reactions_insert on public.reactions;
create policy reactions_insert on public.reactions for insert to authenticated
  with check (user_id = auth.uid()
              and exists (select 1 from public.workout_summaries w where w.id = workout_id and public.can_see_user(w.user_id)));
drop policy if exists reactions_update on public.reactions;
create policy reactions_update on public.reactions for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid()
              and exists (select 1 from public.workout_summaries w where w.id = workout_id and public.can_see_user(w.user_id)));
drop policy if exists reactions_delete on public.reactions;
create policy reactions_delete on public.reactions for delete to authenticated using (user_id = auth.uid());

-- challenges & members: read for members, write via RPC only
drop policy if exists challenges_select on public.challenges;
create policy challenges_select on public.challenges for select to authenticated using (public.is_challenge_member(id));
drop policy if exists challenge_members_select on public.challenge_members;
create policy challenge_members_select on public.challenge_members for select to authenticated using (public.is_challenge_member(challenge_id));

-- duels: read for participants, write via RPC only
drop policy if exists duels_select on public.duels;
create policy duels_select on public.duels for select to authenticated using (auth.uid() in (challenger, opponent));

-- duel sets: participants read; insert only own sets into a running duel
drop policy if exists duel_sets_select on public.duel_sets;
create policy duel_sets_select on public.duel_sets for select to authenticated using (public.is_duel_participant(duel_id));
drop policy if exists duel_sets_insert on public.duel_sets;
create policy duel_sets_insert on public.duel_sets for insert to authenticated
  with check (user_id = auth.uid() and public.duel_accepts_set(duel_id, exercise_key));

-- ---------------------------------------------------------------------
-- Table privileges (Supabase grants ALL by default – narrow it down)
-- ---------------------------------------------------------------------

revoke all on table public.profiles, public.friendships, public.workout_summaries, public.exercise_summaries,
  public.reactions, public.challenges, public.challenge_members, public.duels, public.duel_sets from anon, authenticated;

grant select, insert, update on table public.profiles to authenticated;
grant select on table public.friendships to authenticated;
grant select, insert, update, delete on table public.workout_summaries to authenticated;
grant select, insert, update, delete on table public.exercise_summaries to authenticated;
grant select, insert, update, delete on table public.reactions to authenticated;
grant select on table public.challenges to authenticated;
grant select on table public.challenge_members to authenticated;
grant select on table public.duels to authenticated;
grant select, insert on table public.duel_sets to authenticated;

-- ---------------------------------------------------------------------
-- Friendship RPCs
-- ---------------------------------------------------------------------

create or replace function public.send_friend_request(target_username text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public.require_uid();
  v_target uuid;
  v_row friendships%rowtype;
  v_id uuid;
begin
  if not exists (select 1 from profiles where id = v_uid) then raise exception 'profile_missing'; end if;
  select id into v_target from profiles where username = lower(btrim(coalesce(target_username, '')));
  if v_target is null then raise exception 'not_found'; end if;
  if v_target = v_uid then raise exception 'self'; end if;

  select * into v_row from friendships f
  where least(f.requester, f.addressee) = least(v_uid, v_target)
    and greatest(f.requester, f.addressee) = greatest(v_uid, v_target);

  if found then
    if v_row.status = 'accepted' then raise exception 'already_friends'; end if;
    if v_row.requester = v_uid then raise exception 'already_requested'; end if;
    -- the target already asked the caller → accept
    update friendships set status = 'accepted', responded_at = now() where id = v_row.id;
    return v_row.id;
  end if;

  insert into friendships (requester, addressee) values (v_uid, v_target) returning id into v_id;
  return v_id;
end $$;

create or replace function public.respond_friend_request(request_id uuid, accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.require_uid();
begin
  if not exists (select 1 from friendships where id = request_id and addressee = v_uid and status = 'pending') then
    raise exception 'not_found';
  end if;
  if coalesce(accept, false) then
    update friendships set status = 'accepted', responded_at = now() where id = request_id;
  else
    delete from friendships where id = request_id;
  end if;
end $$;

create or replace function public.remove_friend(friend_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.require_uid();
begin
  delete from friendships
  where least(requester, addressee) = least(v_uid, friend_id)
    and greatest(requester, addressee) = greatest(v_uid, friend_id);
end $$;

create or replace function public.list_friends()
returns table (friendship_id uuid, user_id uuid, username text, display_name text, color text, status text, direction text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  with me as (select public.require_uid() as id)
  select f.id,
         p.id, p.username, p.display_name, p.color,
         f.status,
         case when f.status = 'accepted' then 'friend'
              when f.addressee = me.id then 'incoming'
              else 'outgoing' end,
         f.created_at
  from friendships f
  cross join me
  join profiles p on p.id = case when f.requester = me.id then f.addressee else f.requester end
  where me.id in (f.requester, f.addressee)
  order by (f.status = 'accepted'), p.display_name
$$;

-- ---------------------------------------------------------------------
-- Feed & leaderboards
-- ---------------------------------------------------------------------

create or replace function public.feed(max_rows integer default 30, before_ts timestamptz default null)
returns table (
  workout_id uuid, user_id uuid, username text, display_name text, color text, name text,
  started_at timestamptz, ended_at timestamptz, duration_sec integer, total_volume numeric,
  total_sets integer, pr_count integer, top_exercises jsonb, reactions jsonb, my_reaction text, is_me boolean
)
language sql stable security definer set search_path = public as $$
  with me as (select public.require_uid() as id)
  select w.id, w.user_id, p.username, p.display_name, p.color, w.name,
         w.started_at, w.ended_at, w.duration_sec, w.total_volume, w.total_sets, w.pr_count,
         coalesce((
           select jsonb_agg(jsonb_build_object('name', t.exercise_name, 'top_weight', t.top_weight,
                                               'top_weight_reps', t.top_weight_reps, 'volume', t.volume)
                            order by t.volume desc)
           from (select e.exercise_name, e.top_weight, e.top_weight_reps, e.volume
                 from exercise_summaries e where e.workout_id = w.id
                 order by e.volume desc limit 3) t
         ), '[]'::jsonb),
         coalesce((
           select jsonb_object_agg(r.emoji, r.c)
           from (select x.emoji, count(*) as c from reactions x where x.workout_id = w.id group by x.emoji) r
         ), '{}'::jsonb),
         (select x.emoji from reactions x where x.workout_id = w.id and x.user_id = me.id),
         w.user_id = me.id
  from workout_summaries w
  join profiles p on p.id = w.user_id
  cross join me
  where (w.user_id = me.id or (p.share_workouts and public.is_friend(me.id, w.user_id)))
    and (before_ts is null or w.ended_at < before_ts)
  order by w.ended_at desc
  limit least(greatest(coalesce(max_rows, 30), 1), 100)
$$;

create or replace function public.leaderboard(p_exercise_key text, p_metric text, p_since timestamptz default null)
returns table (user_id uuid, username text, display_name text, color text, value numeric, reps integer, achieved_at timestamptz, is_me boolean)
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := public.require_uid();
begin
  if p_metric not in ('e1rm', 'max_weight') then raise exception 'invalid_metric'; end if;
  if p_exercise_key is null or btrim(p_exercise_key) = '' then raise exception 'exercise_required'; end if;
  return query
  with people as (
    select p.id, p.username, p.display_name, p.color
    from profiles p
    where p.id = v_uid or (p.share_workouts and public.is_friend(v_uid, p.id))
  ),
  cand as (
    select e.user_id as uid,
           case when p_metric = 'e1rm' then e.best_e1rm else e.top_weight end as val,
           case when p_metric = 'max_weight' then e.top_weight_reps end as rp,
           e.performed_at as at
    from exercise_summaries e
    where e.exercise_key = p_exercise_key
      and (p_since is null or e.performed_at >= p_since)
      and e.user_id in (select id from people)
  ),
  best as (
    select distinct on (c.uid) c.uid, c.val, c.rp, c.at
    from cand c
    where c.val is not null
    order by c.uid, c.val desc, c.rp desc nulls last, c.at asc
  )
  select pe.id, pe.username, pe.display_name, pe.color, b.val, b.rp, b.at, pe.id = v_uid
  from best b join people pe on pe.id = b.uid
  order by b.val desc, b.at asc;
end $$;

create or replace function public.volume_leaderboard(p_since timestamptz)
returns table (user_id uuid, username text, display_name text, color text, volume numeric, workouts integer, sets integer, is_me boolean)
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := public.require_uid();
begin
  if p_since is null then raise exception 'invalid_period'; end if;
  return query
  select p.id, p.username, p.display_name, p.color,
         coalesce(sum(w.total_volume), 0)::numeric,
         count(w.id)::integer,
         coalesce(sum(w.total_sets), 0)::integer,
         p.id = v_uid
  from profiles p
  left join workout_summaries w on w.user_id = p.id and w.ended_at >= p_since
  where p.id = v_uid or (p.share_workouts and public.is_friend(v_uid, p.id))
  group by p.id, p.username, p.display_name, p.color
  order by 5 desc, p.display_name;
end $$;

-- ---------------------------------------------------------------------
-- Challenges
-- ---------------------------------------------------------------------

-- internal: score of one user in one challenge (not exposed to clients)
create or replace function public._challenge_member_score(p_challenge uuid, p_user uuid) returns numeric
language plpgsql stable security definer set search_path = public as $$
declare c challenges%rowtype; v numeric;
begin
  select * into c from challenges where id = p_challenge;
  if not found then return null; end if;
  if c.metric = 'volume' then
    if c.exercise_key is null then
      select coalesce(sum(total_volume), 0) into v from workout_summaries
      where user_id = p_user and ended_at >= c.starts_at and ended_at <= c.ends_at;
    else
      select coalesce(sum(volume), 0) into v from exercise_summaries
      where user_id = p_user and exercise_key = c.exercise_key and performed_at >= c.starts_at and performed_at <= c.ends_at;
    end if;
  elsif c.metric = 'e1rm' then
    select max(best_e1rm) into v from exercise_summaries
    where user_id = p_user and exercise_key = c.exercise_key and performed_at >= c.starts_at and performed_at <= c.ends_at;
  elsif c.metric = 'max_weight' then
    select max(top_weight) into v from exercise_summaries
    where user_id = p_user and exercise_key = c.exercise_key and performed_at >= c.starts_at and performed_at <= c.ends_at;
  elsif c.metric = 'workouts' then
    if c.exercise_key is null then
      select count(*) into v from workout_summaries
      where user_id = p_user and ended_at >= c.starts_at and ended_at <= c.ends_at;
    else
      select count(distinct workout_id) into v from exercise_summaries
      where user_id = p_user and exercise_key = c.exercise_key and performed_at >= c.starts_at and performed_at <= c.ends_at;
    end if;
  elsif c.metric = 'sets' then
    if c.exercise_key is null then
      select coalesce(sum(total_sets), 0) into v from workout_summaries
      where user_id = p_user and ended_at >= c.starts_at and ended_at <= c.ends_at;
    else
      select coalesce(sum(sets), 0) into v from exercise_summaries
      where user_id = p_user and exercise_key = c.exercise_key and performed_at >= c.starts_at and performed_at <= c.ends_at;
    end if;
  end if;
  return v;
end $$;

create or replace function public.create_challenge(
  p_title text, p_metric text, p_exercise_key text, p_exercise_name text,
  p_starts_at timestamptz, p_ends_at timestamptz, p_invitees uuid[]
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public.require_uid();
  v_id uuid;
  v_inv uuid;
  v_key text := nullif(btrim(coalesce(p_exercise_key, '')), '');
begin
  if not exists (select 1 from profiles where id = v_uid) then raise exception 'profile_missing'; end if;
  if p_title is null or char_length(btrim(p_title)) not between 1 and 60 then raise exception 'invalid_title'; end if;
  if p_metric is null or p_metric not in ('volume', 'e1rm', 'max_weight', 'workouts', 'sets') then raise exception 'invalid_metric'; end if;
  if p_metric in ('e1rm', 'max_weight') and v_key is null then raise exception 'exercise_required'; end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at or p_ends_at - p_starts_at > interval '90 days'
     or p_ends_at <= now() then
    raise exception 'invalid_period';
  end if;
  if coalesce(array_length(p_invitees, 1), 0) > 50 then raise exception 'too_many_invitees'; end if;
  foreach v_inv in array coalesce(p_invitees, '{}'::uuid[]) loop
    if v_inv is null or v_inv = v_uid then continue; end if;
    if not public.is_friend(v_uid, v_inv) then raise exception 'not_friends'; end if;
  end loop;

  insert into challenges (creator, title, metric, exercise_key, exercise_name, starts_at, ends_at)
  values (v_uid, btrim(p_title), p_metric, v_key, nullif(btrim(coalesce(p_exercise_name, '')), ''), p_starts_at, p_ends_at)
  returning id into v_id;

  insert into challenge_members (challenge_id, user_id, status, joined_at) values (v_id, v_uid, 'joined', now());
  insert into challenge_members (challenge_id, user_id, status)
  select distinct v_id, i, 'invited' from unnest(coalesce(p_invitees, '{}'::uuid[])) i where i is not null and i <> v_uid
  on conflict do nothing;
  return v_id;
end $$;

create or replace function public.respond_challenge(p_challenge_id uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.require_uid();
begin
  if not exists (select 1 from challenge_members where challenge_id = p_challenge_id and user_id = v_uid and status = 'invited') then
    raise exception 'not_invited';
  end if;
  update challenge_members
  set status = case when coalesce(p_accept, false) then 'joined' else 'declined' end,
      joined_at = case when coalesce(p_accept, false) then now() else null end
  where challenge_id = p_challenge_id and user_id = v_uid;
end $$;

create or replace function public.leave_challenge(p_challenge_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.require_uid();
begin
  if not exists (select 1 from challenge_members where challenge_id = p_challenge_id and user_id = v_uid) then
    raise exception 'not_member';
  end if;
  if exists (select 1 from challenges where id = p_challenge_id and creator = v_uid) then
    delete from challenges where id = p_challenge_id;
  else
    delete from challenge_members where challenge_id = p_challenge_id and user_id = v_uid;
  end if;
end $$;

create or replace function public.challenge_scores(p_challenge_id uuid)
returns table (user_id uuid, username text, display_name text, color text, status text, score numeric, rank integer, is_me boolean)
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := public.require_uid();
begin
  if not exists (select 1 from challenge_members m where m.challenge_id = p_challenge_id and m.user_id = v_uid) then
    raise exception 'not_member';
  end if;
  return query
  with s as (
    select m.user_id as uid, m.status as st,
           case when m.status = 'joined' then public._challenge_member_score(p_challenge_id, m.user_id) end as sc
    from challenge_members m
    where m.challenge_id = p_challenge_id and m.status <> 'declined'
  ),
  r as (
    select s.*, case when s.st = 'joined'
                     then (rank() over (partition by (s.st = 'joined') order by s.sc desc nulls last))::integer end as rk
    from s
  )
  select r.uid, p.username, p.display_name, p.color, r.st, r.sc, r.rk, r.uid = v_uid
  from r join profiles p on p.id = r.uid
  order by r.rk nulls last, p.display_name;
end $$;

create or replace function public.my_challenges()
returns table (
  id uuid, title text, metric text, exercise_key text, exercise_name text, starts_at timestamptz, ends_at timestamptz,
  creator uuid, my_status text, members integer, leader_username text, leader_score numeric, my_score numeric, my_rank integer
)
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := public.require_uid();
begin
  return query
  with mine as (
    select c.*, m.status as my_st
    from challenges c join challenge_members m on m.challenge_id = c.id and m.user_id = v_uid
    where m.status <> 'declined'
  ),
  scored as (
    select mi.id as cid, m.user_id as uid,
           public._challenge_member_score(mi.id, m.user_id) as sc
    from mine mi join challenge_members m on m.challenge_id = mi.id and m.status = 'joined'
  ),
  ranked as (
    select sc2.*, (rank() over (partition by sc2.cid order by sc2.sc desc nulls last))::integer as rk
    from scored sc2
  )
  select mi.id, mi.title, mi.metric, mi.exercise_key, mi.exercise_name, mi.starts_at, mi.ends_at, mi.creator, mi.my_st,
         (select count(*)::integer from challenge_members m2 where m2.challenge_id = mi.id and m2.status <> 'declined'),
         (select p.username from ranked rr join profiles p on p.id = rr.uid
           where rr.cid = mi.id and rr.sc is not null order by rr.rk, p.username limit 1),
         (select rr.sc from ranked rr where rr.cid = mi.id and rr.sc is not null order by rr.rk limit 1),
         (select rr.sc from ranked rr where rr.cid = mi.id and rr.uid = v_uid),
         (select rr.rk from ranked rr where rr.cid = mi.id and rr.uid = v_uid)
  from mine mi
  order by mi.ends_at desc;
end $$;

-- ---------------------------------------------------------------------
-- Live duels
-- ---------------------------------------------------------------------

create or replace function public.create_duel(p_opponent uuid, p_exercise_key text, p_exercise_name text, p_metric text, p_duration_min integer)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public.require_uid();
  v_id uuid;
  v_metric text := coalesce(p_metric, 'volume');
begin
  if p_opponent is null or p_opponent = v_uid then raise exception 'self'; end if;
  if not public.is_friend(v_uid, p_opponent) then raise exception 'not_friends'; end if;
  if v_metric not in ('volume', 'reps') then raise exception 'invalid_metric'; end if;
  if p_duration_min is null or p_duration_min not between 5 and 180 then raise exception 'invalid_duration'; end if;
  if exists (
    select 1 from duels d
    where least(d.challenger, d.opponent) = least(v_uid, p_opponent)
      and greatest(d.challenger, d.opponent) = greatest(v_uid, p_opponent)
      and (d.status = 'pending' or (d.status = 'active' and d.ends_at > now()))
  ) then
    raise exception 'duel_exists';
  end if;
  insert into duels (challenger, opponent, exercise_key, exercise_name, metric, duration_min)
  values (v_uid, p_opponent, nullif(btrim(coalesce(p_exercise_key, '')), ''), nullif(btrim(coalesce(p_exercise_name, '')), ''), v_metric, p_duration_min)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.respond_duel(p_duel_id uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.require_uid();
begin
  if not exists (select 1 from duels where id = p_duel_id and opponent = v_uid and status = 'pending') then
    raise exception 'not_found';
  end if;
  if coalesce(p_accept, false) then
    update duels set status = 'active', started_at = now(), ends_at = now() + make_interval(mins => duration_min)
    where id = p_duel_id;
  else
    update duels set status = 'declined' where id = p_duel_id;
  end if;
end $$;

create or replace function public.cancel_duel(p_duel_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.require_uid();
begin
  if not exists (select 1 from duels where id = p_duel_id and v_uid in (challenger, opponent)) then raise exception 'not_found'; end if;
  update duels set status = 'cancelled' where id = p_duel_id and status in ('pending', 'active');
end $$;

create or replace function public.close_duel(p_duel_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.require_uid();
begin
  if not exists (select 1 from duels where id = p_duel_id and v_uid in (challenger, opponent)) then raise exception 'not_found'; end if;
  -- idempotent: only an active duel whose time is over becomes finished
  update duels set status = 'finished' where id = p_duel_id and status = 'active' and now() >= ends_at;
end $$;

create or replace function public._duel_score(p_duel_id uuid, p_user uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(case when d.metric = 'reps' then s.reps else s.weight * s.reps end), 0)
  from duels d left join duel_sets s on s.duel_id = d.id and s.user_id = p_user
  where d.id = p_duel_id
$$;

create or replace function public.my_duels()
returns table (
  id uuid, challenger uuid, opponent uuid, opponent_username text, opponent_display_name text, opponent_color text,
  exercise_key text, exercise_name text, metric text, duration_min integer, status text,
  started_at timestamptz, ends_at timestamptz, created_at timestamptz, i_am_challenger boolean,
  my_score numeric, opponent_score numeric
)
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := public.require_uid();
begin
  return query
  select d.id, d.challenger, d.opponent, p.username, p.display_name, p.color,
         d.exercise_key, d.exercise_name, d.metric, d.duration_min,
         case when d.status = 'active' and d.ends_at <= now() then 'finished' else d.status end,
         d.started_at, d.ends_at, d.created_at, d.challenger = v_uid,
         public._duel_score(d.id, v_uid),
         public._duel_score(d.id, case when d.challenger = v_uid then d.opponent else d.challenger end)
  from duels d
  join profiles p on p.id = case when d.challenger = v_uid then d.opponent else d.challenger end
  where v_uid in (d.challenger, d.opponent)
  order by d.created_at desc;
end $$;

create or replace function public.duel_scores(p_duel_id uuid)
returns table (user_id uuid, username text, display_name text, color text, score numeric, sets integer, last_set_at timestamptz, is_me boolean)
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := public.require_uid(); d duels%rowtype;
begin
  select * into d from duels where id = p_duel_id;
  if not found or v_uid not in (d.challenger, d.opponent) then raise exception 'not_found'; end if;
  return query
  select p.id, p.username, p.display_name, p.color,
         coalesce(sum(case when d.metric = 'reps' then s.reps else s.weight * s.reps end), 0)::numeric,
         count(s.id)::integer,
         max(s.created_at),
         p.id = v_uid
  from profiles p
  left join duel_sets s on s.duel_id = d.id and s.user_id = p.id
  where p.id in (d.challenger, d.opponent)
  group by p.id, p.username, p.display_name, p.color
  order by 5 desc;
end $$;

-- ---------------------------------------------------------------------
-- Privacy: delete own data / account
-- ---------------------------------------------------------------------

create or replace function public.delete_my_social_data() returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.require_uid();
begin
  delete from reactions where user_id = v_uid;
  delete from duel_sets where user_id = v_uid;
  delete from duels where v_uid in (challenger, opponent);
  delete from challenges where creator = v_uid;
  delete from challenge_members where user_id = v_uid;
  delete from exercise_summaries where user_id = v_uid;
  delete from workout_summaries where user_id = v_uid;
  delete from friendships where v_uid in (requester, addressee);
  delete from profiles where id = v_uid;
end $$;

create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
declare v_uid uuid := public.require_uid();
begin
  perform public.delete_my_social_data();
  delete from auth.users where id = v_uid;
end $$;

-- ---------------------------------------------------------------------
-- Function privileges: nothing for anon / public, RPCs + policy helpers for authenticated
-- ---------------------------------------------------------------------

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig, p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'require_uid', 'is_friend', 'can_see_user', 'is_challenge_member', 'is_duel_participant', 'duel_accepts_set',
      'send_friend_request', 'respond_friend_request', 'remove_friend', 'list_friends', 'feed', 'leaderboard',
      'volume_leaderboard', '_challenge_member_score', 'create_challenge', 'respond_challenge', 'leave_challenge',
      'challenge_scores', 'my_challenges', 'create_duel', 'respond_duel', 'cancel_duel', 'close_duel', '_duel_score',
      'my_duels', 'duel_scores', 'delete_my_social_data', 'delete_my_account')
  loop
    execute format('revoke all on function %s from public, anon', f.sig);
    if f.proname like '\_%' then
      execute format('revoke all on function %s from authenticated', f.sig); -- internal helpers
    else
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Realtime (live duels, friend requests, challenge invites, reactions)
-- ---------------------------------------------------------------------

do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array['duel_sets', 'duels', 'friendships', 'challenge_members', 'reactions'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
