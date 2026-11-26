import { db } from '../db';
import type { Plan, PlanExercise } from '../types';
import { uid } from '@/lib/id';
import { PLAN_COLORS } from '@/lib/labels';

export type PlanInput = Pick<Plan, 'name' | 'description' | 'color' | 'exercises'>;

export function validatePlan(p: PlanInput): string | null {
  if (!p.name.trim()) return 'Bitte gib dem Trainingsplan einen Namen.';
  if (p.name.trim().length > 50) return 'Der Name darf höchstens 50 Zeichen lang sein.';
  if (p.exercises.length === 0) return 'Füge mindestens eine Übung hinzu.';
  for (const e of p.exercises) {
    if (!Number.isInteger(e.targetSets) || e.targetSets < 1 || e.targetSets > 20)
      return 'Satzanzahl muss zwischen 1 und 20 liegen.';
    if (e.restSec != null && (e.restSec < 0 || e.restSec > 1800)) return 'Pausenzeit muss zwischen 0 und 30 Minuten liegen.';
  }
  return null;
}

export function newPlanExercise(exerciseId: string, targetSets = 3): PlanExercise {
  return { id: uid(), exerciseId, targetSets, targetReps: '', restSec: null };
}

export async function savePlan(input: PlanInput, id?: string): Promise<string> {
  const err = validatePlan(input);
  if (err) throw new Error(err);
  const now = Date.now();
  const clean = { ...input, name: input.name.trim(), description: input.description.trim() };
  if (id) {
    await db.plans.update(id, { ...clean, updatedAt: now });
    return id;
  }
  const plan: Plan = { id: uid(), ...clean, lastUsedAt: null, createdAt: now, updatedAt: now };
  await db.plans.add(plan);
  return plan.id;
}

export async function duplicatePlan(id: string): Promise<string> {
  const p = await db.plans.get(id);
  if (!p) throw new Error('Plan nicht gefunden');
  const now = Date.now();
  const copy: Plan = {
    ...p,
    id: uid(),
    name: `${p.name} (Kopie)`.slice(0, 50),
    exercises: p.exercises.map((e) => ({ ...e, id: uid() })),
    lastUsedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  await db.plans.add(copy);
  return copy.id;
}

export async function deletePlan(id: string): Promise<void> {
  // Workouts keep planId for reference only – history is untouched.
  await db.plans.delete(id);
}

/** Save the structure of an (old) workout as a new plan */
export async function planFromWorkout(workoutId: string, name: string): Promise<string> {
  const wes = await db.workoutExercises.where('workoutId').equals(workoutId).sortBy('order');
  const sets = await db.sets.where('workoutId').equals(workoutId).toArray();
  const exercises: PlanExercise[] = wes.map((we) => ({
    id: uid(),
    exerciseId: we.exerciseId,
    targetSets: Math.max(1, sets.filter((s) => s.workoutExerciseId === we.id).length),
    targetReps: we.targetReps,
    restSec: we.restSec,
  }));
  return savePlan({ name, description: '', color: PLAN_COLORS[1], exercises });
}

export const STARTER_PLANS: { name: string; description: string; color: string; ex: [string, number, string][] }[] = [
  {
    name: 'Push Day',
    description: 'Brust, Schultern und Trizeps',
    color: PLAN_COLORS[0],
    ex: [
      ['ex-bench-press', 4, '6-10'],
      ['ex-incline-bench-press', 3, '8-12'],
      ['ex-overhead-press', 3, '6-10'],
      ['ex-lateral-raise', 3, '12-15'],
      ['ex-triceps-pushdown', 3, '10-12'],
    ],
  },
  {
    name: 'Pull Day',
    description: 'Rücken und Bizeps',
    color: PLAN_COLORS[1],
    ex: [
      ['ex-pull-up', 3, 'max'],
      ['ex-barbell-row', 4, '6-10'],
      ['ex-lat-pulldown', 3, '8-12'],
      ['ex-seated-cable-row', 3, '10-12'],
      ['ex-biceps-curl', 3, '10-12'],
      ['ex-hammer-curl', 2, '10-12'],
    ],
  },
  {
    name: 'Leg Day',
    description: 'Beine, Waden und Core',
    color: PLAN_COLORS[3],
    ex: [
      ['ex-squat', 4, '5-8'],
      ['ex-leg-press', 3, '10-12'],
      ['ex-leg-extension', 3, '12-15'],
      ['ex-leg-curl', 3, '10-12'],
      ['ex-calf-raise', 4, '12-15'],
      ['ex-plank', 3, '45 s'],
    ],
  },
];
