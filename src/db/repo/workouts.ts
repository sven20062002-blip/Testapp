import { db } from '../db';
import type { Workout, WorkoutExercise, WorkoutSet } from '../types';
import { uid } from '@/lib/id';
import { snapshotOf } from './exercises';
import { rebuildExerciseRecords, rebuildWorkoutVolumeRecords, livePRsForSet } from './records';
import { getSettings } from './settings';
import { pauseRest, resumeRest, startRest, stopRest } from './timers';
import { countCompleted, sumReps, sumVolume } from '@/lib/metrics';
import { clockElapsedMs, defaultWorkoutName } from '@/lib/time';
import type { LivePR } from '@/lib/metrics';

/** Online sync hooks (lazy import keeps the core independent of the social module). */
function socialSync(kind: 'upload' | 'delete', workoutId: string): void {
  void import('@/social/outbox')
    .then((m) => (kind === 'upload' ? m.enqueueWorkout(workoutId) : m.enqueueWorkoutDelete(workoutId)))
    .catch(() => {});
}

export async function getActiveWorkout(): Promise<Workout | undefined> {
  return db.workouts.where('status').equals('active').first();
}

function newSet(we: WorkoutExercise, order: number, now: number): WorkoutSet {
  return {
    id: uid(),
    workoutId: we.workoutId,
    workoutExerciseId: we.id,
    exerciseId: we.exerciseId,
    order,
    kind: 'normal',
    weight: null,
    reps: null,
    holdSec: null,
    completed: 0,
    completedAt: null,
    timerStartedAt: null,
    timerPausedMs: 0,
    durationSec: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Number of sets the exercise had last time (fallback 3) */
async function lastSetCount(exerciseId: string): Promise<number> {
  const last = await getLastPerformance(exerciseId);
  return last ? Math.min(Math.max(last.sets.length, 1), 10) : 3;
}

export interface StartOptions {
  planId?: string;
  templateWorkoutId?: string;
  name?: string;
}

/**
 * Starts a workout. Only one workout can be active – if one exists it is returned.
 * Plans/templates only provide STRUCTURE; values come from history as suggestions,
 * so historical data is never modified.
 */
export async function startWorkout(opts: StartOptions = {}): Promise<string> {
  const active = await getActiveWorkout();
  if (active) return active.id;
  const now = Date.now();
  const workout: Workout = {
    id: uid(),
    name: opts.name?.trim() || defaultWorkoutName(),
    planId: opts.planId ?? null,
    status: 'active',
    startedAt: now,
    endedAt: null,
    pausedAt: null,
    pausedMs: 0,
    note: '',
    durationSec: 0,
    totalVolume: 0,
    totalSets: 0,
    totalReps: 0,
    prCount: 0,
    createdAt: now,
    updatedAt: now,
  };

  const items: { exerciseId: string; sets: number; restSec: number | null; targetReps: string }[] = [];
  if (opts.planId) {
    const plan = await db.plans.get(opts.planId);
    if (!plan) throw new Error('Trainingsplan nicht gefunden');
    workout.name = opts.name?.trim() || plan.name;
    for (const pe of plan.exercises) items.push({ exerciseId: pe.exerciseId, sets: pe.targetSets, restSec: pe.restSec, targetReps: pe.targetReps });
    await db.plans.update(plan.id, { lastUsedAt: now });
  } else if (opts.templateWorkoutId) {
    const src = await db.workouts.get(opts.templateWorkoutId);
    if (!src) throw new Error('Workout nicht gefunden');
    workout.name = opts.name?.trim() || src.name;
    workout.planId = src.planId;
    const wes = await db.workoutExercises.where('workoutId').equals(src.id).sortBy('order');
    const sets = await db.sets.where('workoutId').equals(src.id).toArray();
    for (const we of wes)
      items.push({
        exerciseId: we.exerciseId,
        sets: Math.max(1, sets.filter((s) => s.workoutExerciseId === we.id).length),
        restSec: we.restSec,
        targetReps: we.targetReps,
      });
  }

  const exercises = await db.exercises.bulkGet(items.map((i) => i.exerciseId));
  await db.transaction('rw', db.workouts, db.workoutExercises, db.sets, async () => {
    await db.workouts.add(workout);
    let order = 0;
    for (let i = 0; i < items.length; i++) {
      const ex = exercises[i];
      if (!ex || ex.deletedAt) continue; // deleted exercise: skip
      const we: WorkoutExercise = {
        id: uid(),
        workoutId: workout.id,
        exerciseId: ex.id,
        order: order++,
        note: '',
        restSec: items[i].restSec,
        targetReps: items[i].targetReps,
        snapshot: snapshotOf(ex),
        createdAt: now,
        updatedAt: now,
      };
      await db.workoutExercises.add(we);
      await db.sets.bulkAdd(Array.from({ length: items[i].sets }, (_, k) => newSet(we, k, now)));
    }
  });
  return workout.id;
}

export async function renameWorkout(id: string, name: string): Promise<void> {
  const n = name.trim();
  if (!n) throw new Error('Name darf nicht leer sein.');
  await db.workouts.update(id, { name: n.slice(0, 60), updatedAt: Date.now() });
  if ((await db.workouts.get(id))?.status === 'completed') socialSync('upload', id);
}

export async function setWorkoutNote(id: string, note: string): Promise<void> {
  await db.workouts.update(id, { note, updatedAt: Date.now() });
}

// ---------------- Workout clock ----------------

export async function pauseWorkout(id: string): Promise<void> {
  const w = await db.workouts.get(id);
  if (!w || w.status !== 'active' || w.pausedAt) return;
  const now = Date.now();
  await db.workouts.update(id, { pausedAt: now, updatedAt: now });
  await pauseRest();
}

export async function resumeWorkout(id: string): Promise<void> {
  const w = await db.workouts.get(id);
  if (!w || w.status !== 'active' || !w.pausedAt) return;
  const now = Date.now();
  const delta = now - w.pausedAt;
  await db.transaction('rw', db.workouts, db.sets, async () => {
    await db.workouts.update(id, { pausedAt: null, pausedMs: w.pausedMs + delta, updatedAt: now });
    // running set timers are frozen during the pause as well
    const running = (await db.sets.where('workoutId').equals(id).toArray()).filter(
      (s) => s.timerStartedAt && !s.completed && s.timerStartedAt < w.pausedAt!,
    );
    for (const s of running) await db.sets.update(s.id, { timerPausedMs: s.timerPausedMs + delta });
  });
  await resumeRest();
}

// ---------------- Exercises in workout ----------------

export async function addExerciseToWorkout(workoutId: string, exerciseId: string): Promise<string> {
  const ex = await db.exercises.get(exerciseId);
  if (!ex) throw new Error('Übung nicht gefunden');
  const count = await lastSetCount(exerciseId);
  const now = Date.now();
  const existing = await db.workoutExercises.where('workoutId').equals(workoutId).toArray();
  const we: WorkoutExercise = {
    id: uid(),
    workoutId,
    exerciseId,
    order: existing.reduce((m, e) => Math.max(m, e.order + 1), 0),
    note: '',
    restSec: null,
    targetReps: '',
    snapshot: snapshotOf(ex),
    createdAt: now,
    updatedAt: now,
  };
  await db.transaction('rw', db.workoutExercises, db.sets, async () => {
    await db.workoutExercises.add(we);
    await db.sets.bulkAdd(Array.from({ length: count }, (_, k) => newSet(we, k, now)));
  });
  return we.id;
}

export async function removeExerciseFromWorkout(weId: string): Promise<void> {
  await db.transaction('rw', db.workoutExercises, db.sets, async () => {
    await db.sets.where('workoutExerciseId').equals(weId).delete();
    await db.workoutExercises.delete(weId);
  });
}

export async function moveWorkoutExercise(workoutId: string, weId: string, dir: -1 | 1): Promise<void> {
  const list = await db.workoutExercises.where('workoutId').equals(workoutId).sortBy('order');
  const i = list.findIndex((e) => e.id === weId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  await db.transaction('rw', db.workoutExercises, async () => {
    for (let k = 0; k < list.length; k++) await db.workoutExercises.update(list[k].id, { order: k });
  });
}

export async function reorderWorkoutExercises(ids: string[]): Promise<void> {
  await db.transaction('rw', db.workoutExercises, async () => {
    for (let k = 0; k < ids.length; k++) await db.workoutExercises.update(ids[k], { order: k });
  });
}

export async function setWorkoutExerciseNote(weId: string, note: string): Promise<void> {
  await db.workoutExercises.update(weId, { note, updatedAt: Date.now() });
}

export async function setWorkoutExerciseRest(weId: string, restSec: number | null): Promise<void> {
  await db.workoutExercises.update(weId, { restSec, updatedAt: Date.now() });
}

// ---------------- Sets ----------------

export async function addSet(weId: string): Promise<string> {
  const we = await db.workoutExercises.get(weId);
  if (!we) throw new Error('Übung nicht gefunden');
  const sets = await db.sets.where('workoutExerciseId').equals(weId).toArray();
  const s = newSet(we, sets.reduce((m, x) => Math.max(m, x.order + 1), 0), Date.now());
  await db.sets.add(s);
  return s.id;
}

export async function deleteSet(setId: string): Promise<void> {
  const s = await db.sets.get(setId);
  if (!s) return;
  await db.transaction('rw', db.sets, async () => {
    await db.sets.delete(setId);
    const rest = await db.sets.where('workoutExerciseId').equals(s.workoutExerciseId).sortBy('order');
    for (let k = 0; k < rest.length; k++) if (rest[k].order !== k) await db.sets.update(rest[k].id, { order: k });
  });
}

export type SetPatch = Partial<Pick<WorkoutSet, 'weight' | 'reps' | 'holdSec' | 'kind'>>;

export function validateSetPatch(p: SetPatch): string | null {
  if (p.weight != null && (!Number.isFinite(p.weight) || p.weight < 0 || p.weight > 1500)) return 'Ungültiges Gewicht';
  if (p.reps != null && (!Number.isInteger(p.reps) || p.reps < 0 || p.reps > 1000)) return 'Ungültige Wiederholungen';
  if (p.holdSec != null && (!Number.isFinite(p.holdSec) || p.holdSec < 0 || p.holdSec > 36000)) return 'Ungültige Zeit';
  return null;
}

export async function updateSet(setId: string, patch: SetPatch): Promise<void> {
  const err = validateSetPatch(patch);
  if (err) throw new Error(err);
  await db.sets.update(setId, { ...patch, updatedAt: Date.now() });
}

/** Starts the set timer for a set (and resets any other running, not completed set timer). */
export async function startSetTimer(setId: string): Promise<void> {
  const s = await db.sets.get(setId);
  if (!s || s.completed) return;
  const now = Date.now();
  await db.transaction('rw', db.sets, async () => {
    const running = (await db.sets.where('workoutId').equals(s.workoutId).toArray()).filter(
      (x) => x.id !== setId && x.timerStartedAt && !x.completed,
    );
    for (const r of running) await db.sets.update(r.id, { timerStartedAt: null, timerPausedMs: 0 });
    await db.sets.update(setId, { timerStartedAt: now, timerPausedMs: 0, updatedAt: now });
  });
}

export async function resetSetTimer(setId: string): Promise<void> {
  await db.sets.update(setId, { timerStartedAt: null, timerPausedMs: 0, updatedAt: Date.now() });
}

/** First open set of a workout, in exercise order (used for the auto-started set timer). */
export async function nextOpenSet(workoutId: string, preferWeId?: string | null): Promise<WorkoutSet | undefined> {
  const wes = await db.workoutExercises.where('workoutId').equals(workoutId).sortBy('order');
  const sets = await db.sets.where('workoutId').equals(workoutId).toArray();
  const ordered = preferWeId ? [...wes.filter((w) => w.id === preferWeId), ...wes.filter((w) => w.id !== preferWeId)] : wes;
  for (const we of ordered) {
    const open = sets.filter((s) => s.workoutExerciseId === we.id && !s.completed).sort((a, b) => a.order - b.order)[0];
    if (open) return open;
  }
  return undefined;
}

export interface CompleteResult {
  prs: LivePR[];
  error?: string;
}

/**
 * Completes a set. Empty fields are filled from the given suggestion (last workout values),
 * exactly like tapping the ghost values. Measures the set timer and starts the rest timer.
 */
export async function completeSet(
  setId: string,
  suggestion?: { weight: number | null; reps: number | null; holdSec: number | null },
): Promise<CompleteResult> {
  const s = await db.sets.get(setId);
  if (!s) return { prs: [], error: 'Satz nicht gefunden' };
  const we = await db.workoutExercises.get(s.workoutExerciseId);
  const w = await db.workouts.get(s.workoutId);
  if (!we || !w) return { prs: [], error: 'Workout nicht gefunden' };
  const tracking = we.snapshot.trackingType;
  const now = Date.now();

  const weight = s.weight ?? suggestion?.weight ?? null;
  const reps = s.reps ?? suggestion?.reps ?? null;
  let holdSec = s.holdSec ?? suggestion?.holdSec ?? null;

  // measured set duration (timestamp based)
  let durationSec: number | null = null;
  if (s.timerStartedAt) {
    const end = w.pausedAt && w.pausedAt > s.timerStartedAt ? w.pausedAt : now;
    durationSec = Math.max(0, Math.round((end - s.timerStartedAt - s.timerPausedMs) / 1000));
  }
  if (tracking === 'duration' && holdSec == null && durationSec) holdSec = durationSec;

  if (tracking === 'duration') {
    if (!holdSec || holdSec <= 0) return { prs: [], error: 'Bitte Haltezeit eingeben oder Satz-Timer verwenden.' };
  } else if (!reps || reps <= 0) {
    return { prs: [], error: 'Bitte Wiederholungen eingeben.' };
  }
  if (tracking === 'weight_reps' && weight == null) return { prs: [], error: 'Bitte Gewicht eingeben.' };

  await db.sets.update(setId, {
    weight,
    reps: tracking === 'duration' ? null : reps,
    holdSec: tracking === 'duration' ? holdSec : null,
    completed: 1,
    completedAt: now,
    durationSec,
    updatedAt: now,
  });

  const settings = await getSettings();
  if (settings.autoRest) {
    const restSec = we.restSec ?? settings.defaultRestSec;
    if (restSec > 0) await startRest(restSec, w.id, we.id);
  }

  const prs = settings.prAlerts ? await livePRsForSet(setId) : [];
  return { prs };
}

export async function uncompleteSet(setId: string): Promise<void> {
  await db.sets.update(setId, { completed: 0, completedAt: null, updatedAt: Date.now() });
}

// ---------------- Finish / discard / delete ----------------

export interface FinishSummary {
  workoutId: string;
  removedOpenSets: number;
}

export async function finishWorkout(id: string): Promise<FinishSummary> {
  const w = await db.workouts.get(id);
  if (!w || w.status !== 'active') throw new Error('Kein aktives Workout');
  const now = Date.now();
  const endedAt = w.pausedAt ?? now;
  const pausedMs = w.pausedMs;
  let removedOpenSets = 0;
  let exerciseIds: string[] = [];

  await db.transaction('rw', db.workouts, db.workoutExercises, db.sets, async () => {
    const sets = await db.sets.where('workoutId').equals(id).toArray();
    const open = sets.filter((s) => !s.completed);
    removedOpenSets = open.length;
    await db.sets.bulkDelete(open.map((s) => s.id));
    const done = sets.filter((s) => s.completed);
    // drop exercises without any completed set (keeps history clean)
    const wes = await db.workoutExercises.where('workoutId').equals(id).sortBy('order');
    const keep = wes.filter((we) => done.some((s) => s.workoutExerciseId === we.id));
    await db.workoutExercises.bulkDelete(wes.filter((we) => !keep.includes(we)).map((we) => we.id));
    for (let k = 0; k < keep.length; k++) await db.workoutExercises.update(keep[k].id, { order: k });
    // normalise set order
    for (const we of keep) {
      const ss = done.filter((s) => s.workoutExerciseId === we.id).sort((a, b) => a.order - b.order);
      for (let k = 0; k < ss.length; k++) if (ss[k].order !== k) await db.sets.update(ss[k].id, { order: k });
    }
    exerciseIds = keep.map((we) => we.exerciseId);
    await db.workouts.update(id, {
      status: 'completed',
      endedAt,
      pausedAt: null,
      durationSec: Math.round(clockElapsedMs({ startedAt: w.startedAt, endedAt, pausedAt: null, pausedMs }) / 1000),
      totalVolume: sumVolume(done),
      totalSets: countCompleted(done),
      totalReps: sumReps(done),
      updatedAt: now,
    });
  });

  await stopRest();
  await rebuildExerciseRecords(exerciseIds);
  await rebuildWorkoutVolumeRecords();
  const prCount = (await db.records.where('workoutId').equals(id).toArray()).filter((r) => r.prevValue != null).length;
  await db.workouts.update(id, { prCount });
  socialSync('upload', id);
  return { workoutId: id, removedOpenSets };
}

export async function discardWorkout(id: string): Promise<void> {
  await db.transaction('rw', db.workouts, db.workoutExercises, db.sets, async () => {
    await db.sets.where('workoutId').equals(id).delete();
    await db.workoutExercises.where('workoutId').equals(id).delete();
    await db.workouts.delete(id);
  });
  await stopRest();
}

/** Delete a completed workout from history and recompute dependent records. */
export async function deleteWorkout(id: string): Promise<void> {
  const exIds = (await db.workoutExercises.where('workoutId').equals(id).toArray()).map((e) => e.exerciseId);
  await db.transaction('rw', db.workouts, db.workoutExercises, db.sets, db.records, async () => {
    await db.sets.where('workoutId').equals(id).delete();
    await db.workoutExercises.where('workoutId').equals(id).delete();
    await db.records.where('workoutId').equals(id).delete();
    await db.workouts.delete(id);
  });
  await rebuildExerciseRecords(exIds);
  await rebuildWorkoutVolumeRecords();
  await recomputePrCounts();
  socialSync('delete', id);
}

export async function recomputePrCounts(): Promise<void> {
  const recs = await db.records.toArray();
  const counts = new Map<string, number>();
  for (const r of recs) if (r.prevValue != null) counts.set(r.workoutId, (counts.get(r.workoutId) ?? 0) + 1);
  const ws = await db.workouts.where('status').equals('completed').toArray();
  for (const w of ws) {
    const c = counts.get(w.id) ?? 0;
    if (c !== w.prCount) await db.workouts.update(w.id, { prCount: c });
  }
}

// ---------------- History lookups ----------------

export interface LastPerformance {
  workout: Workout;
  sets: WorkoutSet[];
  note: string;
}

/**
 * Last completed performance of an exercise – looked up through the exercise's
 * own history (independent of plans), so it works across different plans.
 */
export async function getLastPerformance(exerciseId: string, excludeWorkoutId?: string, before?: number): Promise<LastPerformance | null> {
  const sets = await db.sets.where('exerciseId').equals(exerciseId).toArray();
  const wids = [...new Set(sets.filter((s) => s.completed && s.workoutId !== excludeWorkoutId).map((s) => s.workoutId))];
  if (!wids.length) return null;
  const ws = (await db.workouts.bulkGet(wids)).filter(
    (w): w is Workout => !!w && w.status === 'completed' && (before == null || w.startedAt < before),
  );
  if (!ws.length) return null;
  const latest = ws.reduce((a, b) => ((a.endedAt ?? 0) >= (b.endedAt ?? 0) ? a : b));
  const lastSets = sets.filter((s) => s.workoutId === latest.id && s.completed);
  const weIds = new Set(lastSets.map((s) => s.workoutExerciseId));
  const wes = await db.workoutExercises.bulkGet([...weIds]);
  // if the exercise appeared twice in that workout, keep both in order
  const weOrder = new Map(wes.filter(Boolean).map((we) => [we!.id, we!.order]));
  lastSets.sort((a, b) => (weOrder.get(a.workoutExerciseId)! - weOrder.get(b.workoutExerciseId)!) || a.order - b.order);
  return { workout: latest, sets: lastSets, note: wes.map((w) => w?.note).filter(Boolean).join(' · ') };
}

export { stopRest };
