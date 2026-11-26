import type { FoodLogEntry, Nutrients, NutritionGoal, Profile, Sex } from '@/db/types';

export const NUTRIENT_KEYS: (keyof Nutrients)[] = ['kcal', 'protein', 'carbs', 'fat', 'fiber', 'sugar', 'satFat', 'salt'];

export const NUTRIENT_LABELS: Record<keyof Nutrients, string> = {
  kcal: 'Kalorien',
  protein: 'Protein',
  carbs: 'Kohlenhydrate',
  fat: 'Fett',
  fiber: 'Ballaststoffe',
  sugar: 'Zucker',
  satFat: 'Ges. Fettsäuren',
  salt: 'Salz',
};

export const EMPTY_NUTRIENTS: Nutrients = { kcal: null, protein: null, carbs: null, fat: null, fiber: null, sugar: null, satFat: null, salt: null };

/** Scale per-100 values to an amount (g/ml). Unknown values stay unknown (null). */
export function scale(per100: Nutrients, amount: number): Nutrients {
  const out = { ...EMPTY_NUTRIENTS };
  for (const k of NUTRIENT_KEYS) out[k] = per100[k] == null ? null : (per100[k]! * amount) / 100;
  return out;
}

/** Nutrients of a diary entry: food → per 100 g, recipe → per portion */
export function entryNutrients(e: Pick<FoodLogEntry, 'basis' | 'amount' | 'kind'>): Nutrients {
  if (e.kind === 'recipe') {
    const out = { ...EMPTY_NUTRIENTS };
    for (const k of NUTRIENT_KEYS) out[k] = e.basis[k] == null ? null : e.basis[k]! * e.amount;
    return out;
  }
  return scale(e.basis, e.amount);
}

export interface Totals extends Record<keyof Nutrients, number> {
  /** nutrients for which at least one item had no value → total is a lower bound */
  incomplete: (keyof Nutrients)[];
}

export function sumNutrients(list: Nutrients[]): Totals {
  const t = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, satFat: 0, salt: 0, incomplete: [] as (keyof Nutrients)[] };
  for (const n of list)
    for (const k of NUTRIENT_KEYS) {
      if (n[k] == null) {
        if (!t.incomplete.includes(k)) t.incomplete.push(k);
      } else t[k] += n[k]!;
    }
  return t;
}

/* ---------------- energy requirement ---------------- */

export const ACTIVITY_LEVELS: { value: Profile['activityLevel']; label: string; hint: string }[] = [
  { value: 1.2, label: 'Sitzend', hint: 'Bürojob, kaum Bewegung' },
  { value: 1.375, label: 'Leicht aktiv', hint: '1–3 Trainingseinheiten pro Woche' },
  { value: 1.55, label: 'Mäßig aktiv', hint: '3–5 Einheiten pro Woche' },
  { value: 1.725, label: 'Sehr aktiv', hint: '6–7 Einheiten pro Woche' },
  { value: 1.9, label: 'Extrem aktiv', hint: 'Körperliche Arbeit + Training' },
];

export const GOAL_LABELS: Record<NutritionGoal, string> = {
  muscle: 'Muskelaufbau',
  fatloss: 'Fettabbau',
  maintain: 'Gewicht halten',
  fitness: 'Allgemeine Fitness',
};

/** Mifflin-St Jeor (1990) – estimate of basal metabolic rate in kcal/day */
export function bmrMifflin(sex: Sex, weightKg: number, heightCm: number, age: number): number {
  return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'male' ? 5 : -161);
}

export interface EnergyPlan {
  bmr: number;
  tdee: number;
  adjustment: number;
  target: number;
  protein: number;
  fat: number;
  carbs: number;
  fiber: number;
  explanation: string[];
}

/**
 * Calculates estimates. Returns null if the profile lacks data.
 * Muscle gain: +10 % surplus (≈ 200–350 kcal); fat loss: −20 % deficit, never below BMR×1.1 / 1200 kcal.
 * Protein: 1.6–2.2 g/kg; fat ≈ 27 % of energy (min 0.6 g/kg); carbs = remainder.
 */
