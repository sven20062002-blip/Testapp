import { describe, expect, it } from 'vitest';
import { createBridge, MAP, type HealthPluginLike } from '@/health/capacitorBridge';

/** fake plugin: aggregated daily buckets in local time + point samples */
function fake(opts: { granted?: string[]; fail?: string[] } = {}): HealthPluginLike & { requested: string[][] } {
  const requested: string[][] = [];
  const day = (d: string, h = 0) => new Date(`${d}T${String(h).padStart(2, '0')}:00:00`).toISOString();
  return {
    requested,
    async isAvailable() {
      return { available: true };
    },
    async requestAuthorization(o) {
      requested.push(o.read ?? []);
      const ok = opts.granted ?? o.read ?? [];
      return { readAuthorized: ok, readDenied: (o.read ?? []).filter((t) => !ok.includes(t)) };
    },
    async queryAggregated(o) {
      if (opts.fail?.includes(o.dataType)) throw new Error('not supported');
      const v: Record<string, number> = { steps: 8432, distance: 6120.44, calories: 412.37, basalCalories: 1690, totalCalories: 2102.4, flightsClimbed: 7 };
      return {
        samples: [
          { startDate: day('2026-11-25'), endDate: day('2026-11-26'), value: v[o.dataType], unit: 'x' },
          { startDate: day('2026-11-26'), endDate: day('2026-11-27'), value: 0, unit: 'x' }, // empty day → skipped
        ],
      };
    },
    async readSamples(o) {
      if (o.dataType === 'weight')
        return {
          samples: [
            { startDate: day('2026-11-25', 7), endDate: day('2026-11-25', 7), value: 81.2, unit: 'kilogram', sourceName: 'Waage' },
            { startDate: day('2026-11-25', 21), endDate: day('2026-11-25', 21), value: 81.9, unit: 'kilogram', sourceName: 'Waage' },
          ],
        };
      if (o.dataType === 'bodyFat') return { samples: [{ startDate: day('2026-11-25', 7), endDate: day('2026-11-25', 7), value: 0.184, unit: 'percent' }] };
      return { samples: [] };
    },
  };
}

describe('native health bridge (Apple Health / Health Connect)', () => {
  it('requests only the read types of the chosen categories', async () => {
    const f = fake();
    const b = createBridge(f, 'healthconnect');
    expect(await b.requestPermissions(['activity'])).toEqual(['activity']);
    expect(f.requested[0].sort()).toEqual(['basalCalories', 'calories', 'distance', 'flightsClimbed', 'steps', 'totalCalories']);
  });

  it('Android reports denied categories; iOS cannot know and keeps them', async () => {
    const denied = fake({ granted: ['steps'] });
    expect(await createBridge(denied, 'healthconnect').requestPermissions(['activity', 'body'])).toEqual(['activity']);
    expect(await createBridge(fake({ granted: [] }), 'healthkit').requestPermissions(['activity', 'body'])).toEqual(['activity', 'body']);
  });

  it('maps daily totals and last weighing per day, normalises units', async () => {
    const r = await createBridge(fake(), 'healthkit').read({ from: '2026-11-25', to: '2026-11-26', categories: ['activity', 'body'] });
    const get = (m: string) => r.metrics.filter((x) => x.metric === m);
    expect(get('steps')).toEqual([expect.objectContaining({ date: '2026-11-25', value: 8432 })]); // 0 on 26th skipped
    expect(get('distance_m')[0].value).toBe(6120.4);
    expect(get('active_kcal')[0].value).toBe(412.4);
    expect(get('weight_kg')).toEqual([expect.objectContaining({ date: '2026-11-25', value: 81.9, origin: 'Waage' })]); // last of the day
    expect(get('body_fat_pct')[0].value).toBe(18.4); // HealthKit fraction → percent
  });

  it('only reads granted categories; an unsupported type does not break the others', async () => {
    const r = await createBridge(fake({ fail: ['flightsClimbed'] }), 'healthconnect').read({ from: '2026-11-25', to: '2026-11-25', categories: ['activity'] });
    expect(r.metrics.some((m) => m.metric === 'weight_kg')).toBe(false);
    expect(r.metrics.some((m) => m.metric === 'floors')).toBe(false);
    expect(r.metrics.some((m) => m.metric === 'steps')).toBe(true);
  });

  it('covers every activity/body metric of the app', () => {
    expect(MAP.map((m) => m.metric).sort()).toEqual(['active_kcal', 'basal_kcal', 'body_fat_pct', 'distance_m', 'floors', 'steps', 'total_kcal', 'weight_kg']);
  });
});
