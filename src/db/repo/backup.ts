import { db } from '../db';
import { rebuildExerciseRecords, rebuildWorkoutVolumeRecords } from './records';
import { recomputePrCounts } from './workouts';
import { fmtDate, fmtTime } from '@/lib/time';
import { setVolume } from '@/lib/metrics';

export const BACKUP_VERSION = 2;

export async function exportJSON(): Promise<string> {
  const data = {
    app: 'forge',
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    exercises: await db.exercises.toArray(),
    exerciseNotes: await db.exerciseNotes.toArray(),
    plans: await db.plans.toArray(),
    workouts: (await db.workouts.toArray()).filter((w) => w.status === 'completed'),
    workoutExercises: await db.workoutExercises.toArray(),
    sets: await db.sets.toArray(),
    settings: await db.settings.toArray(),
    // v2: health & nutrition (OAuth tokens in healthSources are intentionally NOT exported)
    healthMetrics: await db.healthMetrics.toArray(),
    healthHourly: await db.healthHourly.toArray(),
    foods: await db.foods.toArray(),
    foodLog: await db.foodLog.toArray(),
    recipes: await db.recipes.toArray(),
    profile: await db.profile.toArray(),
  };
  // Only include rows that belong to completed workouts
  const done = new Set(data.workouts.map((w) => w.id));
  data.workoutExercises = data.workoutExercises.filter((w) => done.has(w.workoutId));
  data.sets = data.sets.filter((s) => done.has(s.workoutId));
  return JSON.stringify(data, null, 2);
}

const csvCell = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function exportCSV(): Promise<string> {
  const ws = (await db.workouts.where('status').equals('completed').toArray()).sort((a, b) => a.startedAt - b.startedAt);
  const wes = new Map((await db.workoutExercises.toArray()).map((w) => [w.id, w]));
  const sets = await db.sets.toArray();
  const rows = [
    ['Datum', 'Start', 'Workout', 'Übung', 'Muskelgruppe', 'Satz', 'Typ', 'Gewicht (kg)', 'Wiederholungen', 'Haltezeit (s)', 'Satzdauer (s)', 'Volumen (kg)', 'Notiz'],
  ];
  for (const w of ws) {
    const ss = sets
      .filter((s) => s.workoutId === w.id)
      .sort((a, b) => (wes.get(a.workoutExerciseId)?.order ?? 0) - (wes.get(b.workoutExerciseId)?.order ?? 0) || a.order - b.order);
    for (const s of ss) {
      const we = wes.get(s.workoutExerciseId);
      rows.push([
        fmtDate(w.startedAt),
        fmtTime(w.startedAt),
        w.name,
        we?.snapshot.nameDe ?? '',
        we?.snapshot.muscleGroup ?? '',
        String(s.order + 1),
        s.kind === 'warmup' ? 'Aufwärmen' : 'Arbeitssatz',
        s.weight == null ? '' : String(s.weight).replace('.', ','),
        s.reps == null ? '' : String(s.reps),
        s.holdSec == null ? '' : String(s.holdSec),
        s.durationSec == null ? '' : String(s.durationSec),
        String(setVolume(s)).replace('.', ','),
        we?.note ?? '',
      ]);
    }
  }
  return '﻿' + rows.map((r) => r.map(csvCell).join(';')).join('\n');
}

