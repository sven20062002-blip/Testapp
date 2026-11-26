import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db/db';
import { initDatabase } from '@/db/init';
import * as W from '@/db/repo/workouts';
import { saveExerciseNote, deleteExercise, createExercise } from '@/db/repo/exercises';
import { duplicatePlan, savePlan } from '@/db/repo/plans';
import { getRest, adjustRest } from '@/db/repo/timers';
import { currentBests } from '@/db/repo/records';
import { updateSettings } from '@/db/repo/settings';
import { exportJSON, importJSON } from '@/db/repo/backup';

async function doWorkout(exerciseId: string, sets: [number, number][], at: number) {
  vi.setSystemTime(at);
  const wid = await W.startWorkout();
  const weId = await W.addExerciseToWorkout(wid, exerciseId);
  const existing = await db.sets.where('workoutExerciseId').equals(weId).sortBy('order');
  for (const s of existing.slice(sets.length)) await W.deleteSet(s.id);
  for (let i = 0; i < sets.length; i++) {
    const cur = await db.sets.where('workoutExerciseId').equals(weId).sortBy('order');
    const id = cur[i]?.id ?? (await W.addSet(weId));
    await W.updateSet(id, { weight: sets[i][0], reps: sets[i][1] });
    await W.completeSet(id);
  }
  vi.setSystemTime(at + 45 * 60_000);
  await W.finishWorkout(wid);
  return wid;
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-01-05T10:00:00'));
  await db.delete();
  await db.open();
  await initDatabase();
});

describe('initialisation', () => {
  it('seeds 20 exercises and starter plans exactly once', async () => {
    await initDatabase();
    expect(await db.exercises.count()).toBe(20);
    expect(await db.plans.count()).toBe(3);
  });
});

describe('workout flow', () => {
  it('records sets, durations, volume, removes open sets on finish', async () => {
    const t0 = new Date('2026-01-05T10:00:00').getTime();
    const wid = await W.startWorkout();
    const weId = await W.addExerciseToWorkout(wid, 'ex-bench-press');
    const sets = await db.sets.where('workoutExerciseId').equals(weId).sortBy('order');
    expect(sets).toHaveLength(3);

    // set timer
    await W.startSetTimer(sets[0].id);
    vi.setSystemTime(t0 + 40_000);
    await W.updateSet(sets[0].id, { weight: 60, reps: 12 });
    const r = await W.completeSet(sets[0].id);
    expect(r.error).toBeUndefined();
    const done = await db.sets.get(sets[0].id);
    expect(done!.durationSec).toBe(40);
    // rest timer auto-started with default 90s
    const rest = await getRest();
    expect(rest.status).toBe('running');
    expect(rest.endsAt! - Date.now()).toBe(90_000);
    await adjustRest(15);
    expect((await getRest()).endsAt! - Date.now()).toBe(105_000);

    // complete with suggestion (empty fields)
    await W.updateSet(sets[1].id, { weight: 70 });
    await W.completeSet(sets[1].id, { weight: 65, reps: 10, holdSec: null });
    expect(await db.sets.get(sets[1].id)).toMatchObject({ weight: 70, reps: 10, completed: 1 });

    // validation
    const bad = await W.completeSet(sets[2].id);
    expect(bad.error).toMatch(/Wiederholungen/);

    // pause the workout for 60s
    vi.setSystemTime(t0 + 100_000);
    await W.pauseWorkout(wid);
    vi.setSystemTime(t0 + 160_000);
    await W.resumeWorkout(wid);
    vi.setSystemTime(t0 + 300_000);
    await W.finishWorkout(wid);

    const w = await db.workouts.get(wid);
    expect(w).toMatchObject({ status: 'completed', durationSec: 240, totalVolume: 720 + 700, totalSets: 2, totalReps: 22 });
    expect(await db.sets.where('workoutId').equals(wid).count()).toBe(2);
    expect((await getRest()).status).toBe('idle');
  });

  it('only one active workout', async () => {
    const a = await W.startWorkout();
    const b = await W.startWorkout();
    expect(a).toBe(b);
  });

  it('starting a plan copies structure without touching history', async () => {
    const plan = (await db.plans.toArray()).find((p) => p.name === 'Push Day')!;
    const w1 = await doWorkout('ex-bench-press', [[60, 12], [70, 10]], Date.now());
    const before = await db.sets.where('workoutId').equals(w1).toArray();
    vi.setSystemTime(Date.now() + 86400000);
    const wid = await W.startWorkout({ planId: plan.id });
    const wes = await db.workoutExercises.where('workoutId').equals(wid).sortBy('order');
    expect(wes.map((w) => w.exerciseId)).toEqual(plan.exercises.map((e) => e.exerciseId));
    expect(await db.sets.where('workoutId').equals(wid).count()).toBe(plan.exercises.reduce((a, e) => a + e.targetSets, 0));
    // last performance comes from exercise history (workout w1 had no plan)
    const last = await W.getLastPerformance('ex-bench-press', wid);
    expect(last!.workout.id).toBe(w1);
    expect(last!.sets.map((s) => [s.weight, s.reps])).toEqual([[60, 12], [70, 10]]);
    const after = await db.sets.where('workoutId').equals(w1).toArray();
    expect(after).toEqual(before);
  });

  it('detects PRs live and stores timeline; deleting a workout recomputes', async () => {
    const day = 86400000;
    const t = Date.now();
    await doWorkout('ex-bench-press', [[80, 8]], t);
    // second workout with heavier set
    vi.setSystemTime(t + day);
    const wid = await W.startWorkout();
    const weId = await W.addExerciseToWorkout(wid, 'ex-bench-press');
    const [s1] = await db.sets.where('workoutExerciseId').equals(weId).sortBy('order');
    await W.updateSet(s1.id, { weight: 85, reps: 8 });
    const res = await W.completeSet(s1.id);
    expect(res.prs.find((p) => p.type === 'weight')).toMatchObject({ value: 85, prevValue: 80, prevReps: 8 });
    await W.finishWorkout(wid);
    expect((await db.workouts.get(wid))!.prCount).toBeGreaterThan(0);
    let bests = currentBests(await db.records.toArray());
    expect(bests.get('ex-bench-press:weight')!.value).toBe(85);
    await W.deleteWorkout(wid);
    bests = currentBests(await db.records.toArray());
    expect(bests.get('ex-bench-press:weight')!.value).toBe(80);
  });

  it('PR alerts can be disabled', async () => {
    await doWorkout('ex-squat', [[100, 5]], Date.now());
    await updateSettings({ prAlerts: false });
    vi.setSystemTime(Date.now() + 86400000);
    const wid = await W.startWorkout();
    const weId = await W.addExerciseToWorkout(wid, 'ex-squat');
    const [s1] = await db.sets.where('workoutExerciseId').equals(weId).sortBy('order');
    await W.updateSet(s1.id, { weight: 110, reps: 5 });
    expect((await W.completeSet(s1.id)).prs).toEqual([]);
  });
});

