import { db } from '../db';
import { WORKOUT_RECORD_KEY, type PersonalRecord, type TrackingType, type WorkoutSet } from '../types';
import { buildRecordTimeline, detectLivePRs, type LivePR, type Session } from '@/lib/metrics';
import { uid } from '@/lib/id';

/** Completed workout ids → endedAt */
async function completedWorkoutTimes(): Promise<Map<string, number>> {
  const ws = await db.workouts.where('status').equals('completed').toArray();
  return new Map(ws.map((w) => [w.id, w.endedAt ?? w.startedAt]));
}

async function trackingTypeOf(exerciseId: string): Promise<TrackingType> {
  const ex = await db.exercises.get(exerciseId);
  if (ex) return ex.trackingType;
  const we = await db.workoutExercises.where('exerciseId').equals(exerciseId).first();
  return we?.snapshot.trackingType ?? 'weight_reps';
}

/** All completed sets of an exercise in completed workouts, grouped as sessions */
export async function exerciseSessions(exerciseId: string, excludeWorkoutId?: string): Promise<Session[]> {
  const times = await completedWorkoutTimes();
  const sets = await db.sets.where('exerciseId').equals(exerciseId).toArray();
  const by = new Map<string, WorkoutSet[]>();
  for (const s of sets) {
    if (s.completed !== 1 || !times.has(s.workoutId) || s.workoutId === excludeWorkoutId) continue;
    const arr = by.get(s.workoutId) ?? [];
    arr.push(s);
    by.set(s.workoutId, arr);
  }
  return [...by.entries()]
    .map(([workoutId, arr]) => ({ workoutId, at: times.get(workoutId)!, sets: arr.sort((a, b) => a.order - b.order) }))
    .sort((a, b) => a.at - b.at);
}

/** Recompute the full PR timeline for the given exercises (idempotent). */
export async function rebuildExerciseRecords(exerciseIds: string[]): Promise<void> {
  for (const exerciseId of new Set(exerciseIds)) {
    const tracking = await trackingTypeOf(exerciseId);
    const sessions = await exerciseSessions(exerciseId);
    const drafts = buildRecordTimeline(exerciseId, tracking, sessions);
    await db.transaction('rw', db.records, async () => {
      await db.records.where('exerciseId').equals(exerciseId).delete();
      await db.records.bulkAdd(drafts.map((d) => ({ ...d, id: uid() })));
    });
  }
}

/** Recompute the timeline of the highest volume per workout. */
export async function rebuildWorkoutVolumeRecords(): Promise<void> {
  const ws = (await db.workouts.where('status').equals('completed').toArray()).sort(
    (a, b) => (a.endedAt ?? a.startedAt) - (b.endedAt ?? b.startedAt),
  );
  const out: PersonalRecord[] = [];
  let best: number | null = null;
  for (const w of ws) {
    if (w.totalVolume <= 0) continue;
    if (best == null || w.totalVolume > best) {
      out.push({
        id: uid(),
        exerciseId: WORKOUT_RECORD_KEY,
        type: 'workoutVolume',
        value: w.totalVolume,
        weight: null,
        reps: null,
        prevValue: best,
        prevWeight: null,
        prevReps: null,
        workoutId: w.id,
        setId: null,
        achievedAt: w.endedAt ?? w.startedAt,
      });
      best = w.totalVolume;
    }
  }
  await db.transaction('rw', db.records, async () => {
    await db.records.where('exerciseId').equals(WORKOUT_RECORD_KEY).delete();
    await db.records.bulkAdd(out);
  });
}

/** Live PR detection for a just-completed set during an active workout. */
export async function livePRsForSet(setId: string): Promise<LivePR[]> {
  const set = await db.sets.get(setId);
  if (!set || set.completed !== 1) return [];
  const tracking = await trackingTypeOf(set.exerciseId);
  const history = (await exerciseSessions(set.exerciseId, set.workoutId)).flatMap((s) => s.sets);
  const earlier = (await db.sets.where('workoutId').equals(set.workoutId).toArray()).filter(
    (s) => s.exerciseId === set.exerciseId && s.id !== set.id && s.completed === 1 && (s.completedAt ?? 0) <= (set.completedAt ?? 0),
  );
  return detectLivePRs(tracking, set, history, earlier);
}

/** Current best (latest timeline entry) per record type for an exercise */
export function currentBests(records: PersonalRecord[]): Map<string, PersonalRecord> {
  const m = new Map<string, PersonalRecord>();
  for (const r of [...records].sort((a, b) => a.achievedAt - b.achievedAt)) {
    const key = `${r.exerciseId}:${r.type}`;
    const cur = m.get(key);
    if (r.type === 'reps') {
      // reps timeline is per-load; the headline is the absolute max reps
      if (!cur || r.value > cur.value || (r.value === cur.value && (r.weight ?? 0) > (cur.weight ?? 0))) m.set(key, r);
    } else m.set(key, r);
  }
  return m;
}
