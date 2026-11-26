import type { MuscleGroup, Workout, WorkoutExercise, WorkoutSet } from '@/db/types';
import { estimate1RM, isCountable, setVolume } from './metrics';
import { startOfMonth, startOfWeek } from './time';

export type RangeKey = '7d' | '30d' | '3m' | '6m' | '1y' | 'all';

export const RANGES: { key: RangeKey; label: string }[] = [
  { key: '7d', label: '7 T' },
  { key: '30d', label: '30 T' },
  { key: '3m', label: '3 M' },
  { key: '6m', label: '6 M' },
  { key: '1y', label: '1 J' },
  { key: 'all', label: 'Alles' },
];

export function rangeStart(key: RangeKey, now = Date.now(), firstWorkout?: number): number {
  const d = new Date(now);
  switch (key) {
    case '7d':
      return now - 7 * 86400000;
    case '30d':
      return now - 30 * 86400000;
    case '3m':
      return new Date(d.getFullYear(), d.getMonth() - 3, d.getDate()).getTime();
    case '6m':
      return new Date(d.getFullYear(), d.getMonth() - 6, d.getDate()).getTime();
    case '1y':
      return new Date(d.getFullYear() - 1, d.getMonth(), d.getDate()).getTime();
    case 'all':
      return firstWorkout ?? now - 30 * 86400000;
  }
}

export interface Totals {
  workouts: number;
  durationSec: number;
  sets: number;
  reps: number;
  volume: number;
  holdSec: number;
}

export function totals(workouts: Workout[], sets: WorkoutSet[]): Totals {
  const ids = new Set(workouts.map((w) => w.id));
  const ss = sets.filter((s) => ids.has(s.workoutId) && isCountable(s));
  return {
    workouts: workouts.length,
    durationSec: workouts.reduce((a, w) => a + w.durationSec, 0),
    sets: ss.length,
    reps: ss.reduce((a, s) => a + (s.reps ?? 0), 0),
    volume: ss.reduce((a, s) => a + setVolume(s), 0),
    holdSec: ss.reduce((a, s) => a + (s.holdSec ?? 0), 0),
  };
}

export interface Bucket {
  key: number;
  label: string;
  workouts: number;
  volume: number;
  minutes: number;
  sets: number;
}

const wkLabel = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' });
const moLabel = new Intl.DateTimeFormat('de-DE', { month: 'short' });
const moLabelY = new Intl.DateTimeFormat('de-DE', { month: 'short', year: '2-digit' });

/** Time buckets between from and now; granularity chosen by span. */
export function buckets(
  workouts: Workout[],
  sets: WorkoutSet[],
  from: number,
  now = Date.now(),
  forced?: 'day' | 'week' | 'month',
): { granularity: 'day' | 'week' | 'month'; data: Bucket[] } {
  const span = now - from;
  const granularity = forced ?? (span <= 14 * 86400000 ? 'day' : span <= 200 * 86400000 ? 'week' : 'month');
  const keyOf = (t: number) => {
    if (granularity === 'day') {
      const d = new Date(t);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    }
    return granularity === 'week' ? startOfWeek(t) : startOfMonth(t);
  };
  const next = (k: number) => {
    const d = new Date(k);
    if (granularity === 'day') d.setDate(d.getDate() + 1);
    else if (granularity === 'week') d.setDate(d.getDate() + 7);
    else d.setMonth(d.getMonth() + 1);
    return d.getTime();
  };
  const multiYear = new Date(from).getFullYear() !== new Date(now).getFullYear();
  const label = (k: number) =>
    granularity === 'month'
      ? (multiYear ? moLabelY : moLabel).format(k)
      : granularity === 'week'
        ? wkLabel.format(k)
        : new Intl.DateTimeFormat('de-DE', { weekday: 'short' }).format(k);
  const map = new Map<number, Bucket>();
  for (let k = keyOf(from); k <= now; k = next(k))
    map.set(k, { key: k, label: label(k), workouts: 0, volume: 0, minutes: 0, sets: 0 });
  const wKey = new Map<string, number>();
  for (const w of workouts) {
    if (w.startedAt < from) continue;
    const k = keyOf(w.startedAt);
    const b = map.get(k);
    if (!b) continue;
    b.workouts++;
    b.minutes += w.durationSec / 60;
    wKey.set(w.id, k);
  }
  for (const s of sets) {
    const k = wKey.get(s.workoutId);
    if (k == null || !isCountable(s)) continue;
    const b = map.get(k)!;
    b.volume += setVolume(s);
    b.sets++;
  }
  return { granularity, data: [...map.values()].map((b) => ({ ...b, minutes: Math.round(b.minutes) })) };
}

