import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db/db';
import { initDatabase } from '@/db/init';
import { getSettings } from '@/db/repo/settings';
import { getProfile } from '@/health/repo';
import { DRAFT_KEY, applyDraft, draftFrom, firstIncompleteStep, initialDraft, loadDraft, parsed, restartOnboarding, saveDraft, skipOnboarding, stepErrors, type OnboardingDraft } from '@/onboarding/model';

// node has no localStorage → minimal in-memory implementation
const mem = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: (i: number) => [...mem.keys()][i] ?? null,
  get length() {
    return mem.size;
  },
});

beforeEach(async () => {
  mem.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-03-10T12:00:00'));
  await db.delete();
  await db.open();
  await initDatabase();
});

const fresh = async () => initialDraft();
const filled = async (patch: Partial<OnboardingDraft> = {}): Promise<OnboardingDraft> => ({
  ...(await fresh()),
  name: 'Sven',
  sex: 'male',
  age: '24',
  heightCm: '182',
  weight: '80,5',
  goalWeight: '78',
  goal: 'muscle',
  trainingDays: 4,
  activityLevel: 1.55,
  restSec: 120,
  stepGoal: 8000,
  ...patch,
});

describe('onboarding', () => {
  it('new install: not onboarded, draft prefilled with defaults', async () => {
    expect((await getSettings()).onboardedAt).toBeNull();
    const d = await fresh();
    expect(d).toMatchObject({ step: 0, unit: 'kg', sex: null, age: '', weight: '', trainingDays: 3, restSec: 90, stepGoal: 10000 });
  });

  it('body step requires sex, age, height and weight within plausible ranges', async () => {
    const d = await fresh();
    expect(Object.keys(stepErrors('body', d)).sort()).toEqual(['age', 'heightCm', 'sex', 'weight']);
    const bad = { ...d, sex: 'male' as const, age: '9', heightCm: '300', weight: '12' };
    expect(stepErrors('body', bad)).toMatchObject({ age: '14–100 Jahre', heightCm: '120–230 cm', weight: '30–300 kg' });
    expect(stepErrors('body', await filled())).toEqual({});
    expect(firstIncompleteStep(d)).toBe(1);
    expect(firstIncompleteStep(await filled())).toBe(-1);
  });

  it('parses German decimals and converts lb to kg', async () => {
    expect(parsed(await filled()).weightKg).toBe(80.5);
    const lb = await filled({ unit: 'lb', weight: '176,4', goalWeight: '' });
    expect(parsed(lb).weightKg).toBeCloseTo(80, 0);
    expect(parsed(lb).goalWeightKg).toBeNull();
    expect(stepErrors('body', { ...lb, weight: '50' })).toMatchObject({ weight: expect.stringContaining('lb') });
  });

  it('finish writes settings, profile and the first weight entry, then clears the draft', async () => {
    const d = await filled();
    saveDraft(d);
    await applyDraft(d, true);
    const s = await getSettings();
    const p = await getProfile();
    expect(s).toMatchObject({ userName: 'Sven', unit: 'kg', weeklyGoal: 4, defaultRestSec: 120 });
    expect(s.onboardedAt).toBe(Date.now());
    expect(p).toMatchObject({ sex: 'male', age: 24, heightCm: 182, weightKg: 80.5, goalWeightKg: 78, goal: 'muscle', trainingDaysPerWeek: 4, stepGoal: 8000 });
    const w = await db.healthMetrics.where('metric').equals('weight_kg').toArray();
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ value: 80.5, source: 'manual', date: '2026-03-10' });
    expect(mem.has(DRAFT_KEY)).toBe(false);
  });

  it('leaving the app mid-way: valid answers are stored, invalid ones are left untouched, draft resumes at the same step', async () => {
    const d = { ...(await filled({ heightCm: '18' })), step: 1 };
    saveDraft(d); // what happens on every change / on leave
    await applyDraft(d); // what happens on leave
    const p = await getProfile();
    expect(p.age).toBe(24);
    expect(p.heightCm).toBeNull(); // "18" is half-typed → not saved
    expect((await getSettings()).onboardedAt).toBeNull();
    expect(await db.healthMetrics.count()).toBe(0); // weight entry only on finish
    const resumed = await initialDraft();
    expect(resumed).toMatchObject({ step: 1, heightCm: '18', name: 'Sven' });
  });

  it('existing users get the onboarding prefilled with their stored data', async () => {
    await applyDraft(await filled(), true);
    await restartOnboarding();
    expect((await getSettings()).onboardedAt).toBeNull();
    const d = await initialDraft();
    expect(d).toMatchObject({ step: 0, name: 'Sven', sex: 'male', age: '24', heightCm: '182', weight: '80,5', goalWeight: '78', trainingDays: 4 });
  });

  it('skip keeps defaults and never shows the onboarding again', async () => {
    await skipOnboarding(await fresh());
    expect((await getSettings()).onboardedAt).not.toBeNull();
    expect((await getProfile()).age).toBeNull();
    expect(loadDraft()).toBeNull();
  });

  it('draftFrom uses the latest tracked weight over the profile value', async () => {
    const d = draftFrom(await getSettings(), { ...(await getProfile()), weightKg: 90 }, 85.25);
    expect(d.weight).toBe('85,25');
  });

  it('a corrupt draft is ignored', async () => {
    mem.set(DRAFT_KEY, '{broken');
    expect(loadDraft()).toBeNull();
    mem.set(DRAFT_KEY, JSON.stringify({ step: 99 }));
    expect(loadDraft()?.step).toBe(5);
    expect(await initialDraft()).toMatchObject({ step: 5, unit: 'kg', name: '', restSec: 90 });
  });
});