export function energyPlan(p: Pick<Profile, 'sex' | 'age' | 'heightCm' | 'activityLevel' | 'goal'>, weightKg: number | null): EnergyPlan | null {
  if (!p.sex || !p.age || !p.heightCm || !weightKg) return null;
  const bmr = bmrMifflin(p.sex, weightKg, p.heightCm, p.age);
  const tdee = bmr * p.activityLevel;
  const explanation = [
    `Grundumsatz (Mifflin-St Jeor): ${Math.round(bmr)} kcal`,
    `× Aktivitätsfaktor ${String(p.activityLevel).replace('.', ',')} = Gesamtbedarf ${Math.round(tdee)} kcal`,
  ];
  let adjustment = 0;
  if (p.goal === 'muscle') adjustment = Math.round(Math.min(350, Math.max(200, tdee * 0.1)));
  if (p.goal === 'fatloss') adjustment = -Math.round(Math.min(tdee * 0.2, Math.max(0, tdee - Math.max(bmr * 1.1, 1200))));
  if (adjustment > 0) explanation.push(`+ ${adjustment} kcal Überschuss für Muskelaufbau`);
  if (adjustment < 0) explanation.push(`− ${-adjustment} kcal Defizit für Fettabbau`);
  const target = Math.round((tdee + adjustment) / 10) * 10;
  const gPerKg = { muscle: 2.0, fatloss: 2.2, maintain: 1.8, fitness: 1.6 }[p.goal];
  const protein = Math.round(weightKg * gPerKg);
  const fat = Math.round(Math.max(weightKg * 0.6, (target * 0.27) / 9));
  const carbs = Math.max(0, Math.round((target - protein * 4 - fat * 9) / 4));
  const fiber = Math.round((target / 1000) * 14);
  explanation.push(`Protein ${String(gPerKg).replace('.', ',')} g/kg · Fett ≈ 27 % · Kohlenhydrate = Rest`);
  return { bmr, tdee, adjustment, target, protein, fat, carbs, fiber, explanation };
}

export interface Targets {
  kcal: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fiber: number | null;
  /** per target: whether calculated or set manually */
  manual: Record<'kcal' | 'protein' | 'carbs' | 'fat' | 'fiber', boolean>;
  plan: EnergyPlan | null;
  /** dynamic budget: active calories added */
  activeBonus: number;
}

/**
 * Daily targets: manual overrides win, otherwise the estimate.
 * Dynamic mode avoids double counting: uses BMR×1.2 (no activity factor) + measured active kcal.
 */
export function dailyTargets(p: Profile, weightKg: number | null, activeKcal: number | null): Targets {
  const plan = energyPlan(p, weightKg);
  let kcal = plan?.target ?? null;
  let activeBonus = 0;
  if (plan && p.budgetMode === 'dynamic' && activeKcal != null) {
    activeBonus = Math.round(activeKcal);
    kcal = Math.round(plan.bmr * 1.2 + plan.adjustment + activeBonus);
  }
  return {
    kcal: p.kcalTarget ?? kcal,
    protein: p.proteinTarget ?? plan?.protein ?? null,
    carbs: p.carbsTarget ?? plan?.carbs ?? null,
    fat: p.fatTarget ?? plan?.fat ?? null,
    fiber: p.fiberTarget ?? plan?.fiber ?? null,
    manual: {
      kcal: p.kcalTarget != null,
      protein: p.proteinTarget != null,
      carbs: p.carbsTarget != null,
      fat: p.fatTarget != null,
      fiber: p.fiberTarget != null,
    },
    plan,
    activeBonus,
  };
}

/** Expected weekly weight change (kg) from an average daily energy balance (7700 kcal ≈ 1 kg) */
export function expectedWeeklyChange(avgBalanceKcal: number): number {
  return (avgBalanceKcal * 7) / 7700;
}
