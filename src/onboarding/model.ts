import type { NutritionGoal, Profile, Settings, Sex, ThemeMode, WeightUnit } from '@/db/types';
import { getSettings, updateSettings } from '@/db/repo/settings';
import { getProfile, saveManualMetric, updateProfile } from '@/health/repo';
import { db } from '@/db/db';
import { dayKey } from '@/lib/day';
import { clearDraft, readDraft, writeDraft } from '@/lib/leave';
import { parseDecimal, unitToKg, weightInputValue } from '@/lib/units';

/**
 * Onboarding answers. Numbers are kept as the text the user typed (German decimal comma,
 * display unit) so a half-typed value survives leaving the app; they are parsed when saved.
 */
export interface OnboardingDraft {
  step: number;
  name: string;
  unit: WeightUnit;
  sex: Sex | null;
  age: string;
  heightCm: string;
  /** in `unit` */
  weight: string;
  /** in `unit`, optional */
  goalWeight: string;
  goal: NutritionGoal;
  trainingDays: number;
  activityLevel: Profile['activityLevel'];
  restSec: number;
  stepGoal: number;
  theme: ThemeMode;
  updatedAt: number;
}

export const STEPS = ['welcome', 'body', 'goal', 'training', 'daily', 'summary'] as const;
export type StepId = (typeof STEPS)[number];

export const DRAFT_KEY = 'forge-onboarding';

export function draftFrom(s: Settings, p: Profile, latestWeightKg: number | null): OnboardingDraft {
  const w = latestWeightKg ?? p.weightKg;
  return {
    step: 0,
    name: s.userName,
    unit: s.unit,
    sex: p.sex,
    age: p.age == null ? '' : String(p.age),
    heightCm: p.heightCm == null ? '' : String(p.heightCm),
    weight: weightInputValue(w, s.unit),
    goalWeight: weightInputValue(p.goalWeightKg, s.unit),
    goal: p.goal,
    trainingDays: s.weeklyGoal,
    activityLevel: p.activityLevel,
    restSec: s.defaultRestSec,
    stepGoal: p.stepGoal,
    theme: s.theme,
    updatedAt: Date.now(),
  };
}

const RANGES = {
  age: [14, 100],
  heightCm: [120, 230],
  weightKg: [30, 300],
} as const;

/** Parsed values (kg) or null when empty/invalid. */
export function parsed(d: OnboardingDraft) {
  const num = (t: string, [min, max]: readonly [number, number]) => {
    const v = parseDecimal(t);
    return v == null || v < min || v > max ? null : v;
  };
  const kg = (t: string) => {
    const v = parseDecimal(t);
    if (v == null) return null;
    const k = unitToKg(v, d.unit);
    return k < RANGES.weightKg[0] || k > RANGES.weightKg[1] ? null : Math.round(k * 10) / 10;
  };
  const age = num(d.age, RANGES.age);
  const height = num(d.heightCm, RANGES.heightCm);
  return {
    age: age == null ? null : Math.round(age),
    heightCm: height == null ? null : Math.round(height),
    weightKg: kg(d.weight),
    goalWeightKg: kg(d.goalWeight),
  };
}

/** Validation errors of one step (field → German message). Empty object = step complete. */
export function stepErrors(step: StepId, d: OnboardingDraft): Record<string, string> {
  const e: Record<string, string> = {};
  const p = parsed(d);
  const u = d.unit;
  const range = (kg: readonly [number, number]) => `${weightInputValue(kg[0], u)}–${weightInputValue(kg[1], u)} ${u}`;
  if (step === 'welcome') {
    if (d.name.trim().length > 24) e.name = 'Höchstens 24 Zeichen';
  }
  if (step === 'body') {
    if (!d.sex) e.sex = 'Bitte auswählen';
    if (!d.age.trim()) e.age = 'Bitte angeben';
    else if (p.age == null) e.age = `${RANGES.age[0]}–${RANGES.age[1]} Jahre`;
    if (!d.heightCm.trim()) e.heightCm = 'Bitte angeben';
    else if (p.heightCm == null) e.heightCm = `${RANGES.heightCm[0]}–${RANGES.heightCm[1]} cm`;
    if (!d.weight.trim()) e.weight = 'Bitte angeben';
    else if (p.weightKg == null) e.weight = range(RANGES.weightKg);
  }
  if (step === 'goal') {
    if (d.goalWeight.trim() && p.goalWeightKg == null) e.goalWeight = range(RANGES.weightKg);
  }
  if (step === 'training') {
    if (d.trainingDays < 1 || d.trainingDays > 14) e.trainingDays = '1–14 pro Woche';
  }
  if (step === 'daily') {
    if (d.stepGoal < 1000 || d.stepGoal > 50000) e.stepGoal = '1.000–50.000 Schritte';
  }
  return e;
}

