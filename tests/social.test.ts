import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/db';
import { initDatabase } from '@/db/init';
import * as W from '@/db/repo/workouts';
import { buildSummary, exerciseKey, loadSummary } from '@/social/summary';
import { flushOutbox, enqueueWorkout, type OutboxClient } from '@/social/outbox';
import { validateConfig } from '@/social/config';
import { validateChallenge, validateProfile } from '@/social/api';
import { toSocialError } from '@/social/client';

async function workout(sets: [number, number][], exerciseId = 'ex-bench-press') {
  const wid = await W.startWorkout();
  const weId = await W.addExerciseToWorkout(wid, exerciseId);
  const existing = await db.sets.where('workoutExerciseId').equals(weId).sortBy('order');
  for (const s of existing.slice(sets.length)) await W.deleteSet(s.id);
  for (let i = 0; i < sets.length; i++) {
    const cur = await db.sets.where('workoutExerciseId').equals(weId).sortBy('order');
    await W.updateSet(cur[i].id, { weight: sets[i][0], reps: sets[i][1] });
    await W.completeSet(cur[i].id);
  }
  await W.finishWorkout(wid);
  return wid;
}

/** In-memory fake of the parts of supabase-js the outbox uses. */
function fakeClient(opts: { signedIn?: boolean; failTable?: string } = {}) {
  const calls: { table: string; op: string; payload?: unknown; filter?: unknown }[] = [];
  const c: OutboxClient = {
    auth: { getSession: async () => ({ data: { session: opts.signedIn === false ? null : { user: { id: 'u1' } } } }) },
    from(table: string) {
      const result = () => (opts.failTable === table ? { error: { message: 'new row violates row-level security policy', code: '42501' } } : { error: null });
      return {
        upsert: async (payload: unknown) => (calls.push({ table, op: 'upsert', payload }), result()),
        insert: async (payload: unknown) => (calls.push({ table, op: 'insert', payload }), result()),
        delete: () => ({ eq: async (col: string, v: unknown) => (calls.push({ table, op: 'delete', filter: [col, v] }), result()) }),
      };
    },
  };
  return { c, calls };
}

beforeEach(async () => {
  await db.delete();
  await db.open();
  await initDatabase();
});

describe('workout summary for sharing', () => {
  it('contains only aggregates – no notes, no set list', async () => {
    const wid = await workout([[60, 10], [80, 5]]);
    await W.setWorkoutNote(wid, 'privat');
    const s = (await loadSummary(wid))!;
    expect(s.workout).toMatchObject({ id: wid, total_volume: 1000, total_sets: 2 });
    expect(JSON.stringify(s)).not.toContain('privat');
    expect(s.exercises).toEqual([
      expect.objectContaining({ exercise_key: 'ex-bench-press', exercise_name: 'Bankdrücken', sets: 2, reps: 15, volume: 1000, top_weight: 80, top_weight_reps: 5, best_e1rm: 93.3 }),
    ]);
  });
  it('custom exercises get a private key', () => {
    expect(exerciseKey('ex-squat')).toBe('ex-squat');
    expect(exerciseKey('3f2a')).toBe('custom:3f2a');
  });
  it('warm-ups count for volume but not for top weight / 1RM', () => {
    const w = { id: 'w', name: 'X', startedAt: 0, endedAt: 1000, durationSec: 1, totalVolume: 0, totalSets: 2, totalReps: 0, prCount: 0 } as never;
    const we = [{ id: 'we', exerciseId: 'ex-squat', order: 0, snapshot: { nameDe: 'Kniebeugen' } }] as never;
    const sets = [
      { workoutExerciseId: 'we', completed: 1, kind: 'warmup', weight: 200, reps: 1, holdSec: null },
      { workoutExerciseId: 'we', completed: 1, kind: 'normal', weight: 100, reps: 5, holdSec: null },
    ] as never;
    const s = buildSummary(w, we, sets);
    expect(s.exercises[0]).toMatchObject({ volume: 700, top_weight: 100, sets: 2 });
  });
});

