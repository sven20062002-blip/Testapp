import { db } from '@/db/db';
import type { Workout, WorkoutExercise, WorkoutSet } from '@/db/types';
import { estimate1RM, isCountable, setVolume } from '@/lib/metrics';

/** Stable cross-user key: seed exercises share ids (ex-bench-press …); custom ones are private. */
export function exerciseKey(exerciseId: string): string {
  return exerciseId.startsWith('ex-') ? exerciseId : `custom:${exerciseId}`;
}

export interface WorkoutSummaryPayload {
  workout: {
    id: string;
    name: string;
    started_at: string;
    ended_at: string;
    duration_sec: number;
    total_volume: number;
    total_sets: number;
    total_reps: number;
    pr_count: number;
  };
  exercises: {
    workout_id: string;
    exercise_key: string;
    exercise_name: string;
    performed_at: string;
    sets: number;
    reps: number;
    volume: number;
    top_weight: number | null;
    top_weight_reps: number | null;
    best_e1rm: number | null;
  }[];
}

/** Pure: build the shareable summary (no notes, no set-level details). */
export function buildSummary(w: Workout, wes: WorkoutExercise[], sets: WorkoutSet[]): WorkoutSummaryPayload {
  const endedAt = new Date(w.endedAt ?? w.startedAt).toISOString();
  const byKey = new Map<string, { name: string; sets: WorkoutSet[] }>();
  for (const we of [...wes].sort((a, b) => a.order - b.order)) {
    const key = exerciseKey(we.exerciseId);
    const cur = byKey.get(key) ?? { name: we.snapshot.nameDe, sets: [] };
    cur.sets.push(...sets.filter((s) => s.workoutExerciseId === we.id && isCountable(s)));
    byKey.set(key, cur);
  }
  const exercises: WorkoutSummaryPayload['exercises'] = [];
  for (const [key, { name, sets: ss }] of byKey) {
    if (!ss.length) continue;
    const work = ss.filter((s) => s.kind !== 'warmup');
    let top: WorkoutSet | null = null;
    for (const s of work) if ((s.weight ?? 0) > 0 && (s.reps ?? 0) > 0 && (!top || s.weight! > top.weight! || (s.weight === top.weight && s.reps! > top.reps!))) top = s;
    const e1 = work.map((s) => estimate1RM(s.weight, s.reps)).filter((x): x is number => x != null);
    exercises.push({
      workout_id: w.id,
      exercise_key: key,
      exercise_name: name,
      performed_at: endedAt,
      sets: ss.length,
      reps: ss.reduce((a, s) => a + (s.reps ?? 0), 0),
      volume: Math.round(ss.reduce((a, s) => a + setVolume(s), 0) * 100) / 100,
      top_weight: top?.weight ?? null,
      top_weight_reps: top?.reps ?? null,
      best_e1rm: e1.length ? Math.round(Math.max(...e1) * 10) / 10 : null,
    });
  }
  return {
    workout: {
      id: w.id,
      name: w.name.slice(0, 60),
      started_at: new Date(w.startedAt).toISOString(),
      ended_at: endedAt,
      duration_sec: w.durationSec,
      total_volume: Math.round(w.totalVolume * 100) / 100,
      total_sets: w.totalSets,
      total_reps: w.totalReps,
      pr_count: w.prCount,
    },
    exercises,
  };
}

export async function loadSummary(workoutId: string): Promise<WorkoutSummaryPayload | null> {
  const w = await db.workouts.get(workoutId);
  if (!w || w.status !== 'completed') return null;
  const wes = await db.workoutExercises.where('workoutId').equals(workoutId).toArray();
  const sets = await db.sets.where('workoutId').equals(workoutId).toArray();
  return buildSummary(w, wes, sets);
}