export function downloadText(filename: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Restore a JSON backup. Replaces all data except an active workout. */
export async function importJSON(text: string): Promise<{ workouts: number }> {
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Die Datei ist kein gültiges JSON.');
  }
  if (data?.app !== 'forge' || !Array.isArray(data.exercises) || !Array.isArray(data.workouts))
    throw new Error('Die Datei ist kein Forge-Backup.');
  if (data.version > BACKUP_VERSION) throw new Error('Das Backup stammt aus einer neueren App-Version.');

  await db.transaction(
    'rw',
    [db.exercises, db.exerciseNotes, db.plans, db.workouts, db.workoutExercises, db.sets, db.records, db.settings, db.healthMetrics, db.healthHourly, db.foods, db.foodLog, db.recipes, db.profile],
    async () => {
      const active = await db.workouts.where('status').equals('active').toArray();
      const activeIds = new Set(active.map((w) => w.id));
      await db.exercises.clear();
      await db.exerciseNotes.clear();
      await db.plans.clear();
      await db.records.clear();
      await db.workouts.filter((w) => !activeIds.has(w.id)).delete();
      await db.workoutExercises.filter((w) => !activeIds.has(w.workoutId)).delete();
      await db.sets.filter((s) => !activeIds.has(s.workoutId)).delete();
      await db.exercises.bulkPut(data.exercises);
      await db.exerciseNotes.bulkPut(data.exerciseNotes ?? []);
      await db.plans.bulkPut(data.plans ?? []);
      await db.workouts.bulkPut(data.workouts.filter((w: any) => w.status === 'completed'));
      await db.workoutExercises.bulkPut(data.workoutExercises ?? []);
      await db.sets.bulkPut(data.sets ?? []);
      if (data.settings?.[0]) await db.settings.put({ ...data.settings[0], onboardedAt: data.settings[0].onboardedAt ?? Date.now(), id: 'settings' });
      if (data.version >= 2) {
        // older backups may still contain sleep / vital values – those areas no longer exist
        const kept = new Set(['steps', 'distance_m', 'floors', 'active_min', 'active_kcal', 'basal_kcal', 'total_kcal', 'weight_kg', 'body_fat_pct']);
        if (Array.isArray(data.healthMetrics)) data.healthMetrics = data.healthMetrics.filter((m: { metric: string }) => kept.has(m.metric));
        if (Array.isArray(data.profile)) data.profile = data.profile.map(({ sleepGoalMin: _drop, ...p }: Record<string, unknown>) => p);
        for (const t of ['healthMetrics', 'healthHourly', 'foods', 'foodLog', 'recipes', 'profile'] as const) {
          await db[t].clear();
          if (Array.isArray(data[t])) await (db[t] as any).bulkPut(data[t]);
        }
      }
    },
  );
  const exIds = (await db.exercises.toCollection().primaryKeys()) as string[];
  await rebuildExerciseRecords(exIds);
  await rebuildWorkoutVolumeRecords();
  await recomputePrCounts();
  return { workouts: data.workouts.length };
}

export async function wipeAllData(): Promise<void> {
  await db.delete();
  try {
    // unsaved drafts (onboarding, plan editor) belong to the wiped data as well
    for (const k of Object.keys(localStorage)) if (k === 'forge-onboarding' || k.startsWith('forge-plan-draft:')) localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
  location.reload();
}

/** Food diary as CSV (one row per entry, nutrients for the logged amount). */
export async function exportNutritionCSV(): Promise<string> {
  const { entryNutrients } = await import('@/nutrition/calc');
  const meals: Record<string, string> = { breakfast: 'Frühstück', lunch: 'Mittagessen', dinner: 'Abendessen', snack: 'Snacks' };
  const rows = [['Datum', 'Mahlzeit', 'Lebensmittel', 'Marke', 'Menge', 'Einheit', 'kcal', 'Protein (g)', 'Kohlenhydrate (g)', 'Fett (g)', 'Ballaststoffe (g)', 'Zucker (g)', 'Salz (g)', 'Quelle']];
  const n = (v: number | null) => (v == null ? '' : String(Math.round(v * 10) / 10).replace('.', ','));
  for (const e of (await db.foodLog.toArray()).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)) {
    const x = entryNutrients(e);
    rows.push([e.date, meals[e.meal], e.name, e.brand, n(e.amount), e.unit === 'portion' ? 'Portion' : e.unit, n(x.kcal), n(x.protein), n(x.carbs), n(x.fat), n(x.fiber), n(x.sugar), n(x.salt), e.source === 'off' ? 'Open Food Facts' : e.source === 'recipe' ? 'Rezept' : 'Eigenes']);
  }
  return '\uFEFF' + rows.map((r) => r.map(csvCell).join(';')).join('\n');
}
