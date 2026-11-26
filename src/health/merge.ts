import type { HealthMetric, HealthSourceId, MetricKey } from '@/db/types';

export const DEFAULT_PRIORITY: HealthSourceId[] = ['google', 'bridge', 'apple', 'manual'];

/**
 * Several sources may report the same metric for the same day (e.g. the native bridge and an Apple Health
 * export). We never add them – one source wins per metric and day,
 * chosen by the user's priority order. This prevents double counting of steps/calories.
 */
export function mergeDaily(rows: HealthMetric[], priority: HealthSourceId[] = DEFAULT_PRIORITY): Map<string, HealthMetric> {
  const rank = (s: HealthSourceId) => {
    const i = priority.indexOf(s);
    return i < 0 ? 99 : i;
  };
  const out = new Map<string, HealthMetric>();
  for (const r of rows) {
    const key = `${r.metric}:${r.date}`;
    const cur = out.get(key);
    if (!cur || rank(r.source) < rank(cur.source)) out.set(key, r);
  }
  return out;
}

/** Convenience: series of one metric over given days (null where missing). */
export function series(merged: Map<string, HealthMetric>, metric: MetricKey, days: string[]): (number | null)[] {
  return days.map((d) => merged.get(`${metric}:${d}`)?.value ?? null);
}

export function valueOn(merged: Map<string, HealthMetric>, metric: MetricKey, day: string): HealthMetric | undefined {
  return merged.get(`${metric}:${day}`);
}
