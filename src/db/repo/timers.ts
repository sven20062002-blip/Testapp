import { db } from '../db';
import type { RestTimerState } from '../types';

export const IDLE_REST: RestTimerState = {
  id: 'rest',
  status: 'idle',
  workoutId: null,
  workoutExerciseId: null,
  totalSec: 0,
  endsAt: null,
  remainingMs: null,
  startedAt: null,
  updatedAt: 0,
};

export async function getRest(): Promise<RestTimerState> {
  return (await db.timers.get('rest')) ?? IDLE_REST;
}

/** Start (or restart) the rest countdown. Purely timestamp based. */
export async function startRest(totalSec: number, workoutId: string | null, workoutExerciseId: string | null): Promise<void> {
  const now = Date.now();
  const sec = Math.max(1, Math.min(3600, Math.round(totalSec)));
  await db.timers.put({
    id: 'rest',
    status: 'running',
    workoutId,
    workoutExerciseId,
    totalSec: sec,
    endsAt: now + sec * 1000,
    remainingMs: null,
    startedAt: now,
    updatedAt: now,
  });
}

/** Add or remove seconds (also works while paused). Never below 0. */
export async function adjustRest(deltaSec: number): Promise<void> {
  const t = await getRest();
  const now = Date.now();
  if (t.status === 'running' && t.endsAt) {
    const endsAt = Math.max(now, t.endsAt + deltaSec * 1000);
    await db.timers.put({ ...t, endsAt, totalSec: Math.max(1, t.totalSec + deltaSec), updatedAt: now });
  } else if (t.status === 'paused' && t.remainingMs != null) {
    await db.timers.put({ ...t, remainingMs: Math.max(0, t.remainingMs + deltaSec * 1000), totalSec: Math.max(1, t.totalSec + deltaSec), updatedAt: now });
  }
}

export async function pauseRest(): Promise<void> {
  const t = await getRest();
  if (t.status !== 'running' || !t.endsAt) return;
  const now = Date.now();
  await db.timers.put({ ...t, status: 'paused', remainingMs: Math.max(0, t.endsAt - now), endsAt: null, updatedAt: now });
}

export async function resumeRest(): Promise<void> {
  const t = await getRest();
  if (t.status !== 'paused' || t.remainingMs == null) return;
  const now = Date.now();
  await db.timers.put({ ...t, status: 'running', endsAt: now + t.remainingMs, remainingMs: null, updatedAt: now });
}

/** Mark finished (countdown elapsed). Returns true if this call performed the transition. */
export async function markRestDone(): Promise<boolean> {
  return db.transaction('rw', db.timers, async () => {
    const t = await getRest();
    if (t.status !== 'running') return false;
    await db.timers.put({ ...t, status: 'done', endsAt: t.endsAt, remainingMs: 0, updatedAt: Date.now() });
    return true;
  });
}

export async function stopRest(): Promise<void> {
  await db.timers.put({ ...IDLE_REST, updatedAt: Date.now() });
}
