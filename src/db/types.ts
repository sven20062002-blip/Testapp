/**
 * Domain model. All entities carry stable string ids (UUID) and timestamps so that
 * a later cloud sync can merge records (last-write-wins on `updatedAt`).
 * All weights are stored in KILOGRAMS. Unit conversion happens only in the UI.
 */

export type ID = string;

export type MuscleGroup =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'forearms'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'core'
  | 'fullbody'
  | 'cardio';

export type ExerciseCategory = 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight' | 'other';

/**
 * How a set of this exercise is measured.
 * - weight_reps:      classic strength set (kg × reps) – produces volume
 * - bodyweight_reps:  reps, optional additional weight (e.g. weighted pull-ups)
 * - duration:         hold time in seconds (e.g. plank) – never produces kg volume
 */
export type TrackingType = 'weight_reps' | 'bodyweight_reps' | 'duration';

export interface Exercise {
  id: ID;
  nameDe: string;
  nameEn: string;
  muscleGroup: MuscleGroup;
  secondaryMuscles: MuscleGroup[];
  category: ExerciseCategory;
  trackingType: TrackingType;
  description: string;
  isCustom: 0 | 1;
  /** Soft-delete. Deleted exercises disappear from the library but history keeps working. */
  deletedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

/** Permanent note attached to an exercise (survives across workouts). Key = exerciseId. */
export interface ExerciseNote {
  exerciseId: ID;
  text: string;
  updatedAt: number;
}

export interface PlanExercise {
  /** row id within the plan (needed for drag & drop and duplicate exercises) */
  id: ID;
  exerciseId: ID;
  targetSets: number;
  targetReps: string; // free text, e.g. "8-12"
  restSec: number | null; // null → global default
}

export interface Plan {
  id: ID;
  name: string;
  description: string;
  color: string;
  exercises: PlanExercise[];
  lastUsedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export type WorkoutStatus = 'active' | 'completed';

export interface Workout {
  id: ID;
  name: string;
  planId: ID | null;
  status: WorkoutStatus;
  startedAt: number;
  endedAt: number | null;
  /** Timestamp at which the workout clock was paused, null while running */
  pausedAt: number | null;
  /** Accumulated paused milliseconds */
  pausedMs: number;
  /** One-off note for this workout */
  note: string;
  /** Cached aggregates (written on finish / edit) */
  durationSec: number;
  totalVolume: number;
  totalSets: number;
  totalReps: number;
  prCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface ExerciseSnapshot {
  nameDe: string;
  nameEn: string;
  muscleGroup: MuscleGroup;
  category: ExerciseCategory;
  trackingType: TrackingType;
}

export interface WorkoutExercise {
  id: ID;
  workoutId: ID;
  exerciseId: ID;
  order: number;
  /** One-off note for this exercise in this workout only */
  note: string;
  restSec: number | null;
  targetReps: string;
  /** Copy of exercise meta → history stays readable even if the exercise gets deleted */
  snapshot: ExerciseSnapshot;
  createdAt: number;
  updatedAt: number;
}

export type SetKind = 'normal' | 'warmup';

export interface WorkoutSet {
  id: ID;
  workoutId: ID;
  workoutExerciseId: ID;
  exerciseId: ID;
  order: number;
  kind: SetKind;
  weight: number | null; // kg
  reps: number | null;
  /** Hold time for duration exercises (seconds) */
  holdSec: number | null;
  completed: 0 | 1;
  completedAt: number | null;
  /** Set timer: start timestamp, null if not started */
  timerStartedAt: number | null;
  /** Milliseconds the set timer was paused (workout pause) */
  timerPausedMs: number;
  /** Final measured set duration in seconds */
  durationSec: number | null;
  createdAt: number;
  updatedAt: number;
}

export type RecordType = 'weight' | 'reps' | 'e1rm' | 'volume' | 'duration' | 'workoutVolume';

/**
 * A personal record event. Every improvement is stored (timeline), the current
 * best is the latest row per (exerciseId, type).
 */
export interface PersonalRecord {
  id: ID;
  exerciseId: ID; // '__workout__' for workoutVolume
  type: RecordType;
  value: number;
  weight: number | null;
  reps: number | null;
  prevValue: number | null;
  prevWeight: number | null;
  prevReps: number | null;
  workoutId: ID;
  setId: ID | null;
  achievedAt: number;
}

export const WORKOUT_RECORD_KEY = '__workout__';

export interface RestTimerState {
  id: 'rest';
  status: 'idle' | 'running' | 'paused' | 'done';
  workoutId: ID | null;
  workoutExerciseId: ID | null;
  totalSec: number;
  /** epoch ms when countdown reaches 0 (running) */
  endsAt: number | null;
  /** remaining ms (paused) */
  remainingMs: number | null;
  startedAt: number | null;
  updatedAt: number;
}

export type ThemeMode = 'dark' | 'light' | 'system';
export type WeightUnit = 'kg' | 'lb';

export interface Settings {
  id: 'settings';
  theme: ThemeMode;
  unit: WeightUnit;
  exerciseLang: 'de' | 'en';
  defaultRestSec: number;
  autoRest: boolean;
  autoStartSetTimer: boolean;
  sound: boolean;
  vibration: boolean;
  prAlerts: boolean;
  confirmDeletes: boolean;
  keepAwake: boolean;
  weightStepKg: number;
  userName: string;
  weeklyGoal: number;
  /** set when the onboarding was completed (or skipped); null → onboarding is shown */
  onboardedAt: number | null;
  /** set when the app tour was finished or closed; null → tour is shown after the onboarding */
  tourSeenAt: number | null;
  updatedAt: number;
}

/* ======================================================================
 * HEALTH
 * ==================================================================== */

/** Where a health value came from. */
export type HealthSourceId = 'google' | 'apple' | 'bridge' | 'manual';

/** Data categories the user can grant individually per source. */
export type HealthCategory = 'activity' | 'body';

/**
 * Daily metrics. Units are fixed per metric (see METRIC_META in health/meta.ts).
 * Energy is split strictly: active_kcal (movement only), basal_kcal (resting energy),
 * total_kcal (= basal + active, as reported by the device). Never add them up blindly.
 */
export type MetricKey =
  | 'steps'
  | 'distance_m'
  | 'floors'
  | 'active_min'
  | 'active_kcal'
  | 'basal_kcal'
  | 'total_kcal'
  | 'weight_kg'
  | 'body_fat_pct';

/** measured = device/sensor value, estimated = vendor estimate, manual = typed by user */
export type ValueKind = 'measured' | 'estimated' | 'manual';

export interface HealthMetric {
  /** `${source}:${metric}:${date}` → re-imports overwrite instead of duplicating */
  id: string;
  source: HealthSourceId;
  metric: MetricKey;
  /** local calendar day YYYY-MM-DD */
  date: string;
  value: number;
  kind: ValueKind;
  /** origin detail (device / app name), if known */
  origin?: string;
  importedAt: number;
}

/** Hourly step distribution of one day (index 0 = 00:00–01:00, local time). */
export interface HealthHourly {
  id: string; // `${source}:${date}`
  source: HealthSourceId;
  date: string;
  steps: number[];
  importedAt: number;
}

export interface HealthSourceState {
  id: HealthSourceId;
  connected: boolean;
  /** user consent per category */
  categories: Record<HealthCategory, boolean>;
  lastSyncAt: number | null;
  lastStatus: 'idle' | 'syncing' | 'ok' | 'error';
  lastError: string | null;
  lastSummary: string | null;
  /** Google Health API: OAuth client id (public, not a secret) */
  clientId?: string;
  accessToken?: string | null;
  tokenExpiresAt?: number | null;
  grantedScopes?: string[];
  /** raw response samples for transparency / debugging, per data type */
  diagnostics?: Record<string, string>;
  consentAt?: number | null;
}

/* ======================================================================
 * NUTRITION
 * ==================================================================== */

export interface Nutrients {
  kcal: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fiber: number | null;
  sugar: number | null;
  satFat: number | null;
  salt: number | null;
}

export type FoodSource = 'off' | 'custom';

export interface Food {
  id: string;
  name: string;
  brand: string;
  barcode: string | null;
  /** nutrient values per 100 g (or 100 ml) – null = unknown, never guessed */
  per100: Nutrients;
  unit: 'g' | 'ml';
  servingSize: number | null;
  source: FoodSource;
  sourceUrl: string | null;
  /** data quality hints from the source (e.g. missing fields) */
  incomplete: boolean;
  favorite: 0 | 1;
  useCount: number;
  lastUsedAt: number | null;
  deletedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface FoodLogEntry {
  id: string;
  date: string;
  meal: MealSlot;
  kind: 'food' | 'recipe';
  refId: string;
  name: string;
  brand: string;
  /** grams/ml for foods, portions for recipes */
  amount: number;
  /** basis for calculation: per 100 g (food) or per portion (recipe) – snapshot */
  basis: Nutrients;
  unit: 'g' | 'ml' | 'portion';
  source: FoodSource | 'recipe';
  incomplete: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface RecipeItem {
  foodId: string;
  name: string;
  amount: number;
  per100: Nutrients;
  unit: 'g' | 'ml';
}

export interface Recipe {
  id: string;
  name: string;
  items: RecipeItem[];
  portions: number;
  createdAt: number;
  updatedAt: number;
}

export type Sex = 'male' | 'female';
export type NutritionGoal = 'muscle' | 'fatloss' | 'maintain' | 'fitness';

export interface Profile {
  id: 'profile';
  age: number | null;
  sex: Sex | null;
  heightCm: number | null;
  /** fallback if no weight entries exist */
  weightKg: number | null;
  goalWeightKg: number | null;
  activityLevel: 1.2 | 1.375 | 1.55 | 1.725 | 1.9;
  trainingDaysPerWeek: number;
  goal: NutritionGoal;
  /** manual overrides (null = use calculation) */
  kcalTarget: number | null;
  proteinTarget: number | null;
  carbsTarget: number | null;
  fatTarget: number | null;
  fiberTarget: number | null;
  /** 'static' = TDEE estimate; 'dynamic' = BMR×1.2 + measured active kcal of the day */
  budgetMode: 'static' | 'dynamic';
  stepGoal: number;
  /** order in which sources win when several report the same metric */
  sourcePriority: HealthSourceId[];
  updatedAt: number;
}

/* ======================================================================
 * SOCIAL (online) – local outbox for uploads while offline / not signed in
 * ==================================================================== */

export type OutboxKind = 'workout' | 'deleteWorkout' | 'duelSet';

export interface OutboxItem {
  id: string;
  kind: OutboxKind;
  /** local workout id (workout/deleteWorkout) or duel id (duelSet) */
  ref: string;
  payload: unknown;
  createdAt: number;
  attempts: number;
  lastError: string | null;
}
