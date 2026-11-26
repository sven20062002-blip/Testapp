import { db } from '../db';
import type { Exercise, ExerciseSnapshot } from '../types';
import { uid } from '@/lib/id';

export type ExerciseInput = Pick<
  Exercise,
  'nameDe' | 'nameEn' | 'muscleGroup' | 'secondaryMuscles' | 'category' | 'trackingType' | 'description'
>;

export function validateExercise(input: ExerciseInput): string | null {
  if (!input.nameDe.trim()) return 'Bitte einen Namen eingeben.';
  if (input.nameDe.trim().length > 60) return 'Der Name darf höchstens 60 Zeichen lang sein.';
  return null;
}

export async function createExercise(input: ExerciseInput): Promise<Exercise> {
  const err = validateExercise(input);
  if (err) throw new Error(err);
  const name = input.nameDe.trim();
  const dupe = await db.exercises
    .filter((e) => e.deletedAt == null && e.nameDe.toLowerCase() === name.toLowerCase())
    .first();
  if (dupe) throw new Error(`Eine Übung „${name}“ existiert bereits.`);
  const now = Date.now();
  const ex: Exercise = {
    id: uid(),
    ...input,
    nameDe: name,
    nameEn: input.nameEn.trim() || name,
    description: input.description.trim(),
    isCustom: 1,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  await db.exercises.add(ex);
  return ex;
}

export async function updateExercise(id: string, input: ExerciseInput): Promise<void> {
  const err = validateExercise(input);
  if (err) throw new Error(err);
  await db.exercises.update(id, {
    ...input,
    nameDe: input.nameDe.trim(),
    nameEn: input.nameEn.trim() || input.nameDe.trim(),
    description: input.description.trim(),
    updatedAt: Date.now(),
  });
}

/**
 * Soft delete: the exercise vanishes from the library and from plans, but all
 * historical workouts keep their data (workout exercises carry a snapshot).
 */
export async function deleteExercise(id: string): Promise<{ removedFromPlans: number }> {
  let removedFromPlans = 0;
  await db.transaction('rw', db.exercises, db.plans, async () => {
    await db.exercises.update(id, { deletedAt: Date.now(), updatedAt: Date.now() });
    const plans = await db.plans.toArray();
    for (const p of plans) {
      if (p.exercises.some((pe) => pe.exerciseId === id)) {
        removedFromPlans++;
        await db.plans.update(p.id, {
          exercises: p.exercises.filter((pe) => pe.exerciseId !== id),
          updatedAt: Date.now(),
        });
      }
    }
  });
  return { removedFromPlans };
}

export async function restoreExercise(id: string): Promise<void> {
  await db.exercises.update(id, { deletedAt: null, updatedAt: Date.now() });
}

export function snapshotOf(e: Exercise): ExerciseSnapshot {
  return {
    nameDe: e.nameDe,
    nameEn: e.nameEn,
    muscleGroup: e.muscleGroup,
    category: e.category,
    trackingType: e.trackingType,
  };
}

export async function saveExerciseNote(exerciseId: string, text: string): Promise<void> {
  if (!text.trim()) {
    await db.exerciseNotes.delete(exerciseId);
    return;
  }
  await db.exerciseNotes.put({ exerciseId, text, updatedAt: Date.now() });
}

export function exerciseName(e: { nameDe: string; nameEn: string }, lang: 'de' | 'en'): string {
  return lang === 'en' ? e.nameEn || e.nameDe : e.nameDe;
}

export function matchesSearch(e: { nameDe: string; nameEn: string }, q: string): boolean {
  if (!q) return true;
  const n = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const needle = n(q.trim());
  return n(e.nameDe).includes(needle) || n(e.nameEn).includes(needle);
}
