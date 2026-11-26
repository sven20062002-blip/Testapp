-- Assertion tests for supabase/migrations/20261126000000_social.sql
-- Run via scripts/test-sql.sh (throwaway local cluster with supabase/test/auth_stub.sql).
\set ON_ERROR_STOP on
set client_min_messages = warning;
\o /dev/null

-- ---------- helpers (session-local) ----------
create function pg_temp.ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'ASSERTION FAILED: %', msg; end if;
end $$;

-- run SQL and expect an error whose message equals (or, for constraint errors, contains) `expected`
create function pg_temp.fails(stmt text, expected text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    if sqlerrm = expected or position(expected in sqlerrm) > 0 then return; end if;
    raise exception 'EXPECTED ERROR "%" FOR [%] BUT GOT "%"', expected, stmt, sqlerrm;
  end;
  raise exception 'EXPECTED ERROR "%" FOR [%] BUT IT SUCCEEDED', expected, stmt;
end $$;

-- switch identity: pg_temp.as_user(uuid) ; superuser: reset role
create function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), false);
end $$;

grant execute on all functions in schema pg_temp to authenticated, anon;

-- ---------- fixtures (as superuser) ----------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com'),
  ('00000000-0000-0000-0000-00000000000c', 'carol@example.com'),
  ('00000000-0000-0000-0000-00000000000d', 'dave@example.com');

\set A '''00000000-0000-0000-0000-00000000000a'''
\set B '''00000000-0000-0000-0000-00000000000b'''
\set C '''00000000-0000-0000-0000-00000000000c'''
\set D '''00000000-0000-0000-0000-00000000000d'''

-- =========================================================
-- anon can do nothing
-- =========================================================
set role anon;
select pg_temp.as_user(null);
select pg_temp.fails('select * from public.profiles', 'permission denied');
select pg_temp.fails('select public.feed()', 'permission denied');
reset role;

-- =========================================================
-- profiles
-- =========================================================
set role authenticated;
select pg_temp.fails('select public.list_friends()', 'not_authenticated');

select pg_temp.as_user(:A);
insert into public.profiles (id, username, display_name, color) values (:A, 'alice', 'Alice', '#FF5A5F');
select pg_temp.fails($$insert into public.profiles (id, username, display_name) values ('00000000-0000-0000-0000-00000000000b', 'bobfake', 'x')$$, 'row-level security');
select pg_temp.as_user(:B);
insert into public.profiles (id, username, display_name) values (:B, 'bob', 'Bob');
select pg_temp.fails($$insert into public.profiles (id, username, display_name) values ('00000000-0000-0000-0000-00000000000b', 'bob2', 'Bob')$$, 'duplicate key');
select pg_temp.as_user(:C);
select pg_temp.fails($$insert into public.profiles (id, username, display_name) values ('00000000-0000-0000-0000-00000000000c', 'Bob', 'C')$$, 'profiles_username_check');
select pg_temp.fails($$insert into public.profiles (id, username, display_name) values ('00000000-0000-0000-0000-00000000000c', 'bob', 'C')$$, 'duplicate key');
select pg_temp.fails($$insert into public.profiles (id, username, display_name) values ('00000000-0000-0000-0000-00000000000c', 'ca', 'C')$$, 'profiles_username_check');
select pg_temp.fails($$insert into public.profiles (id, username, display_name, color) values ('00000000-0000-0000-0000-00000000000c', 'carol', 'C', 'red')$$, 'profiles_color_check');
insert into public.profiles (id, username, display_name) values (:C, 'carol', 'Carol');
update public.profiles set display_name = 'Hacked' where id = :A;
select pg_temp.ok((select display_name from public.profiles where id = :A) = 'Alice', 'cannot update other profile');
select pg_temp.ok((select count(*) from public.profiles) = 3, 'profiles readable by authenticated');
reset role;