/** First step that still has errors (used to block finishing). */
export function firstIncompleteStep(d: OnboardingDraft): number {
  const i = STEPS.findIndex((s) => Object.keys(stepErrors(s, d)).length > 0);
  return i;
}

/* ---------------- persistence ---------------- */

export function loadDraft(): OnboardingDraft | null {
  const d = readDraft<OnboardingDraft>(DRAFT_KEY);
  if (!d || typeof d !== 'object' || typeof d.step !== 'number') return null;
  return { ...d, step: Math.min(Math.max(0, d.step), STEPS.length - 1) };
}

export function saveDraft(d: OnboardingDraft): void {
  writeDraft(DRAFT_KEY, { ...d, updatedAt: Date.now() });
}

/**
 * Writes every *valid* answer into the database (settings + profile + today's weight).
 * Called on each step change, when the app is left and on finish – so nothing typed is lost,
 * even if the browser later clears localStorage. Invalid/empty fields are left untouched.
 */
export async function applyDraft(d: OnboardingDraft, finish: boolean | 'skip' = false): Promise<void> {
  const p = parsed(d);
  const profile: Partial<Omit<Profile, 'id'>> = {
    goal: d.goal,
    activityLevel: d.activityLevel,
    trainingDaysPerWeek: d.trainingDays,
    stepGoal: d.stepGoal,
  };
  if (d.sex) profile.sex = d.sex;
  if (p.age != null) profile.age = p.age;
  if (p.heightCm != null) profile.heightCm = p.heightCm;
  if (p.weightKg != null) profile.weightKg = p.weightKg;
  if (p.goalWeightKg != null || !d.goalWeight.trim()) profile.goalWeightKg = p.goalWeightKg;

  const settings: Partial<Omit<Settings, 'id'>> = {
    unit: d.unit,
    weeklyGoal: Math.min(14, Math.max(1, d.trainingDays)),
    defaultRestSec: d.restSec,
    theme: d.theme,
  };
  if (d.name.trim().length <= 24) settings.userName = d.name.trim();
  if (finish) settings.onboardedAt = Date.now(); // same transaction as the data → atomic

  await db.transaction('rw', [db.settings, db.profile, db.healthMetrics], async () => {
    await updateSettings(settings);
    await updateProfile(profile);
    // the starting weight also becomes the first entry of the weight history
    if (finish === true && p.weightKg != null) {
      const today = dayKey();
      const existing = await db.healthMetrics.where('[metric+date]').equals(['weight_kg', today]).first();
      if (!existing) await saveManualMetric('weight_kg', today, p.weightKg);
    }
  });
  if (finish) clearDraft(DRAFT_KEY);
}

/** Skip: keep defaults, never show the onboarding again (can be restarted in Settings). */
export async function skipOnboarding(d?: OnboardingDraft): Promise<void> {
  if (d) return applyDraft(d, 'skip');
  await updateSettings({ onboardedAt: Date.now() });
  clearDraft(DRAFT_KEY);
}

/** Settings → "Einrichtung erneut durchlaufen" */
export async function restartOnboarding(): Promise<void> {
  clearDraft(DRAFT_KEY);
  await updateSettings({ onboardedAt: null });
}

/** Saved draft (resume where the user left) or a new one prefilled with what is already stored. */
export async function initialDraft(): Promise<OnboardingDraft> {
  const weights = await db.healthMetrics.where('metric').equals('weight_kg').toArray();
  const latest = weights.sort((a, b) => a.date.localeCompare(b.date)).at(-1)?.value ?? null;
  const base = draftFrom(await getSettings(), await getProfile(), latest);
  // merged onto the stored data, so an old/partial draft can never leave fields undefined
  const saved = loadDraft();
  return saved ? { ...base, ...saved } : base;
}
