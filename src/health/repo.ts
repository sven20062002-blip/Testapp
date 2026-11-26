import { db } from '@/db/db';
import type {
  HealthCategory,
  HealthMetric,
  HealthSourceId,
  HealthSourceState,
  MetricKey,
  Profile,
  ValueKind,
} from '@/db/types';
import { DEFAULT_PRIORITY } from './merge';
import { METRIC_META } from './meta';

export const ALL_CATEGORIES: HealthCategory[] = ['activity', 'body'];

export function defaultSourceState(id: HealthSourceId): HealthSourceState {
  return {
    id,
    connected: id === 'manual',
    categories: { activity: id === 'manual', body: id === 'manual' },
    lastSyncAt: null,
    lastStatus: 'idle',
    lastError: null,
    lastSummary: null,
    diagnostics: {},
    consentAt: null,
  };
}

export async function getSource(id: HealthSourceId): Promise<HealthSourceState> {
  return { ...defaultSourceState(id), ...((await db.healthSources.get(id)) ?? {}) };
}

/** Atomic read-modify-write (concurrent updates must not overwrite each other). */
export async function updateSource(id: HealthSourceId, patch: Partial<HealthSourceState>): Promise<HealthSourceState> {
  return db.transaction('rw', db.healthSources, async () => {
    const cur = await getSource(id);
    const next = { ...cur, ...patch, id };
    await db.healthSources.put(next);
    return next;
  });
}

export const metricId = (source: HealthSourceId, metric: MetricKey, date: string) => `${source}:${metric}:${date}`;

export function validateMetric(metric: MetricKey, value: number): string | null {
  if (!Number.isFinite(value)) return 'Ungültiger Wert';
  const ranges: Partial<Record<MetricKey, [number, number]>> = {
    steps: [0, 200000],
    active_min: [0, 1440],
    weight_kg: [20, 400],
    body_fat_pct: [2, 75],
  };
  const r = ranges[metric];
  if (r && (value < r[0] || value > r[1])) return `${METRIC_META[metric].label} außerhalb des plausiblen Bereichs (${r[0]}–${r[1]})`;
  if (value < 0) return 'Wert darf nicht negativ sein';
  return null;
}

/** Upsert imported daily metrics (deterministic ids → no duplicates on re-sync). Invalid values are skipped. */
export async function upsertMetrics(
  source: HealthSourceId,
  rows: { metric: MetricKey; date: string; value: number; kind?: ValueKind; origin?: string }[],
): Promise<number> {
  const now = Date.now();
  const valid: HealthMetric[] = [];
  for (const r of rows) {
    if (validateMetric(r.metric, r.value)) continue;
    valid.push({ id: metricId(source, r.metric, r.date), source, metric: r.metric, date: r.date, value: r.value, kind: r.kind ?? 'measured', origin: r.origin, importedAt: now });
  }
  await db.healthMetrics.bulkPut(valid);
  return valid.length;
}

export async function upsertHourly(source: HealthSourceId, days: { date: string; steps: number[] }[]): Promise<void> {
  const now = Date.now();
  await db.healthHourly.bulkPut(
    days.filter((d) => d.steps.length === 24 && d.steps.every((x) => Number.isFinite(x) && x >= 0)).map((d) => ({ id: `${source}:${d.date}`, source, date: d.date, steps: d.steps, importedAt: now })),
  );
}

/** Delete everything imported from one source (privacy: "importierte Daten löschen"). */
export async function deleteSourceData(source: HealthSourceId, categories?: HealthCategory[]): Promise<number> {
  let n = 0;
  await db.transaction('rw', db.healthMetrics, db.healthHourly, async () => {
    const cats = categories ?? ALL_CATEGORIES;
    if (cats.includes('activity')) n += await db.healthHourly.where('source').equals(source).delete();
    const metrics = await db.healthMetrics.where('source').equals(source).toArray();
    const del = metrics.filter((m) => cats.includes(METRIC_META[m.metric].category)).map((m) => m.id);
    await db.healthMetrics.bulkDelete(del);
    n += del.length;
  });
  return n;
}

/** Disconnect: remove tokens, keep or delete data as requested */
export async function disconnectSource(source: HealthSourceId, deleteData: boolean): Promise<void> {
  await updateSource(source, {
    connected: false,
    accessToken: null,
    tokenExpiresAt: null,
    grantedScopes: [],
    lastStatus: 'idle',
    lastError: null,
    consentAt: null,
    categories: { activity: false, body: false },
  });
  if (deleteData) await deleteSourceData(source);
}

/* ---------------- manual entries ---------------- */

export async function saveManualMetric(metric: MetricKey, date: string, value: number): Promise<void> {
  const err = validateMetric(metric, value);
  if (err) throw new Error(err);
  await db.healthMetrics.put({ id: metricId('manual', metric, date), source: 'manual', metric, date, value, kind: 'manual', importedAt: Date.now() });
}

export async function deleteMetric(id: string): Promise<void> {
  await db.healthMetrics.delete(id);
}

/* ---------------- profile ---------------- */

export const DEFAULT_PROFILE: Profile = {
  id: 'profile',
  age: null,
  sex: null,
  heightCm: null,
  weightKg: null,
  goalWeightKg: null,
  activityLevel: 1.55,
  trainingDaysPerWeek: 3,
  goal: 'maintain',
  kcalTarget: null,
  proteinTarget: null,
  carbsTarget: null,
  fatTarget: null,
  fiberTarget: null,
  budgetMode: 'static',
  stepGoal: 10000,
  sourcePriority: DEFAULT_PRIORITY,
  updatedAt: 0,
};

export async function getProfile(): Promise<Profile> {
  return { ...DEFAULT_PROFILE, ...((await db.profile.get('profile')) ?? {}) };
}

export async function updateProfile(patch: Partial<Omit<Profile, 'id'>>): Promise<void> {
  await db.transaction('rw', db.profile, async () => {
    const cur = await getProfile();
    await db.profile.put({ ...cur, ...patch, id: 'profile', updatedAt: Date.now() });
  });
}