-- =========================================================
-- friendships
-- =========================================================
set role authenticated;
select pg_temp.as_user(:A);
select pg_temp.fails($$select public.send_friend_request('alice')$$, 'self');
select pg_temp.fails($$select public.send_friend_request('nobody')$$, 'not_found');
select public.send_friend_request('Bob ');          -- case/whitespace tolerant
select pg_temp.fails($$select public.send_friend_request('bob')$$, 'already_requested');
select pg_temp.ok((select direction from public.list_friends() where username = 'bob') = 'outgoing', 'outgoing request listed');
select pg_temp.fails($$insert into public.friendships (requester, addressee, status) values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c', 'accepted')$$, 'permission denied');

select pg_temp.as_user(:B);
select pg_temp.ok((select direction from public.list_friends() where username = 'alice') = 'incoming', 'incoming request listed');
-- respond as addressee (Bob) – accept
select public.respond_friend_request((select friendship_id from public.list_friends() where username = 'alice'), true);
select pg_temp.ok((select direction from public.list_friends() where username = 'alice') = 'friend', 'accepted');
select pg_temp.fails($$select public.send_friend_request('alice')$$, 'already_friends');

-- reverse request auto-accepts: Carol → Bob, then Bob → Carol
select pg_temp.as_user(:C);
select public.send_friend_request('bob');
select pg_temp.as_user(:B);
select public.send_friend_request('carol');
select pg_temp.ok((select status from public.list_friends() where username = 'carol') = 'accepted', 'reverse request auto-accepted');
-- Alice and Carol are NOT friends
select pg_temp.as_user(:A);
select pg_temp.ok(not exists (select 1 from public.list_friends() where username = 'carol'), 'alice-carol not friends');
-- addressee-only response
select pg_temp.as_user(:A);
select public.send_friend_request('carol');
select pg_temp.fails($$select public.respond_friend_request((select friendship_id from public.list_friends() where username = 'carol'), true)$$, 'not_found');
-- Carol declines → row deleted
select pg_temp.as_user(:C);
select public.respond_friend_request((select friendship_id from public.list_friends() where username = 'alice'), false);
select pg_temp.ok(not exists (select 1 from public.list_friends() where username = 'alice'), 'declined request removed');
reset role;

-- =========================================================
-- workout summaries + RLS
-- =========================================================
set role authenticated;
select pg_temp.as_user(:A);
insert into public.workout_summaries (id, name, started_at, ended_at, duration_sec, total_volume, total_sets, total_reps, pr_count)
values ('10000000-0000-0000-0000-000000000001', 'Push Day', now() - interval '2 days 1 hour', now() - interval '2 days', 3600, 5000, 15, 120, 1),
       ('10000000-0000-0000-0000-000000000002', 'Alt', now() - interval '20 days 1 hour', now() - interval '20 days', 3000, 9999, 10, 80, 0);
insert into public.exercise_summaries (workout_id, exercise_key, exercise_name, performed_at, sets, reps, volume, top_weight, top_weight_reps, best_e1rm)
values ('10000000-0000-0000-0000-000000000001', 'ex-bench-press', 'Bankdrücken', now() - interval '2 days', 4, 32, 2400, 80, 8, 101.3),
       ('10000000-0000-0000-0000-000000000001', 'ex-squat', 'Kniebeugen', now() - interval '2 days', 3, 15, 1500, 100, 5, 116.7),
       ('10000000-0000-0000-0000-000000000002', 'ex-bench-press', 'Bankdrücken', now() - interval '20 days', 4, 20, 2000, 90, 3, 99);
-- cannot write for someone else
select pg_temp.fails($$insert into public.workout_summaries (id, user_id, started_at, ended_at) values ('10000000-0000-0000-0000-0000000000ff', '00000000-0000-0000-0000-00000000000b', now(), now())$$, 'row-level security');
select pg_temp.fails($$insert into public.exercise_summaries (workout_id, user_id, exercise_key, performed_at) values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', 'x', now())$$, 'row-level security');

select pg_temp.as_user(:B);
insert into public.workout_summaries (id, name, started_at, ended_at, duration_sec, total_volume, total_sets, total_reps, pr_count)
values ('20000000-0000-0000-0000-000000000001', 'Bob Day', now() - interval '1 day 1 hour', now() - interval '1 day', 4000, 7000, 20, 150, 2);
insert into public.exercise_summaries (workout_id, exercise_key, exercise_name, performed_at, sets, reps, volume, top_weight, top_weight_reps, best_e1rm)
values ('20000000-0000-0000-0000-000000000001', 'ex-bench-press', 'Bankdrücken', now() - interval '1 day', 5, 25, 2600, 85, 5, 99.2);
-- Bob cannot attach an exercise summary to Alice's workout
select pg_temp.fails($$insert into public.exercise_summaries (workout_id, exercise_key, performed_at) values ('10000000-0000-0000-0000-000000000001', 'ex-x', now())$$, 'row-level security');
-- Bob (friend) sees Alice's workouts
select pg_temp.ok((select count(*) from public.workout_summaries where user_id = :A) = 2, 'friend sees workouts');
select pg_temp.ok((select count(*) from public.exercise_summaries where user_id = :A) = 3, 'friend sees exercise summaries');
-- Bob cannot modify Alice's data (0 rows)
update public.workout_summaries set name = 'x' where user_id = :A;
delete from public.workout_summaries where user_id = :A;

select pg_temp.as_user(:C);
select pg_temp.ok((select count(*) from public.workout_summaries where user_id = :A) = 0, 'non-friend cannot see workouts');
select pg_temp.ok((select count(*) from public.exercise_summaries where user_id = :A) = 0, 'non-friend cannot see exercise summaries');
select pg_temp.ok((select count(*) from public.workout_summaries where user_id = :B) = 1, 'carol sees friend bob');
reset role;
select pg_temp.ok((select count(*) from public.workout_summaries where user_id = :A and name = 'Push Day') = 1, 'alice data untouched');

-- share_workouts=false hides from friends
set role authenticated;
select pg_temp.as_user(:A);
update public.profiles set share_workouts = false where id = :A;
select pg_temp.as_user(:B);
select pg_temp.ok((select count(*) from public.workout_summaries where user_id = :A) = 0, 'not shared → hidden');
select pg_temp.ok(not exists (select 1 from public.feed() where username = 'alice'), 'not shared → not in feed');
select pg_temp.as_user(:A);
select pg_temp.ok((select count(*) from public.feed() where is_me) = 2, 'own workouts always in own feed');
update public.profiles set share_workouts = true where id = :A;
reset role;

-- =========================================================
-- feed + reactions
-- =========================================================
set role authenticated;
select pg_temp.as_user(:B);
select pg_temp.ok((select count(*) from public.feed()) = 3, 'bob feed: own + alice');
select pg_temp.ok((select workout_id from public.feed() limit 1) = '20000000-0000-0000-0000-000000000001', 'feed newest first');
select pg_temp.ok((select jsonb_array_length(top_exercises) from public.feed() where workout_id = '10000000-0000-0000-0000-000000000001') = 2, 'top exercises');
select pg_temp.ok((select top_exercises->0->>'name' from public.feed() where workout_id = '10000000-0000-0000-0000-000000000001') = 'Bankdrücken', 'top exercises sorted by volume');
insert into public.reactions (workout_id, emoji) values ('10000000-0000-0000-0000-000000000001', '🔥');
select pg_temp.fails($$insert into public.reactions (workout_id, emoji) values ('10000000-0000-0000-0000-000000000002', '❤️')$$, 'reactions_emoji_check');
select pg_temp.ok((select my_reaction from public.feed() where workout_id = '10000000-0000-0000-0000-000000000001') = '🔥', 'my reaction');
select pg_temp.ok((select (reactions->>'🔥')::int from public.feed() where workout_id = '10000000-0000-0000-0000-000000000001') = 1, 'reaction counts');
select pg_temp.ok((select count(*) from public.feed(1)) = 1, 'feed limit');
select pg_temp.ok((select count(*) from public.feed(30, now() - interval '10 days')) = 1, 'feed before_ts');
select pg_temp.as_user(:C);
-- Carol cannot react to Alice's (invisible) workout
select pg_temp.fails($$insert into public.reactions (workout_id, emoji) values ('10000000-0000-0000-0000-000000000001', '💪')$$, 'row-level security');
select pg_temp.ok((select count(*) from public.reactions) = 0, 'carol cannot see reactions on invisible workouts');
select pg_temp.ok((select count(*) from public.feed()) = 1, 'carol feed: only bob');
reset role;

-- =========================================================
-- leaderboards
-- =========================================================
set role authenticated;
select pg_temp.as_user(:B);
select pg_temp.fails($$select * from public.leaderboard('ex-bench-press', 'volume')$$, 'invalid_metric');
select pg_temp.ok((select count(*) from public.leaderboard('ex-bench-press', 'e1rm')) = 2, 'e1rm board: bob + alice (carol has no data)');
select pg_temp.ok((select username from public.leaderboard('ex-bench-press', 'e1rm') limit 1) = 'alice', 'alice best e1rm');
select pg_temp.ok((select value from public.leaderboard('ex-bench-press', 'e1rm') limit 1) = 101.3, 'best e1rm value');
select pg_temp.ok((select value from public.leaderboard('ex-bench-press', 'max_weight') where username = 'alice') = 90, 'max weight all time');
select pg_temp.ok((select reps from public.leaderboard('ex-bench-press', 'max_weight') where username = 'alice') = 3, 'max weight reps');
select pg_temp.ok((select value from public.leaderboard('ex-bench-press', 'max_weight', now() - interval '7 days') where username = 'alice') = 80, 'since filter');
select pg_temp.ok((select count(*) from public.volume_leaderboard(now() - interval '7 days')) = 3, 'volume board: bob, alice, carol (0)');
select pg_temp.ok((select username from public.volume_leaderboard(now() - interval '7 days') limit 1) = 'bob', 'bob leads weekly volume');
select pg_temp.ok((select volume from public.volume_leaderboard(now() - interval '7 days') where username = 'alice') = 5000, 'alice weekly volume excludes older workout');
select pg_temp.as_user(:C);
select pg_temp.ok(not exists (select 1 from public.leaderboard('ex-bench-press', 'e1rm') where username = 'alice'), 'non-friend not on board');
select pg_temp.ok(not exists (select 1 from public.volume_leaderboard(now() - interval '7 days') where username = 'alice'), 'non-friend not on volume board');
reset role;

-- =========================================================
-- challenges
-- =========================================================
set role authenticated;
select pg_temp.as_user(:B);
select pg_temp.fails($$select public.create_challenge('X', 'e1rm', null, null, now() - interval '7 days', now() + interval '1 day', '{}')$$, 'exercise_required');
select pg_temp.fails($$select public.create_challenge('X', 'speed', null, null, now() - interval '7 days', now() + interval '1 day', '{}')$$, 'invalid_metric');
select pg_temp.fails($$select public.create_challenge('X', 'volume', null, null, now(), now() + interval '100 days', '{}')$$, 'invalid_period');
select pg_temp.fails($$select public.create_challenge('', 'volume', null, null, now(), now() + interval '1 day', '{}')$$, 'invalid_title');
select pg_temp.as_user(:A);
-- Alice cannot invite Carol (not friends)
select pg_temp.fails($$select public.create_challenge('Bench Week', 'e1rm', 'ex-bench-press', 'Bankdrücken', now() - interval '7 days', now() + interval '1 day', array['00000000-0000-0000-0000-00000000000c']::uuid[])$$, 'not_friends');
reset role;

-- volume challenge (all exercises) for the last 7 days: Alice vs Bob
set role authenticated;
select pg_temp.as_user(:A);
select public.create_challenge('Volumen-Woche', 'volume', null, null, now() - interval '7 days', now() + interval '1 day', array['00000000-0000-0000-0000-00000000000b']::uuid[]) as cid \gset
select pg_temp.ok((select count(*) from public.challenge_scores(:'cid')) = 2, 'two members');
select pg_temp.ok((select score from public.challenge_scores(:'cid') where username = 'bob') is null, 'invited member has no score');
select pg_temp.ok((select rank from public.challenge_scores(:'cid') where username = 'alice') = 1, 'alice ranked 1 alone');
select pg_temp.ok((select score from public.challenge_scores(:'cid') where username = 'alice') = 5000, 'older workout outside period excluded');
select pg_temp.as_user(:C);
select pg_temp.fails(format('select * from public.challenge_scores(%L)', :'cid'), 'not_member');
select pg_temp.ok((select count(*) from public.challenges) = 0, 'carol cannot see challenge');
select pg_temp.as_user(:B);
select pg_temp.ok((select my_status from public.my_challenges() where id = :'cid') = 'invited', 'bob sees invite');
select public.respond_challenge(:'cid', true);
select pg_temp.fails(format('select public.respond_challenge(%L, true)', :'cid'), 'not_invited');
select pg_temp.ok((select username from public.challenge_scores(:'cid') where rank = 1) = 'bob', 'bob leads after joining');
select pg_temp.ok((select score from public.challenge_scores(:'cid') where username = 'bob') = 7000, 'bob volume score');
select pg_temp.ok((select my_rank from public.my_challenges() where id = :'cid') = 1, 'my_challenges rank');
select pg_temp.ok((select leader_username from public.my_challenges() where id = :'cid') = 'bob', 'my_challenges leader');
select pg_temp.ok((select members from public.my_challenges() where id = :'cid') = 2, 'my_challenges members');
reset role;

-- per-metric scores on one exercise
set role authenticated;
select pg_temp.as_user(:A);
select public.create_challenge('Bench Max', 'max_weight', 'ex-bench-press', 'Bankdrücken', now() - interval '30 days', now() + interval '1 day', array['00000000-0000-0000-0000-00000000000b']::uuid[]) as c_max \gset
select public.create_challenge('Bench 1RM', 'e1rm', 'ex-bench-press', 'Bankdrücken', now() - interval '7 days', now() + interval '1 day', array['00000000-0000-0000-0000-00000000000b']::uuid[]) as c_e1rm \gset
select public.create_challenge('Workouts', 'workouts', null, null, now() - interval '30 days', now() + interval '1 day', '{}') as c_w \gset
select public.create_challenge('Bench sets', 'sets', 'ex-bench-press', null, now() - interval '30 days', now() + interval '1 day', '{}') as c_s \gset
select public.create_challenge('Bench volume', 'volume', 'ex-bench-press', null, now() - interval '7 days', now() + interval '1 day', '{}') as c_v \gset
select pg_temp.ok((select score from public.challenge_scores(:'c_max') where is_me) = 90, 'max_weight within 30 days');
select pg_temp.ok((select score from public.challenge_scores(:'c_e1rm') where is_me) = 101.3, 'e1rm within 7 days');
select pg_temp.ok((select score from public.challenge_scores(:'c_w') where is_me) = 2, 'workouts count');
select pg_temp.ok((select score from public.challenge_scores(:'c_s') where is_me) = 8, 'sets on exercise');
select pg_temp.ok((select score from public.challenge_scores(:'c_v') where is_me) = 2400, 'exercise volume within period');
-- leave: invited member leaves, creator leaving deletes
select pg_temp.as_user(:B);
select public.respond_challenge(:'c_max', false);
select pg_temp.ok(not exists (select 1 from public.my_challenges() where id = :'c_max'), 'declined hidden');
select pg_temp.as_user(:A);
select pg_temp.ok((select count(*) from public.challenge_scores(:'c_max')) = 1, 'declined not listed');
select public.leave_challenge(:'c_w');
select pg_temp.ok(not exists (select 1 from public.my_challenges() where id = :'c_w'), 'creator leave deletes');
select pg_temp.fails($$insert into public.challenges (creator, title, metric, starts_at, ends_at) values ('00000000-0000-0000-0000-00000000000a', 'x', 'volume', now(), now() + interval '1 day')$$, 'permission denied');
reset role;

-- =========================================================
-- duels
-- =========================================================
set role authenticated;
select pg_temp.as_user(:A);
select pg_temp.fails($$select public.create_duel('00000000-0000-0000-0000-00000000000c', null, null, 'volume', 30)$$, 'not_friends');
select pg_temp.fails($$select public.create_duel('00000000-0000-0000-0000-00000000000a', null, null, 'volume', 30)$$, 'self');
select pg_temp.fails($$select public.create_duel('00000000-0000-0000-0000-00000000000b', null, null, 'volume', 2)$$, 'invalid_duration');
select pg_temp.fails($$select public.create_duel('00000000-0000-0000-0000-00000000000b', null, null, 'weight', 30)$$, 'invalid_metric');
select public.create_duel(:B, 'ex-bench-press', 'Bankdrücken', 'volume', 30) as duel \gset
select pg_temp.fails($$select public.create_duel('00000000-0000-0000-0000-00000000000b', null, null, 'volume', 30)$$, 'duel_exists');
-- pending duel: no sets allowed
select pg_temp.fails(format($$insert into public.duel_sets (duel_id, exercise_key, weight, reps) values (%L, 'ex-bench-press', 60, 10)$$, :'duel'), 'row-level security');
-- only the opponent can accept
select pg_temp.fails(format('select public.respond_duel(%L, true)', :'duel'), 'not_found');
select pg_temp.as_user(:B);
select pg_temp.ok((select status from public.my_duels() where id = :'duel') = 'pending', 'bob sees pending duel');
select public.respond_duel(:'duel', true);
select pg_temp.ok((select status from public.my_duels() where id = :'duel') = 'active', 'duel active');
insert into public.duel_sets (duel_id, exercise_key, exercise_name, weight, reps) values (:'duel', 'ex-bench-press', 'Bankdrücken', 70, 10);
-- wrong exercise rejected
select pg_temp.fails(format($$insert into public.duel_sets (duel_id, exercise_key, weight, reps) values (%L, 'ex-squat', 100, 5)$$, :'duel'), 'row-level security');
-- cannot log a set as the other player
select pg_temp.fails(format($$insert into public.duel_sets (duel_id, user_id, exercise_key, weight, reps) values (%L, '00000000-0000-0000-0000-00000000000a', 'ex-bench-press', 500, 50)$$, :'duel'), 'row-level security');
select pg_temp.as_user(:A);
insert into public.duel_sets (duel_id, exercise_key, weight, reps) values (:'duel', 'ex-bench-press', 80, 8);
insert into public.duel_sets (duel_id, exercise_key, weight, reps) values (:'duel', 'ex-bench-press', 80, 6);
select pg_temp.ok((select score from public.duel_scores(:'duel') where is_me) = 1120, 'alice duel score');
select pg_temp.ok((select score from public.duel_scores(:'duel') where not is_me) = 700, 'bob duel score');
select pg_temp.ok((select sets from public.duel_scores(:'duel') where is_me) = 2, 'set count');
select pg_temp.ok((select my_score from public.my_duels() where id = :'duel') = 1120 and (select opponent_score from public.my_duels() where id = :'duel') = 700, 'my_duels scores');
select pg_temp.ok((select count(*) from public.duel_sets where duel_id = :'duel') = 3, 'participant sees all duel sets');
-- close before end is a no-op
select public.close_duel(:'duel');
select pg_temp.ok((select status from public.my_duels() where id = :'duel') = 'active', 'close before end keeps active');
select pg_temp.as_user(:C);
select pg_temp.ok((select count(*) from public.duel_sets) = 0 and (select count(*) from public.duels) = 0, 'outsider sees no duels');
select pg_temp.fails(format('select * from public.duel_scores(%L)', :'duel'), 'not_found');
select pg_temp.fails(format('select public.close_duel(%L)', :'duel'), 'not_found');
reset role;

-- time runs out (simulate as superuser)
update public.duels set started_at = now() - interval '40 minutes', ends_at = now() - interval '10 minutes' where id = :'duel';
set role authenticated;
select pg_temp.as_user(:A);
select pg_temp.ok((select status from public.my_duels() where id = :'duel') = 'finished', 'reported finished after end');
select pg_temp.fails(format($$insert into public.duel_sets (duel_id, exercise_key, weight, reps) values (%L, 'ex-bench-press', 80, 8)$$, :'duel'), 'row-level security');
select public.close_duel(:'duel');
select public.close_duel(:'duel'); -- idempotent
select pg_temp.ok((select status from public.duels where id = :'duel') = 'finished', 'closed');
-- a new duel is possible again; cancel works
select public.create_duel(:B, null, null, 'reps', 10) as duel2 \gset
select public.cancel_duel(:'duel2');
select pg_temp.ok((select status from public.duels where id = :'duel2') = 'cancelled', 'cancelled');
select pg_temp.fails($$update public.duels set status = 'active'$$, 'permission denied');
reset role;

-- reps duel scoring
set role authenticated;
select pg_temp.as_user(:B);
select public.create_duel(:A, null, null, 'reps', 15) as duel3 \gset
select pg_temp.as_user(:A);
select public.respond_duel(:'duel3', true);
insert into public.duel_sets (duel_id, exercise_key, weight, reps) values (:'duel3', 'ex-squat', 100, 5), (:'duel3', 'ex-pull-up', 0, 12);
select pg_temp.ok((select score from public.duel_scores(:'duel3') where is_me) = 17, 'reps duel counts reps, any exercise');
reset role;

-- =========================================================
-- remove friend → visibility gone
-- =========================================================
set role authenticated;
select pg_temp.as_user(:B);
select public.remove_friend(:C);
select pg_temp.ok(not exists (select 1 from public.list_friends() where username = 'carol'), 'friend removed');
select pg_temp.as_user(:C);
select pg_temp.ok((select count(*) from public.workout_summaries where user_id = :B) = 0, 'ex-friend cannot see workouts');
reset role;

-- =========================================================
-- privacy: delete data / account
-- =========================================================
set role authenticated;
select pg_temp.as_user(:B);
select public.delete_my_social_data();
reset role;
select pg_temp.ok(not exists (select 1 from public.profiles where id = :B), 'bob profile gone');
select pg_temp.ok((select count(*) from public.workout_summaries where user_id = :B) = 0, 'bob workouts gone');
select pg_temp.ok((select count(*) from public.reactions where user_id = :B) = 0, 'bob reactions gone');
select pg_temp.ok((select count(*) from public.duels where :B in (challenger, opponent)) = 0, 'bob duels gone');
select pg_temp.ok((select count(*) from public.friendships where :B in (requester, addressee)) = 0, 'bob friendships gone');
select pg_temp.ok(exists (select 1 from auth.users where id = :B), 'bob auth account kept');
select pg_temp.ok((select count(*) from public.workout_summaries where user_id = :A) = 2, 'alice data untouched by bob deletion');

set role authenticated;
select pg_temp.as_user(:A);
select public.delete_my_account();
reset role;
select pg_temp.ok(not exists (select 1 from auth.users where id = :A), 'alice auth user deleted');
select pg_temp.ok(not exists (select 1 from public.profiles where id = :A), 'alice profile gone');
select pg_temp.ok((select count(*) from public.workout_summaries where user_id = :A) = 0, 'alice workouts gone');
select pg_temp.ok((select count(*) from public.challenges) = 0, 'alice challenges gone');

-- =========================================================
-- catalogue checks: RLS everywhere, realtime publication, no anon grants
-- =========================================================
select pg_temp.ok((select bool_and(c.relrowsecurity) from pg_class c join pg_namespace n on n.oid = c.relnamespace
                   where n.nspname = 'public' and c.relkind = 'r'), 'RLS enabled on every public table');
select pg_temp.ok((select count(*) from pg_publication_tables where pubname = 'supabase_realtime'
                   and tablename in ('duel_sets', 'duels', 'friendships', 'challenge_members', 'reactions')) = 5, 'realtime publication');
select pg_temp.ok(not has_function_privilege('anon', 'public.feed(integer, timestamptz)', 'execute'), 'anon cannot call RPCs');
select pg_temp.ok(not has_function_privilege('authenticated', 'public._challenge_member_score(uuid, uuid)', 'execute'), 'internal helpers hidden');
select pg_temp.ok(not has_table_privilege('authenticated', 'public.friendships', 'insert'), 'friendships not directly writable');

\o
\echo 'all assertions ok'
