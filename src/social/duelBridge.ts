import { db } from '@/db/db';
import { getActiveDuels } from './hooks';
import { enqueueDuelSet, flushOutbox } from './outbox';
import { exerciseKey } from './summary';

/**
 * Called after a set was completed in the running workout: posts it to every active duel whose
 * exercise matches (or that counts all exercises). Works offline via the outbox; the server only
 * accepts sets while the duel is running.
 */
export const DUEL_EVENT = 'forge:duel-set';

export async function postSetToDuels(setId: string): Promise<number> {
  const s = await db.sets.get(setId);
  if (!s || !s.completed || !(s.reps && s.reps > 0) || s.kind === 'warmup') return 0;
  const we = await db.workoutExercises.get(s.workoutExerciseId);
  if (!we) return 0;
  const key = exerciseKey(we.exerciseId);
  const duels = await getActiveDuels();
  let n = 0;
  for (const d of duels) {
    if (d.exercise_key && d.exercise_key !== key) continue;
    await enqueueDuelSet(d.id, { exerciseKey: key, exerciseName: we.snapshot.nameDe, weight: s.weight ?? 0, reps: s.reps });
    n++;
  }
  if (n) {
    // own score should update immediately – don't wait for the realtime round trip
    await flushOutbox();
    window.dispatchEvent(new CustomEvent(DUEL_EVENT));
  }
  return n;
}
