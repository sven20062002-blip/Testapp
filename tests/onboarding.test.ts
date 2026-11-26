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

describe('app tour & defaults', () => {
  it('new installs start in light mode', async () => {
    expect((await getSettings()).theme).toBe('light');
    expect((await initialDraft()).theme).toBe('light');
  });

  it('tour: resume station, finish, restart, return to the page it started on', async () => {
    const { loadTourStep, saveTourStep, finishTour, restartTour, rememberTourOrigin, tourOrigin } = await import('@/tour/state');
    const { TOUR } = await import('@/tour/steps');
    expect((await getSettings()).tourSeenAt).toBeNull();
    expect(loadTourStep()).toBe(0);
    saveTourStep(3);
    expect(loadTourStep()).toBe(3);
    saveTourStep(99);
    expect(loadTourStep()).toBe(TOUR.length - 1);
    // origin is remembered once (an invite link survives navigating through the tour)
    expect(rememberTourOrigin('/social?sb=x&from=anna')).toBe('/social?sb=x&from=anna');
    expect(rememberTourOrigin('/plans')).toBe('/social?sb=x&from=anna');
    expect(tourOrigin()).toBe('/social?sb=x&from=anna');
    await finishTour();
    expect((await getSettings()).tourSeenAt).toBe(Date.now());
    expect(loadTourStep()).toBe(0);
    expect(tourOrigin()).toBe('/');
    await restartTour();
    expect((await getSettings()).tourSeenAt).toBeNull();
  });

  it('every tour station has a route and text', async () => {
    const { TOUR } = await import('@/tour/steps');
    for (const s of TOUR) {
      expect(s.route.startsWith('/')).toBe(true);
      expect(s.title.length).toBeGreaterThan(2);
    }
    expect(new Set(TOUR.map((s) => s.id)).size).toBe(TOUR.length);
  });
});

describe('migration v5', () => {
  it('installs still on the old dark default switch to light once, other choices stay', async () => {
    const { ForgeDB } = await import('@/db/db');
    for (const [before, after] of [['dark', 'light'], ['system', 'system'], ['light', 'light']]) {
      const name = `forge-mig-${before}`;
      // an old database (Dexie version 4 → IndexedDB version 40) with only the settings store
      await new Promise<void>((res, rej) => {
        const r = indexedDB.open(name, 40);
        r.onupgradeneeded = () => r.result.createObjectStore('settings', { keyPath: 'id' }).put({ id: 'settings', theme: before });
        r.onsuccess = () => (r.result.close(), res());
        r.onerror = () => rej(r.error);
      });
      const d = new ForgeDB(name);
      await d.open();
      expect((await d.settings.get('settings'))?.theme).toBe(after);
      d.close();
    }
  });
});

describe('migration v6', () => {
  it('disconnects a former Google Health connection and forgets the login, imported values stay', async () => {
    const { ForgeDB } = await import('@/db/db');
    const name = 'forge-mig-google';
    await new Promise<void>((res, rej) => {
      const r = indexedDB.open(name, 50);
      r.onupgradeneeded = () => {
        r.result.createObjectStore('healthSources', { keyPath: 'id' }).put({ id: 'google', connected: true, accessToken: 'tok', clientId: 'x.apps.googleusercontent.com', categories: { activity: true, body: true } });
        r.result.createObjectStore('healthMetrics', { keyPath: 'id' }).put({ id: 'google:steps:2026-11-20', source: 'google', metric: 'steps', date: '2026-11-20', value: 8000 });
      };
      r.onsuccess = () => (r.result.close(), res());
      r.onerror = () => rej(r.error);
    });
    const d = new ForgeDB(name);
    await d.open();
    const s = await d.healthSources.get('google');
    expect(s).toMatchObject({ connected: false, accessToken: null });
    expect(s?.clientId).toBeUndefined();
    expect(await d.healthMetrics.count()).toBe(1);
    d.close();
  });
});

describe('home screen layout', () => {
  it('default, move, remove, add, normalize', async () => {
    const L = await import('@/components/dashboard/layout');
    expect(L.normalizeLayout(null)).toEqual(L.DEFAULT_LAYOUT);
    expect(L.DEFAULT_LAYOUT).not.toContain('plans'); // plans live on the training page now
    expect(L.normalizeLayout(['records', 'unknown', 'records', 'start'])).toEqual(['records', 'start']);
    expect(L.normalizeLayout([])).toEqual([]); // an empty home screen is a valid choice
    const l = ['start', 'training', 'nutrition'] as const;
    expect(L.moveWidget([...l], 'nutrition', 0)).toEqual(['nutrition', 'start', 'training']);
    expect(L.moveWidget([...l], 'start', 99)).toEqual(['training', 'nutrition', 'start']);
    expect(L.removeWidget([...l], 'training')).toEqual(['start', 'nutrition']);
    expect(L.addWidget([...l], 'records')).toEqual(['start', 'training', 'nutrition', 'records']);
    expect(L.addWidget([...l], 'start')).toEqual([...l]);
    expect(L.hiddenWidgets(L.DEFAULT_LAYOUT).map((w) => w.id)).toEqual(['lastWorkout']);
  });
});
