import type { HealthCategory, HealthSourceId, MetricKey } from '@/db/types';
import { fmtNumber } from '@/lib/units';

export interface MetricMeta {
  label: string;
  unit: string;
  category: HealthCategory;
  /** how several values of one source on the same day combine (for imports) */
  agg: 'sum' | 'avg' | 'max' | 'last';
  digits: number;
}

export const METRIC_META: Record<MetricKey, MetricMeta> = {
  steps: { label: 'Schritte', unit: '', category: 'activity', agg: 'sum', digits: 0 },
  distance_m: { label: 'Distanz', unit: 'km', category: 'activity', agg: 'sum', digits: 2 },
  floors: { label: 'Etagen', unit: '', category: 'activity', agg: 'sum', digits: 0 },
  active_min: { label: 'Aktive Minuten', unit: 'min', category: 'activity', agg: 'sum', digits: 0 },
  active_kcal: { label: 'Aktivitätskalorien', unit: 'kcal', category: 'activity', agg: 'sum', digits: 0 },
  basal_kcal: { label: 'Ruheenergie', unit: 'kcal', category: 'activity', agg: 'sum', digits: 0 },
  total_kcal: { label: 'Gesamtverbrauch', unit: 'kcal', category: 'activity', agg: 'sum', digits: 0 },
  weight_kg: { label: 'Gewicht', unit: 'kg', category: 'body', agg: 'last', digits: 1 },
  body_fat_pct: { label: 'Körperfett', unit: '%', category: 'body', agg: 'last', digits: 1 },
};

export const SOURCE_META: Record<HealthSourceId, { label: string; short: string }> = {
  google: { label: 'Google Health (Fitbit)', short: 'Google Health' },
  apple: { label: 'Apple Health (Export-Import)', short: 'Apple Health' },
  bridge: { label: 'Native App-Brücke (Health Connect / HealthKit)', short: 'Native Brücke' },
  manual: { label: 'Manuelle Eingabe', short: 'Manuell' },
};

export const CATEGORY_META: Record<HealthCategory, { label: string; hint: string }> = {
  activity: { label: 'Aktivität', hint: 'Schritte, Distanz, Etagen, aktive Minuten, Energie' },
  body: { label: 'Körper', hint: 'Gewicht und Körperfett' },
};

export function fmtMetric(metric: MetricKey, v: number | null | undefined, withUnit = true): string {
  if (v == null || !Number.isFinite(v)) return '–';
  const m = METRIC_META[metric];
  const val = metric === 'distance_m' ? v / 1000 : v;
  const s = fmtNumber(val, m.digits);
  return withUnit && m.unit ? `${s} ${m.unit}` : s;
}
