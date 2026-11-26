import type { Exercise, ExerciseCategory, MuscleGroup, TrackingType } from './types';

type SeedExercise = {
  id: string;
  nameDe: string;
  nameEn: string;
  muscleGroup: MuscleGroup;
  secondaryMuscles: MuscleGroup[];
  category: ExerciseCategory;
  trackingType: TrackingType;
  description: string;
};

/** Stable ids so seed exercises keep their identity across installs / imports. */
export const SEED_EXERCISES: SeedExercise[] = [
  {
    id: 'ex-bench-press',
    nameDe: 'Bankdrücken',
    nameEn: 'Bench Press',
    muscleGroup: 'chest',
    secondaryMuscles: ['triceps', 'shoulders'],
    category: 'barbell',
    trackingType: 'weight_reps',
    description:
      'Flach auf der Bank liegen, Schulterblätter zusammenziehen, Füße fest am Boden. Stange kontrolliert zur unteren Brust senken und explosiv nach oben drücken.',
  },
  {
    id: 'ex-incline-bench-press',
    nameDe: 'Schrägbankdrücken',
    nameEn: 'Incline Bench Press',
    muscleGroup: 'chest',
    secondaryMuscles: ['shoulders', 'triceps'],
    category: 'barbell',
    trackingType: 'weight_reps',
    description:
      'Bank auf 30–45° einstellen. Stange zur oberen Brust senken und nach oben drücken. Betont den oberen Brustmuskel.',
  },
  {
    id: 'ex-db-bench-press',
    nameDe: 'Kurzhantel-Bankdrücken',
    nameEn: 'Dumbbell Bench Press',
    muscleGroup: 'chest',
    secondaryMuscles: ['triceps', 'shoulders'],
    category: 'dumbbell',
    trackingType: 'weight_reps',
    description:
      'Kurzhanteln seitlich der Brust absenken, Ellbogen ca. 45° vom Körper. Größerer Bewegungsradius als mit der Langhantel. Gewicht pro Hantel eintragen.',
  },
  {
    id: 'ex-overhead-press',
    nameDe: 'Schulterdrücken',
    nameEn: 'Overhead Press',
    muscleGroup: 'shoulders',
    secondaryMuscles: ['triceps', 'core'],
    category: 'barbell',
    trackingType: 'weight_reps',
    description:
      'Stehend oder sitzend, Gewicht von Schulterhöhe senkrecht über den Kopf drücken. Rumpf fest anspannen, kein Hohlkreuz.',
  },
  {
    id: 'ex-lateral-raise',
    nameDe: 'Seitheben',
    nameEn: 'Lateral Raise',
    muscleGroup: 'shoulders',
    secondaryMuscles: [],
    category: 'dumbbell',
    trackingType: 'weight_reps',
    description:
      'Kurzhanteln mit leicht gebeugten Armen seitlich bis Schulterhöhe anheben. Langsam absenken, kein Schwung.',
  },
  {
    id: 'ex-biceps-curl',
    nameDe: 'Bizepscurls',
    nameEn: 'Biceps Curl',
    muscleGroup: 'biceps',
    secondaryMuscles: ['forearms'],
    category: 'dumbbell',
    trackingType: 'weight_reps',
    description:
      'Ellbogen eng am Körper fixieren, Gewicht durch Beugung im Ellbogen nach oben curlen, oben kurz anspannen und kontrolliert absenken.',
  },
  {
    id: 'ex-hammer-curl',
    nameDe: 'Hammer Curls',
    nameEn: 'Hammer Curl',
    muscleGroup: 'biceps',
    secondaryMuscles: ['forearms'],
    category: 'dumbbell',
    trackingType: 'weight_reps',
    description:
      'Curl mit neutralem Griff (Daumen zeigen nach oben). Trainiert Brachialis und Unterarme zusätzlich zum Bizeps.',
  },
  {
    id: 'ex-triceps-pushdown',
    nameDe: 'Trizepsdrücken am Kabel',
    nameEn: 'Cable Triceps Pushdown',
    muscleGroup: 'triceps',
    secondaryMuscles: [],
    category: 'cable',
    trackingType: 'weight_reps',
    description:
      'Am Kabelzug mit Seil oder Stange, Ellbogen am Körper fixieren und die Arme vollständig nach unten strecken.',
  },
  {
    id: 'ex-pull-up',
    nameDe: 'Klimmzüge',
    nameEn: 'Pull-up',
    muscleGroup: 'back',
    secondaryMuscles: ['biceps', 'forearms'],
    category: 'bodyweight',
    trackingType: 'bodyweight_reps',
    description:
      'Aus dem Hang mit schulterbreitem Obergriff hochziehen, bis das Kinn über der Stange ist. Zusatzgewicht optional eintragen.',
  },
  {
    id: 'ex-lat-pulldown',
    nameDe: 'Latzug',
    nameEn: 'Lat Pulldown',
    muscleGroup: 'back',
    secondaryMuscles: ['biceps'],
    category: 'cable',
    trackingType: 'weight_reps',
    description:
      'Stange breit greifen und zur oberen Brust ziehen. Brust raus, Schulterblätter nach unten und hinten ziehen.',
  },
  {
    id: 'ex-seated-cable-row',
    nameDe: 'Rudern am Kabelzug',
    nameEn: 'Seated Cable Row',
    muscleGroup: 'back',
    secondaryMuscles: ['biceps', 'shoulders'],
    category: 'cable',
    trackingType: 'weight_reps',
    description:
      'Aufrecht sitzen, Griff zum Bauch ziehen und Schulterblätter zusammenführen. Oberkörper bleibt stabil.',
  },
  {
    id: 'ex-barbell-row',
    nameDe: 'Langhantelrudern',
    nameEn: 'Barbell Row',
    muscleGroup: 'back',
    secondaryMuscles: ['biceps', 'hamstrings'],
    category: 'barbell',
    trackingType: 'weight_reps',
    description:
      'Oberkörper vorgebeugt, Rücken gerade. Stange zum unteren Bauch ziehen und kontrolliert absenken.',
  },
  {
    id: 'ex-squat',
    nameDe: 'Kniebeugen',
    nameEn: 'Back Squat',
    muscleGroup: 'quads',
    secondaryMuscles: ['glutes', 'hamstrings', 'core'],
    category: 'barbell',
    trackingType: 'weight_reps',
    description:
      'Stange auf dem oberen Rücken, schulterbreiter Stand. Hüfte nach hinten-unten bis mindestens parallel, Knie folgen den Zehen.',
  },
  {
    id: 'ex-leg-press',
    nameDe: 'Beinpresse',
    nameEn: 'Leg Press',
    muscleGroup: 'quads',
    secondaryMuscles: ['glutes', 'hamstrings'],
    category: 'machine',
    trackingType: 'weight_reps',
    description:
      'Füße schulterbreit auf der Plattform, Gewicht kontrolliert absenken bis ca. 90° Kniewinkel, ohne die Knie durchzustrecken drücken.',
  },
  {
    id: 'ex-leg-extension',
    nameDe: 'Beinstrecker',
    nameEn: 'Leg Extension',
    muscleGroup: 'quads',
    secondaryMuscles: [],
    category: 'machine',
    trackingType: 'weight_reps',
    description: 'Isolationsübung für den Quadrizeps. Beine vollständig strecken, oben kurz halten und langsam absenken.',
  },
  {
    id: 'ex-leg-curl',
    nameDe: 'Beinbeuger',
    nameEn: 'Leg Curl',
    muscleGroup: 'hamstrings',
    secondaryMuscles: ['calves'],
    category: 'machine',
    trackingType: 'weight_reps',
    description: 'Liegend oder sitzend die Fersen Richtung Gesäß beugen. Hüfte bleibt fest auf dem Polster.',
  },
  {
    id: 'ex-deadlift',
    nameDe: 'Kreuzheben',
    nameEn: 'Deadlift',
    muscleGroup: 'back',
    secondaryMuscles: ['hamstrings', 'glutes', 'forearms', 'core'],
    category: 'barbell',
    trackingType: 'weight_reps',
    description:
      'Stange über dem Mittelfuß, neutraler Rücken. Durch Hüft- und Kniestreckung aufrichten, Stange nah am Körper führen.',
  },
  {
    id: 'ex-calf-raise',
    nameDe: 'Wadenheben',
    nameEn: 'Calf Raise',
    muscleGroup: 'calves',
    secondaryMuscles: [],
    category: 'machine',
    trackingType: 'weight_reps',
    description: 'Auf die Fußballen drücken, oben kurz halten, unten volle Dehnung zulassen.',
  },
  {
    id: 'ex-crunch',
    nameDe: 'Bauch-Crunches',
    nameEn: 'Crunch',
    muscleGroup: 'core',
    secondaryMuscles: [],
    category: 'bodyweight',
    trackingType: 'bodyweight_reps',
    description: 'Rückenlage, Knie gebeugt. Oberkörper durch Anspannen der Bauchmuskeln einrollen, Nacken locker lassen.',
  },
  {
    id: 'ex-plank',
    nameDe: 'Plank',
    nameEn: 'Plank',
    muscleGroup: 'core',
    secondaryMuscles: ['shoulders', 'glutes'],
    category: 'bodyweight',
    trackingType: 'duration',
    description:
      'Unterarmstütz, Körper bildet eine gerade Linie von Kopf bis Ferse. Bauch und Gesäß anspannen und Position halten. Gemessen wird die Haltezeit.',
  },
];

export function buildSeedExercises(now = Date.now()): Exercise[] {
  return SEED_EXERCISES.map((e) => ({
    ...e,
    isCustom: 0,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  }));
}
