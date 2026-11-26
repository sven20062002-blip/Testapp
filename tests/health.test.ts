import { beforeEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { AppleHealthParser, parseAppleDate } from '@/health/apple';
import { mergeDaily } from '@/health/merge';
import type { HealthMetric } from '@/db/types';
import { ForgeDB, db } from '@/db/db';
import { deleteSourceData, getProfile, saveManualMetric, updateProfile, upsertHourly, upsertMetrics, validateMetric } from '@/health/repo';

const rec = (type: string, value: string | number, start: string, src = 'iPhone', unit = 'count') =>
  `<Record type="${type}" sourceName="${src}" unit="${unit}" startDate="${start}" endDate="${start}" value="${value}"/>\n`;

describe('Apple Health export parser', () => {
  it('parses dates with offsets', () => {
    expect(parseAppleDate('2026-03-01 07:00:00 +0100')).toBe(Date.UTC(2026, 2, 1, 6, 0, 0));
  });

  it('streams chunks, de-duplicates iPhone + Watch steps, respects categories, ignores sleep & vitals', () => {
    const xml =
      '<?xml version="1.0"?><HealthData>' +
      rec('HKQuantityTypeIdentifierStepCount', 3000, '2026-03-01 09:00:00 +0100', 'iPhone') +
      rec('HKQuantityTypeIdentifierStepCount', 2000, '2026-03-01 12:00:00 +0100', 'iPhone') +
      rec('HKQuantityTypeIdentifierStepCount', 4500, '2026-03-01 12:00:00 +0100', 'Apple Watch') +
      rec('HKQuantityTypeIdentifierRestingHeartRate', 58, '2026-03-01 08:00:00 +0100', 'iPhone', 'count/min') +
      rec('HKQuantityTypeIdentifierHeartRate', 120, '2026-03-01 08:00:00 +0100', 'iPhone', 'count/min') +
      '<Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Watch" startDate="2026-03-01 00:00:00 +0100" endDate="2026-03-01 07:00:00 +0100" value="HKCategoryValueSleepAnalysisAsleepDeep"/>' +
      '<Record type="HKQuantityTypeIdentifierBodyMass" sourceName="Waage" unit="kg" startDate="2026-03-01 07:00:00 +0100" endDate="2026-03-01 07:00:00 +0100" value="81.4"><MetadataEntry key="x" value="y"/></Record>' +
      '</HealthData>';
    const p = new AppleHealthParser(['activity', 'body']);
    for (let i = 0; i < xml.length; i += 37) p.push(xml.slice(i, i + 37)); // awkward chunk sizes
    const r = p.finish();
    expect(r.metrics.find((m) => m.metric === 'steps')!.value).toBe(5000); // never 9500
    expect(r.metrics.find((m) => m.metric === 'weight_kg')!.value).toBe(81.4);
    expect(new Set(r.metrics.map((m) => m.metric))).toEqual(new Set(['steps', 'weight_kg']));
    expect(r.hourly[0].steps.reduce((a, b) => a + b, 0)).toBe(5000); // hourly from the winning source only

    const onlyBody = new AppleHealthParser(['body']);
    onlyBody.push(xml);
    expect(onlyBody.finish().metrics.map((m) => m.metric)).toEqual(['weight_kg']);
  });
});

const M = (source: HealthMetric['source'], metric: HealthMetric['metric'], date: string, value: number): HealthMetric => ({
  id: `${source}:${metric}:${date}`,
  source,
  metric,
  date,
  value,
  kind: 'measured',
  importedAt: 0,
});
describe('merge', () => {
  it('one source wins per day – no double counting', () => {
    const m = mergeDaily([M('apple', 'steps', '2026-11-20', 9000), M('google', 'steps', '2026-11-20', 8400), M('manual', 'steps', '2026-11-21', 100)]);
    expect(m.get('steps:2026-11-20')!.value).toBe(8400);
    const m2 = mergeDaily([M('apple', 'steps', '2026-11-20', 9000), M('google', 'steps', '2026-11-20', 8400)], ['apple', 'google', 'bridge', 'manual']);
    expect(m2.get('steps:2026-11-20')!.value).toBe(9000);
  });
});

describe('health repo', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });
  it('re-import overwrites instead of duplicating; delete per source and category', async () => {
    await upsertMetrics('google', [{ metric: 'steps', date: '2026-11-20', value: 100 }]);
    await upsertMetrics('google', [{ metric: 'steps', date: '2026-11-20', value: 200 }, { metric: 'weight_kg', date: '2026-11-20', value: 999 }]);
    expect(await db.healthMetrics.count()).toBe(1); // 999 kg rejected as implausible
    expect((await db.healthMetrics.toArray())[0].value).toBe(200);
    await upsertMetrics('google', [{ metric: 'weight_kg', date: '2026-11-20', value: 80 }]);
    await upsertHourly('google', [{ date: '2026-11-20', steps: new Array(24).fill(10) }]);
    await saveManualMetric('weight_kg', '2026-11-20', 80);
    expect(await deleteSourceData('google', ['activity'])).toBe(2); // steps + hourly
    expect(await deleteSourceData('google')).toBe(1); // weight
    expect(await db.healthMetrics.count()).toBe(1); // manual weight untouched
  });
  it('validates plausible ranges', () => {
    expect(validateMetric('weight_kg', 10)).toMatch(/plausiblen/);
    expect(validateMetric('weight_kg', 80)).toBeNull();
    expect(validateMetric('steps', -1)).not.toBeNull();
  });
  it('concurrent profile updates do not overwrite each other', async () => {
    await Promise.all([updateProfile({ age: 30 }), updateProfile({ heightCm: 180 }), updateProfile({ sex: 'male' })]);
    const p = await getProfile();
    expect([p.age, p.heightCm, p.sex]).toEqual([30, 180, 'male']);
  });
});

describe('migration v2 → v3', () => {
  it('drops sleep sessions and vital values, keeps activity/body data', async () => {
    const name = 'forge-migration-test';
    await Dexie.delete(name);
    const old = new Dexie(name);
    old.version(2).stores({
      healthMetrics: 'id, source, metric, date, [metric+date]',
      healthHourly: 'id, source, date',
      sleepSessions: 'id, source, date, start',
      healthSources: 'id',
      profile: 'id',
    });
    await old.open();
    await old.table('healthMetrics').bulkAdd([M('google', 'steps', '2026-11-20', 8000), { ...M('google', 'steps', '2026-11-20', 58), id: 'google:rhr:2026-11-20', metric: 'rhr' as never }]);
    await old.table('sleepSessions').add({ id: 'x', source: 'google', date: '2026-11-20', start: 1 });
    await old.table('healthSources').add({ id: 'google', categories: { sleep: true, activity: true, heart: true, body: false } });
    await old.table('profile').add({ id: 'profile', sleepGoalMin: 480, stepGoal: 9000 });
    old.close();

    const fresh = new ForgeDB(name);
    await fresh.open();
    expect((await fresh.healthMetrics.toArray()).map((m) => m.metric)).toEqual(['steps']);
    expect(fresh.tables.map((t) => t.name)).not.toContain('sleepSessions');
    expect((await fresh.healthSources.get('google'))!.categories).toEqual({ activity: true, body: false });
    const prof = (await fresh.profile.get('profile')) as unknown as Record<string, unknown>;
    expect(prof.sleepGoalMin).toBeUndefined();
    expect(prof.stepGoal).toBe(9000);
    fresh.close();
  });
});
