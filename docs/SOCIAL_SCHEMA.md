# heben Social – Server-Vertrag (Supabase / Postgres)

Single source of truth for `supabase/migrations/*.sql` and `src/social/*`.
All functions are `security definer`, `set search_path = public`, granted to `authenticated` only.
`auth.uid()` identifies the caller. Times are `timestamptz`, ids `uuid`.

## Tables

| table | columns | write path | read (RLS) |
|---|---|---|---|
| `profiles` | `id` (pk, = auth.users.id, cascade), `username` text unique `^[a-z0-9_]{3,20}$`, `display_name` text 1–40, `color` text default `'#CDFF40'` (`^#[0-9A-Fa-f]{6}$`), `share_workouts` bool default true, `created_at` | own insert/update | every authenticated user (public card: username, display name, color) |
| `friendships` | `id`, `requester`, `addressee` (→profiles, cascade), `status` `pending`\|`accepted`, `created_at`, `responded_at`; check requester<>addressee; unique unordered pair | RPC only | rows where caller is requester or addressee |
| `workout_summaries` | `id` (pk = local workout id), `user_id` (→profiles, cascade, default auth.uid()), `name`, `started_at`, `ended_at`, `duration_sec` int, `total_volume` numeric, `total_sets` int, `total_reps` int, `pr_count` int, `created_at` | own insert/update/delete (`user_id = auth.uid()`) | own; accepted friends if owner `share_workouts` |
| `exercise_summaries` | `id` default gen_random_uuid(), `workout_id` (→workout_summaries cascade), `user_id` default auth.uid(), `exercise_key` text (seed id like `ex-bench-press` or `custom:<uuid>`), `exercise_name`, `performed_at`, `sets` int, `reps` int, `volume` numeric, `top_weight` numeric null, `top_weight_reps` int null, `best_e1rm` numeric null; unique (workout_id, exercise_key) | own insert/update/delete, workout must belong to caller | same as workout_summaries |
| `reactions` | `workout_id` (→workout_summaries cascade), `user_id` default auth.uid(), `emoji` in (💪 🔥 👏 🏆), `created_at`; pk (workout_id, user_id) | own insert/update/delete, only on workouts the caller can see | anyone who can see the workout |
| `challenges` | `id`, `creator`, `title` 1–60, `metric` in (`volume`,`e1rm`,`max_weight`,`workouts`,`sets`), `exercise_key` null (required for `e1rm`/`max_weight`), `exercise_name` null, `starts_at`, `ends_at` (> starts_at, max 90 days), `created_at` | RPC only | members |
| `challenge_members` | `challenge_id` (cascade), `user_id` (cascade), `status` `invited`\|`joined`\|`declined`, `joined_at`; pk (challenge_id, user_id) | RPC only | members of the same challenge |
| `duels` | `id`, `challenger`, `opponent`, `exercise_key` null (null = all exercises), `exercise_name` null, `metric` `volume`\|`reps`, `duration_min` 5–180, `status` `pending`\|`active`\|`finished`\|`declined`\|`cancelled`, `started_at`, `ends_at`, `created_at` | RPC only | participants |
| `duel_sets` | `id`, `duel_id` (cascade), `user_id` default auth.uid(), `exercise_key`, `exercise_name`, `weight` numeric ≥0, `reps` int 1–1000, `created_at` default now() | own insert only while duel `active` and `now() < ends_at`, caller participant; if duel has `exercise_key`, it must match | participants |

Realtime publication `supabase_realtime`: `duel_sets`, `duels`, `friendships`, `challenge_members`, `reactions`.

## RPC functions

