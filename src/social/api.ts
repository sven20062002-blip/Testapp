import type { RealtimeChannel } from '@supabase/supabase-js';
import { requireClient, toSocialError, getClient } from './client';
import type {
  ChallengeMetric,
  ChallengeScore,
  ChallengeSummary,
  DuelScore,
  DuelSummary,
  FeedItem,
  FriendRow,
  LeaderRow,
  Reaction,
  SocialProfile,
  VolumeRow,
} from './types';

/** Call an RPC and unwrap errors into SocialError. */
async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await requireClient().rpc(fn, args);
  if (error) throw toSocialError(error);
  return data as T;
}

/* ---------------- auth ---------------- */

export async function signUp(email: string, password: string): Promise<{ needsConfirmation: boolean }> {
  const { data, error } = await requireClient().auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: location.origin + '/social' } });
  if (error) throw toSocialError(error);
  return { needsConfirmation: !data.session };
}

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await requireClient().auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw toSocialError(error);
}

export async function signOut(): Promise<void> {
  const c = getClient();
  if (c) await c.auth.signOut();
}

export async function resetPassword(email: string): Promise<void> {
  const { error } = await requireClient().auth.resetPasswordForEmail(email.trim(), { redirectTo: location.origin + '/social/account' });
  if (error) throw toSocialError(error);
}

export async function updatePassword(password: string): Promise<void> {
  const { error } = await requireClient().auth.updateUser({ password });
  if (error) throw toSocialError(error);
}

/* ---------------- profile ---------------- */

export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

export function validateProfile(p: { username: string; display_name: string }): string | null {
  if (!USERNAME_RE.test(p.username)) return 'Benutzername: 3–20 Zeichen, nur a–z, 0–9 und _.';
  if (!p.display_name.trim() || p.display_name.trim().length > 40) return 'Anzeigename: 1–40 Zeichen.';
  return null;
}

export async function getMyProfile(userId: string): Promise<SocialProfile | null> {
  const { data, error } = await requireClient().from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw toSocialError(error);
  return data as SocialProfile | null;
}

export async function saveProfile(userId: string, p: Pick<SocialProfile, 'username' | 'display_name' | 'color' | 'share_workouts'>): Promise<void> {
  const err = validateProfile(p);
  if (err) throw toSocialError(new Error(err));
  const { error } = await requireClient()
    .from('profiles')
    .upsert({ id: userId, username: p.username.toLowerCase(), display_name: p.display_name.trim(), color: p.color, share_workouts: p.share_workouts });
  if (error) throw toSocialError(error);
}

/* ---------------- friends ---------------- */

export const sendFriendRequest = (username: string) => rpc<string>('send_friend_request', { target_username: username.trim().toLowerCase().replace(/^@/, '') });
export const respondFriendRequest = (id: string, accept: boolean) => rpc<void>('respond_friend_request', { request_id: id, accept });
export const removeFriend = (friendId: string) => rpc<void>('remove_friend', { friend_id: friendId });
export const listFriends = () => rpc<FriendRow[]>('list_friends');

/* ---------------- feed & reactions ---------------- */

export const feed = (maxRows = 30, before?: string) => rpc<FeedItem[]>('feed', { max_rows: maxRows, before_ts: before ?? null });

export async function react(workoutId: string, emoji: Reaction | null): Promise<void> {
  const c = requireClient();
  if (emoji == null) {
    const { error } = await c.from('reactions').delete().eq('workout_id', workoutId).eq('user_id', (await c.auth.getUser()).data.user?.id ?? '');
    if (error) throw toSocialError(error);
    return;
  }
  const { error } = await c.from('reactions').upsert({ workout_id: workoutId, emoji }, { onConflict: 'workout_id,user_id' });
  if (error) throw toSocialError(error);
}

/* ---------------- leaderboards ---------------- */

export const leaderboard = (exerciseKey: string, metric: 'e1rm' | 'max_weight', since?: string) =>
  rpc<LeaderRow[]>('leaderboard', { p_exercise_key: exerciseKey, p_metric: metric, p_since: since ?? null });
