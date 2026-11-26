import Dexie, { type Table } from 'dexie';
import type {
  Exercise,
  ExerciseNote,
  Food,
  FoodLogEntry,
  HealthHourly,
  HealthMetric,
  OutboxItem,
  HealthSourceState,
  Profile,
  Recipe,
  PersonalRecord,
  Plan,
  RestTimerState,
  Settings,
  Workout,
  WorkoutExercise,
  WorkoutSet,
} from './types';

export class ForgeDB extends Dexie {
  exercises!: Table<Exercise, string>;
  exerciseNotes!: Table<ExerciseNote, string>;
  plans!: Table<Plan, string>;
  workouts!: Table<Workout, string>;
  workoutExercises!: Table<WorkoutExercise, string>;
  sets!: Table<WorkoutSet, string>;
  records!: Table<PersonalRecord, string>;
  timers!: Table<RestTimerState, string>;
  settings!: Table<Settings, string>;
  healthMetrics!: Table<HealthMetric, string>;
  healthHourly!: Table<HealthHourly, string>;
  healthSources!: Table<HealthSourceState, string>;
  foods!: Table<Food, string>;
  foodLog!: Table<FoodLogEntry, string>;
  recipes!: Table<Recipe, string>;
  profile!: Table<Profile, string>;
  socialOutbox!: Table<OutboxItem, string>;

  constructor(name = 'forge') {
    super(name);
    this.version(1).stores({
      exercises: 'id, nameDe, muscleGroup, category, isCustom, deletedAt',
      exerciseNotes: 'exerciseId',
      plans: 'id, name, lastUsedAt, updatedAt',
      workouts: 'id, status, startedAt, endedAt, planId',
      workoutExercises: 'id, workoutId, exerciseId, [workoutId+order]',
      sets: 'id, workoutId, workoutExerciseId, exerciseId, completedAt',
      records: 'id, exerciseId, type, [exerciseId+type], workoutId, achievedAt',
      timers: 'id',
      settings: 'id',
    });
    // v2: health, sleep, nutrition, body
    this.version(2).stores({
      healthMetrics: 'id, source, metric, date, [metric+date]',
      healthHourly: 'id, source, date',
      sleepSessions: 'id, source, date, start',
      healthSources: 'id',
      foods: 'id, name, barcode, source, useCount, lastUsedAt, favorite, deletedAt',
      foodLog: 'id, date, [date+meal], refId',
      recipes: 'id, name',
      profile: 'id',
    });
    // v3: sleep & vital values removed from the app → drop the table and delete stored vitals
    this.version(3)
      .stores({ sleepSessions: null })
      .upgrade(async (tx) => {
        const removed = ['rhr', 'hr_avg', 'hr_max', 'hrv_rmssd', 'hrv_sdnn', 'resp_rate', 'skin_temp_dev', 'spo2'];
        await tx.table('healthMetrics').where('metric').anyOf(removed).delete();
        await tx.table('healthSources').toCollection().modify((s: { categories?: Record<string, boolean> }) => {
          if (s.categories) s.categories = { activity: !!s.categories.activity, body: !!s.categories.body };
        });
        await tx.table('profile').toCollection().modify((p: Record<string, unknown>) => {
          delete p.sleepGoalMin;
        });
      });
    // v4: outbox for online features (uploads queued while offline)
    this.version(4).stores({ socialOutbox: 'id, kind, ref, createdAt' });
    // v5: light mode is the new default – installs still on the old default (dark) switch once
    this.version(5)
      .stores({})
      .upgrade(async (tx) => {
        await tx.table('settings').toCollection().modify((s: { theme?: string }) => {
          if (!s.theme || s.theme === 'dark') s.theme = 'light';
        });
      });
  }
}

export const db = new ForgeDB();
