import { db } from '@/db/db';
import type { OutboxItem } from '@/db/types';
import { uid } from '@/lib/id';
import { getClient, toSocialError } from './client';
import { loadSummary, type WorkoutSummaryPayload } from './summary';

/**
 * Local outbox: uploads are queued in IndexedDB and sent when the user is signed in and
 * online. Nothing is lost while offline; repeated edits of the same workout collapse into one item.
 */

const SYNC_KEY = 'forge-social-sync';

/** User opt-out: "Workouts online speichern" (default on once signed in). */
export function isSyncEnabled(): boolean {
  try {
    return localStorage.getItem(SYNC_KEY) !== 'off';
  } catch {
    return true;
  }
}
export function setSyncEnabled(on: boolean): void {
  try {
    localStorage.setItem(SYNC_KEY, on ? 'on' : 'off');
  } catch {
    /* ignore */
  }
}

async function put(kind: OutboxItem['kind'], ref: string, payload: unknown): Promise<void> {
  await db.transaction('rw', db.socialOutbox, async () => {
    if (kind !== 'duelSet') {
      // newest state of a workout wins: drop older upload/delete items for the same workout
      const old = await db.socialOutbox.where('ref').equals(ref).toArray();
      await db.socialOutbox.bulkDelete(old.filter((o) => o.kind !== 'duelSet').map((o) => o.id));
    }
    await db.socialOutbox.add({ id: uid(), kind, ref, payload, createdAt: Date.now(), attempts: 0, lastError: null });
  });
}

/** Queue (re-)upload of a finished workout. Payload is built at flush time from the local DB. */
export async function enqueueWorkout(workoutId: string): Promise<void> {
  await put('workout', workoutId, null);
  void flushOutbox();
}

export async function enqueueWorkoutDelete(workoutId: string): Promise<void> {
  await put('deleteWorkout', workoutId, null);
  void flushOutbox();
}

export async function enqueueDuelSet(duelId: string, set: { exerciseKey: string; exerciseName: string; weight: number; reps: number }): Promise<void> {
  await put('duelSet', duelId, set);
  void flushOutbox();
}

/** Queue every completed local workout (first sign-in: "Verlauf hochladen"). */
export async function enqueueAllWorkouts(): Promise<number> {
  const ws = await db.workouts.where('status').equals('completed').toArray();
  for (const w of ws) await put('workout', w.id, null);
  void flushOutbox();
  return ws.length;
}

export async function pendingCount(): Promise<number> {
  return db.socialOutbox.count();
}

/** Minimal client surface used here (lets tests inject a fake). */
export interface OutboxClient {
  auth: { getSession(): Promise<{ data: { session: { user: { id: string } } | null } }> };
  from(table: string): any;
}

export async function uploadSummary(c: OutboxClient, s: WorkoutSummaryPayload): Promise<void> {
  const w = await c.from('workout_summaries').upsert(s.workout, { onConflict: 'id' });
  if (w.error) throw toSocialError(w.error);
  const del = await c.from('exercise_summaries').delete().eq('workout_id', s.workout.id);
  if (del.error) throw toSocialError(del.error);
  if (s.exercises.length) {
    const ins = await c.from('exercise_summaries').insert(s.exercises);
    if (ins.error) throw toSocialError(ins.error);
  }
}

/** Flushes run strictly one after another; each call gets its own pass (nothing queued meanwhile is skipped). */
let chain: Promise<unknown> = Promise.resolve();

/**
 * Send queued items in order. Stops on network errors (retry later); permanently rejected items
 * (e.g. a duel set after the duel ended) are dropped after 3 attempts.
 */
export function flushOutbox(client?: OutboxClient | null): Promise<{ sent: number; failed: number }> {
  const run = chain.then(() => flushOnce(client));
  chain = run.catch(() => {});
  return run;
}

async function flushOnce(client?: OutboxClient | null): Promise<{ sent: number; failed: number }> {
  {
    let sent = 0;
    let failed = 0;
    try {
      const c = client ?? (getClient() as unknown as OutboxClient | null);
      if (!c || (typeof navigator !== 'undefined' && navigator.onLine === false)) return { sent, failed };
      const { data } = await c.auth.getSession();
      if (!data.session) return { sent, failed };
      const items = await db.socialOutbox.orderBy('createdAt').toArray();
      for (const it of items) {
        try {
          if (it.kind === 'workout') {
            if (!isSyncEnabled()) continue;
            const s = await loadSummary(it.ref);
            if (s) await uploadSummary(c, s);
          } else if (it.kind === 'deleteWorkout') {
            const r = await c.from('workout_summaries').delete().eq('id', it.ref);
            if (r.error) throw toSocialError(r.error);
          } else if (it.kind === 'duelSet') {
            const p = it.payload as { exerciseKey: string; exerciseName: string; weight: number; reps: number };
            const r = await c.from('duel_sets').insert({ duel_id: it.ref, exercise_key: p.exerciseKey, exercise_name: p.exerciseName, weight: p.weight, reps: p.reps });
            if (r.error) throw toSocialError(r.error);
          }
          await db.socialOutbox.delete(it.id);
          sent++;
        } catch (e) {
          const err = toSocialError(e);
          failed++;
          if (err.code === 'network') break;
          const attempts = it.attempts + 1;
          if (attempts >= 3) await db.socialOutbox.delete(it.id);
          else await db.socialOutbox.update(it.id, { attempts, lastError: err.message });
        }
      }
    } catch {
      /* storage / client failure – retry on the next trigger */
    }
    return { sent, failed };
  }
}