describe('outbox', () => {
  it('finishing a workout queues it; flush uploads summary + exercises and empties the queue', async () => {
    const wid = await workout([[50, 10]]);
    await new Promise((r) => setTimeout(r, 20)); // lazy import in finishWorkout
    expect(await db.socialOutbox.where('ref').equals(wid).count()).toBe(1);
    const { c, calls } = fakeClient();
    const r = await flushOutbox(c);
    expect(r.sent).toBe(1);
    expect(calls.map((x) => `${x.table}:${x.op}`)).toEqual(['workout_summaries:upsert', 'exercise_summaries:delete', 'exercise_summaries:insert']);
    expect(await db.socialOutbox.count()).toBe(0);
  });
  it('keeps items while signed out and collapses repeated edits', async () => {
    const wid = await workout([[50, 10]]);
    await enqueueWorkout(wid);
    await enqueueWorkout(wid);
    const { c, calls } = fakeClient({ signedIn: false });
    await flushOutbox(c);
    expect(calls).toHaveLength(0);
    expect(await db.socialOutbox.count()).toBe(1);
  });
  it('deleting a workout replaces a pending upload by a delete', async () => {
    const wid = await workout([[50, 10]]);
    await W.deleteWorkout(wid);
    await new Promise((r) => setTimeout(r, 20));
    const items = await db.socialOutbox.toArray();
    expect(items.map((i) => i.kind)).toEqual(['deleteWorkout']);
  });
  it('drops permanently rejected items after 3 attempts', async () => {
    await db.socialOutbox.add({ id: 'x', kind: 'duelSet', ref: 'duel', payload: { exerciseKey: 'ex-squat', exerciseName: 'K', weight: 100, reps: 5 }, createdAt: 1, attempts: 0, lastError: null });
    const { c } = fakeClient({ failTable: 'duel_sets' });
    await flushOutbox(c);
    await flushOutbox(c);
    expect((await db.socialOutbox.get('x'))!.attempts).toBe(2);
    await flushOutbox(c);
    expect(await db.socialOutbox.get('x')).toBeUndefined();
  });
});

describe('validation', () => {
  it('config: rejects the secret service_role key', () => {
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const svc = `${b64({ alg: 'HS256' })}.${b64({ role: 'service_role' })}.sig`;
    const anon = `${b64({ alg: 'HS256' })}.${b64({ role: 'anon' })}.sig`;
    expect(validateConfig('https://x.supabase.co', svc)).toMatch(/service_role/);
    expect(validateConfig('https://x.supabase.co', anon)).toBeNull();
    expect(validateConfig('http://x.supabase.co', anon)).toMatch(/https/);
    expect(validateConfig('https://x.supabase.co', 'sb_publishable_abcdefghijkl')).toBeNull();
  });
  it('profile & challenge rules mirror the server', () => {
    expect(validateProfile({ username: 'Max', display_name: 'Max' })).not.toBeNull();
    expect(validateProfile({ username: 'max_1', display_name: 'Max' })).toBeNull();
    const base = { title: 'X', metric: 'e1rm' as const, exerciseKey: null, exerciseName: null, startsAt: new Date(0), endsAt: new Date(86400000), invitees: ['a'] };
    expect(validateChallenge(base)).toMatch(/Übung/);
    expect(validateChallenge({ ...base, exerciseKey: 'ex-squat', endsAt: new Date(100 * 86400000) })).toMatch(/90/);
  });
  it('maps server error codes to German messages', () => {
    expect(toSocialError({ message: 'already_friends' }).message).toBe('Ihr seid bereits befreundet.');
    expect(toSocialError({ message: 'duplicate key value violates unique constraint', code: '23505' }).message).toMatch(/vergeben/);
    expect(toSocialError(new TypeError('Failed to fetch')).code).toBe('network');
  });
});