describe('notes', () => {
  it('permanent exercise notes survive workouts, one-off notes stay with the workout', async () => {
    await saveExerciseNote('ex-bench-press', 'Griff enger');
    const wid = await W.startWorkout();
    const weId = await W.addExerciseToWorkout(wid, 'ex-bench-press');
    await W.setWorkoutExerciseNote(weId, 'Schulter zwickt heute');
    await W.setWorkoutNote(wid, 'Müde');
    const [s] = await db.sets.where('workoutExerciseId').equals(weId).toArray();
    await W.updateSet(s.id, { weight: 50, reps: 5 });
    await W.completeSet(s.id);
    await W.finishWorkout(wid);
    expect((await db.exerciseNotes.get('ex-bench-press'))!.text).toBe('Griff enger');
    expect((await db.workoutExercises.get(weId))!.note).toBe('Schulter zwickt heute');
    expect((await db.workouts.get(wid))!.note).toBe('Müde');
  });
});

describe('exercises & plans', () => {
  it('deleting an exercise keeps history and removes it from plans', async () => {
    const ex = await createExercise({ nameDe: 'Dips', nameEn: 'Dips', muscleGroup: 'triceps', secondaryMuscles: [], category: 'bodyweight', trackingType: 'bodyweight_reps', description: '' });
    await expect(createExercise({ nameDe: 'dips', nameEn: '', muscleGroup: 'triceps', secondaryMuscles: [], category: 'bodyweight', trackingType: 'bodyweight_reps', description: '' })).rejects.toThrow();
    const wid = await doWorkout(ex.id, [[0, 12]], Date.now());
    const pid = await savePlan({ name: 'Arme', description: '', color: '#fff', exercises: [{ id: 'x', exerciseId: ex.id, targetSets: 3, targetReps: '', restSec: null }, { id: 'y', exerciseId: 'ex-biceps-curl', targetSets: 3, targetReps: '', restSec: null }] });
    const { removedFromPlans } = await deleteExercise(ex.id);
    expect(removedFromPlans).toBe(1);
    expect((await db.plans.get(pid))!.exercises).toHaveLength(1);
    const wes = await db.workoutExercises.where('workoutId').equals(wid).toArray();
    expect(wes[0].snapshot.nameDe).toBe('Dips');
    expect(await db.sets.where('workoutId').equals(wid).count()).toBe(1);
  });
  it('duplicates plans with new ids', async () => {
    const p = (await db.plans.toArray())[0];
    const id = await duplicatePlan(p.id);
    const c = (await db.plans.get(id))!;
    expect(c.name).toContain('(Kopie)');
    expect(c.exercises.map((e) => e.exerciseId)).toEqual(p.exercises.map((e) => e.exerciseId));
    expect(c.exercises[0].id).not.toBe(p.exercises[0].id);
  });
  it('validates plans', async () => {
    await expect(savePlan({ name: '', description: '', color: '', exercises: [] })).rejects.toThrow();
  });
});

describe('backup', () => {
  it('export → import roundtrip', async () => {
    await doWorkout('ex-deadlift', [[140, 5], [150, 3]], Date.now());
    const json = await exportJSON();
    await db.workouts.clear();
    await db.sets.clear();
    const r = await importJSON(json);
    expect(r.workouts).toBe(1);
    expect(await db.sets.count()).toBe(2);
    expect(currentBests(await db.records.toArray()).get('ex-deadlift:weight')!.value).toBe(150);
  });
});