| function | returns | rules / errors (raise exception with these messages) |
|---|---|---|
| `send_friend_request(target_username text)` | `uuid` friendship id | `not_found`, `self`, `already_friends`, `already_requested`; if the target already requested the caller → accept that request instead |
| `respond_friend_request(request_id uuid, accept boolean)` | void | only addressee of a pending request; decline deletes the row |
| `remove_friend(friend_id uuid)` | void | deletes friendship (any status) between caller and friend |
| `list_friends()` | table(`friendship_id`, `user_id`, `username`, `display_name`, `color`, `status`, `direction` `incoming`\|`outgoing`\|`friend`, `created_at`) | all rows involving caller |
| `feed(max_rows int default 30, before_ts timestamptz default null)` | table(`workout_id`, `user_id`, `username`, `display_name`, `color`, `name`, `started_at`, `ended_at`, `duration_sec`, `total_volume`, `total_sets`, `pr_count`, `top_exercises` jsonb [{name,top_weight,top_weight_reps,volume}] max 3 by volume, `reactions` jsonb {emoji:count}, `my_reaction` text, `is_me` bool) | caller + accepted friends who share; newest `ended_at` first |
| `leaderboard(p_exercise_key text, p_metric text, p_since timestamptz default null)` | table(`user_id`, `username`, `display_name`, `color`, `value`, `reps`, `achieved_at`, `is_me`) | metric `e1rm`\|`max_weight`; caller + accepted friends (sharing); best per user, sorted desc |
| `volume_leaderboard(p_since timestamptz)` | table(`user_id`, `username`, `display_name`, `color`, `volume`, `workouts`, `sets`, `is_me`) | sums since p_since; caller + friends; sorted by volume desc; users with 0 included |
| `create_challenge(p_title text, p_metric text, p_exercise_key text, p_exercise_name text, p_starts_at timestamptz, p_ends_at timestamptz, p_invitees uuid[])` | `uuid` | invitees must be accepted friends (`not_friends`), creator joined, invitees `invited`; validation errors `invalid_metric`, `exercise_required`, `invalid_period` |
| `respond_challenge(p_challenge_id uuid, p_accept boolean)` | void | only `invited` member; → `joined`/`declined` |
| `leave_challenge(p_challenge_id uuid)` | void | creator leaving deletes the challenge |
| `my_challenges()` | table(`id`, `title`, `metric`, `exercise_key`, `exercise_name`, `starts_at`, `ends_at`, `creator`, `my_status`, `members` int, `leader_username` text, `leader_score` numeric, `my_score` numeric, `my_rank` int) | challenges where caller is member (not declined) |
| `challenge_scores(p_challenge_id uuid)` | table(`user_id`, `username`, `display_name`, `color`, `status`, `score`, `rank`, `is_me`) | only members; score from caller-independent data within [starts_at, ends_at] (by `performed_at`/`ended_at`): volume = Σ exercise volume (or Σ total_volume if no exercise), e1rm = max best_e1rm, max_weight = max top_weight, workouts = count workouts (that contain the exercise if set), sets = Σ sets; only `joined` members ranked; invited listed with null score |
| `create_duel(p_opponent uuid, p_exercise_key text, p_exercise_name text, p_metric text, p_duration_min int)` | `uuid` | opponent must be accepted friend; status `pending`; at most one pending/active duel per pair (`duel_exists`) |
| `respond_duel(p_duel_id uuid, p_accept boolean)` | void | only opponent of pending duel; accept → `active`, `started_at = now()`, `ends_at = now() + duration` |
| `cancel_duel(p_duel_id uuid)` | void | participant; pending/active → `cancelled` |
| `close_duel(p_duel_id uuid)` | void | participant; active and now() ≥ ends_at → `finished` (idempotent) |
| `my_duels()` | table(`id`, `challenger`, `opponent`, `opponent_username`, `opponent_display_name`, `opponent_color`, `exercise_key`, `exercise_name`, `metric`, `duration_min`, `status`, `started_at`, `ends_at`, `created_at`, `i_am_challenger` bool, `my_score` numeric, `opponent_score` numeric) | caller's duels, newest first; status reported as `finished` when active and past ends_at |
| `duel_scores(p_duel_id uuid)` | table(`user_id`, `username`, `display_name`, `color`, `score`, `sets`, `last_set_at`, `is_me`) | participants only; score = Σ weight×reps (volume) or Σ reps |
| `delete_my_social_data()` | void | deletes all rows of the caller in every table + profile |
| `delete_my_account()` | void | deletes `auth.users` row of caller (cascades) |
