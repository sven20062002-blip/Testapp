import type { ExerciseCategory, MuscleGroup, RecordType, TrackingType } from '@/db/types';

export const MUSCLE_LABELS: Record<MuscleGroup, string> = {
  chest: 'Brust',
  back: 'Rücken',
  shoulders: 'Schultern',
  biceps: 'Bizeps',
  triceps: 'Trizeps',
  forearms: 'Unterarme',
  quads: 'Quadrizeps',
  hamstrings: 'Beinbeuger',
  glutes: 'Gesäß',
  calves: 'Waden',
  core: 'Bauch & Core',
  fullbody: 'Ganzkörper',
  cardio: 'Cardio',
};

export const CATEGORY_LABELS: Record<ExerciseCategory, string> = {
  barbell: 'Langhantel',
  dumbbell: 'Kurzhantel',
  machine: 'Maschine',
  cable: 'Kabelzug',
  bodyweight: 'Körpergewicht',
  other: 'Sonstiges',
};

export const TRACKING_LABELS: Record<TrackingType, string> = {
  weight_reps: 'Gewicht × Wiederholungen',
  bodyweight_reps: 'Wiederholungen (+ optionales Zusatzgewicht)',
  duration: 'Haltezeit',
};

export const RECORD_LABELS: Record<RecordType, string> = {
  weight: 'Höchstes Gewicht',
  reps: 'Meiste Wiederholungen',
  e1rm: 'Geschätztes 1RM',
  volume: 'Höchstes Übungsvolumen',
  duration: 'Längste Haltezeit',
  workoutVolume: 'Höchstes Workout-Volumen',
};

export const MUSCLE_ORDER: MuscleGroup[] = [
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'forearms',
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'core',
  'fullbody',
  'cardio',
];

export const PLAN_COLORS = ['#CDFF40', '#60A5FA', '#F472B6', '#FB923C', '#A78BFA', '#34D399', '#FACC15', '#F87171'];