export const volumeLeaderboard = (since: string) => rpc<VolumeRow[]>('volume_leaderboard', { p_since: since });

/* ---------------- challenges ---------------- */

export interface NewChallenge {
  title: string;
  metric: ChallengeMetric;
  exerciseKey: string | null;
  exerciseName: string | null;
  startsAt: Date;
  endsAt: Date;
  invitees: string[];
}

export function validateChallenge(c: NewChallenge): string | null {
  if (!c.title.trim() || c.title.trim().length > 60) return 'Titel: 1–60 Zeichen.';
  if ((c.metric === 'e1rm' || c.metric === 'max_weight') && !c.exerciseKey) return 'Für diese Wertung bitte eine Übung wählen.';
  if (!(c.endsAt > c.startsAt)) return 'Das Ende muss nach dem Start liegen.';
  if (c.endsAt.getTime() - c.startsAt.getTime() > 90 * 86400000) return 'Maximal 90 Tage.';
  if (!c.invitees.length) return 'Lade mindestens eine Person ein.';
  return null;
}

export async function createChallenge(c: NewChallenge): Promise<string> {
  const err = validateChallenge(c);
  if (err) throw toSocialError(new Error(err));
  return rpc<string>('create_challenge', {
    p_title: c.title.trim(),
    p_metric: c.metric,
    p_exercise_key: c.exerciseKey,
    p_exercise_name: c.exerciseName,
    p_starts_at: c.startsAt.toISOString(),
    p_ends_at: c.endsAt.toISOString(),
    p_invitees: c.invitees,
  });
}
export const respondChallenge = (id: string, accept: boolean) => rpc<void>('respond_challenge', { p_challenge_id: id, p_accept: accept });
export const leaveChallenge = (id: string) => rpc<void>('leave_challenge', { p_challenge_id: id });
export const myChallenges = () => rpc<ChallengeSummary[]>('my_challenges');
export const challengeScores = (id: string) => rpc<ChallengeScore[]>('challenge_scores', { p_challenge_id: id });

/* ---------------- duels ---------------- */

export const createDuel = (opponent: string, exerciseKey: string | null, exerciseName: string | null, metric: 'volume' | 'reps', durationMin: number) =>
  rpc<string>('create_duel', { p_opponent: opponent, p_exercise_key: exerciseKey, p_exercise_name: exerciseName, p_metric: metric, p_duration_min: durationMin });
export const respondDuel = (id: string, accept: boolean) => rpc<void>('respond_duel', { p_duel_id: id, p_accept: accept });
export const cancelDuel = (id: string) => rpc<void>('cancel_duel', { p_duel_id: id });
export const closeDuel = (id: string) => rpc<void>('close_duel', { p_duel_id: id });
export const myDuels = () => rpc<DuelSummary[]>('my_duels');
export const duelScores = (id: string) => rpc<DuelScore[]>('duel_scores', { p_duel_id: id });

export async function postDuelSet(duelId: string, s: { exerciseKey: string; exerciseName: string; weight: number; reps: number }): Promise<void> {
  const { error } = await requireClient()
    .from('duel_sets')
    .insert({ duel_id: duelId, exercise_key: s.exerciseKey, exercise_name: s.exerciseName, weight: s.weight, reps: s.reps });
  if (error) throw toSocialError(error);
}

/* ---------------- realtime ---------------- */

/** Subscribe to Postgres changes on one table (RLS applies). Returns an unsubscribe function. */
export function subscribe(name: string, table: string, filter: string | undefined, onChange: () => void): () => void {
  const c = getClient();
  if (!c) return () => {};
  const ch: RealtimeChannel = c
    .channel(`${name}-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) }, () => onChange())
    .subscribe();
  return () => {
    void c.removeChannel(ch);
  };
}

/* ---------------- privacy ---------------- */

export const deleteMySocialData = () => rpc<void>('delete_my_social_data');
export const deleteMyAccount = () => rpc<void>('delete_my_account');