export interface MuscleShare {
  muscle: MuscleGroup;
  sets: number;
  volume: number;
}

/** Distribution by primary muscle group (sets and volume). */
export function muscleDistribution(wes: WorkoutExercise[], sets: WorkoutSet[], workoutIds: Set<string>): MuscleShare[] {
  const weMap = new Map(wes.map((w) => [w.id, w]));
  const m = new Map<MuscleGroup, MuscleShare>();
  for (const s of sets) {
    if (!workoutIds.has(s.workoutId) || !isCountable(s)) continue;
    const we = weMap.get(s.workoutExerciseId);
    if (!we) continue;
    const mg = we.snapshot.muscleGroup;
    const cur = m.get(mg) ?? { muscle: mg, sets: 0, volume: 0 };
    cur.sets++;
    cur.volume += setVolume(s);
    m.set(mg, cur);
  }
  return [...m.values()].sort((a, b) => b.sets - a.sets);
}

export interface ExercisePoint {
  workoutId: string;
  at: number;
  label: string;
  topWeight: number | null;
  e1rm: number | null;
  volume: number;
  maxReps: number | null;
  maxHold: number | null;
  sets: number;
}

/** Per-session progress of a single exercise (chronological). */
export function exerciseProgress(exerciseId: string, workouts: Workout[], sets: WorkoutSet[]): ExercisePoint[] {
  const wMap = new Map(workouts.map((w) => [w.id, w]));
  const by = new Map<string, WorkoutSet[]>();
  for (const s of sets) {
    if (s.exerciseId !== exerciseId || !isCountable(s) || !wMap.has(s.workoutId)) continue;
    const a = by.get(s.workoutId) ?? [];
    a.push(s);
    by.set(s.workoutId, a);
  }
  const fmt = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' });
  return [...by.entries()]
    .map(([wid, ss]) => {
      const w = wMap.get(wid)!;
      const work = ss.filter((s) => s.kind !== 'warmup');
      const weights = work.map((s) => s.weight ?? 0).filter((v) => v > 0);
      const e1 = work.map((s) => estimate1RM(s.weight, s.reps)).filter((v): v is number => v != null);
      const reps = work.map((s) => s.reps ?? 0).filter((v) => v > 0);
      const holds = work.map((s) => s.holdSec ?? 0).filter((v) => v > 0);
      return {
        workoutId: wid,
        at: w.startedAt,
        label: fmt.format(w.startedAt),
        topWeight: weights.length ? Math.max(...weights) : null,
        e1rm: e1.length ? Math.round(Math.max(...e1) * 10) / 10 : null,
        volume: ss.reduce((a, s) => a + setVolume(s), 0),
        maxReps: reps.length ? Math.max(...reps) : null,
        maxHold: holds.length ? Math.max(...holds) : null,
        sets: ss.length,
      };
    })
    .sort((a, b) => a.at - b.at);
}

/** Consecutive weeks (ending this or last week) with at least one workout */
export function weekStreak(workouts: Workout[], now = Date.now()): number {
  const weeks = new Set(workouts.map((w) => startOfWeek(w.startedAt)));
  let k = startOfWeek(now);
  if (!weeks.has(k)) {
    const d = new Date(k);
    d.setDate(d.getDate() - 7);
    k = d.getTime();
  }
  let n = 0;
  while (weeks.has(k)) {
    n++;
    const d = new Date(k);
    d.setDate(d.getDate() - 7);
    k = d.getTime();
  }
  return n;
}
