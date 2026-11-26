/**
 * Native health bridge for the iOS/Android app (Capacitor).
 * Maps Apple HealthKit / Android Health Connect (via @capgo/capacitor-health) onto the
 * ForgeHealthBridge contract the web app already uses (src/health/bridge.ts).
 *
 * Daily totals come from the OS aggregation (HKStatisticsCollectionQuery / Health Connect aggregate),
 * which already removes double counting between phone and watch.
 */
import type { HealthCategory, MetricKey } from '@/db/types';
import { addDays, dayKey, parseDay } from '@/lib/day';
import type { ForgeHealthBridge } from './bridge';

/** Minimal surface of the plugin we use – lets tests inject a fake. */
export interface HealthPluginLike {
  isAvailable(): Promise<{ available: boolean; platform?: string; reason?: string }>;
  requestAuthorization(o: { read?: string[]; write?: string[]; requestHistoryAccess?: boolean }): Promise<{ readAuthorized: string[]; readDenied: string[] }>;
  queryAggregated(o: { dataType: string; startDate?: string; endDate?: string; bucket?: string; aggregation?: string }): Promise<{
    samples: { startDate: string; endDate: string; value: number; unit: string }[];
  }>;
  readSamples(o: { dataType: string; startDate?: string; endDate?: string; limit?: number; ascending?: boolean }): Promise<{
    samples: { startDate: string; endDate: string; value: number; unit: string; sourceName?: string }[];
  }>;
}

type Kind = 'sum' | 'last';
/** our metric ← native data type; daily sums are aggregated by the OS, point values use the last reading of the day */
export const MAP: { metric: MetricKey; type: string; category: HealthCategory; kind: Kind }[] = [
  { metric: 'steps', type: 'steps', category: 'activity', kind: 'sum' },
  { metric: 'distance_m', type: 'distance', category: 'activity', kind: 'sum' },
  { metric: 'active_kcal', type: 'calories', category: 'activity', kind: 'sum' },
  { metric: 'basal_kcal', type: 'basalCalories', category: 'activity', kind: 'sum' },
  { metric: 'total_kcal', type: 'totalCalories', category: 'activity', kind: 'sum' },
  { metric: 'floors', type: 'flightsClimbed', category: 'activity', kind: 'sum' },
  { metric: 'weight_kg', type: 'weight', category: 'body', kind: 'last' },
  { metric: 'body_fat_pct', type: 'bodyFat', category: 'body', kind: 'last' },
];

const typesFor = (cats: HealthCategory[]) => MAP.filter((m) => cats.includes(m.category)).map((m) => m.type);

/** local calendar day of a bucket – the middle of the bucket is safe against time-zone edges */
const bucketDay = (start: string, end: string) => dayKey(new Date((Date.parse(start) + Date.parse(end)) / 2));

export function createBridge(Health: HealthPluginLike, platform: 'healthkit' | 'healthconnect'): ForgeHealthBridge {
  return {
    platform,
    version: platform === 'healthkit' ? 'Apple Health' : 'Health Connect',
    async isAvailable() {
      try {
        return (await Health.isAvailable()).available;
      } catch {
        return false;
      }
    },
    async requestPermissions(categories) {
      const read = typesFor(categories);
      const res = await Health.requestAuthorization({ read, requestHistoryAccess: true });
      // iOS never reveals whether *read* access was granted (privacy) – a denied type simply returns no data.
      if (platform === 'healthkit') return categories;
      const ok = new Set(res.readAuthorized);
      return categories.filter((c) => MAP.some((m) => m.category === c && ok.has(m.type)));
    },
    async read({ from, to, categories }) {
      const startDate = parseDay(from).toISOString();
      const endDate = parseDay(addDays(to, 1)).toISOString();
      const metrics: { metric: MetricKey; date: string; value: number; origin?: string }[] = [];
      for (const m of MAP.filter((x) => categories.includes(x.category))) {
        try {
          if (m.kind === 'sum') {
            const { samples } = await Health.queryAggregated({ dataType: m.type, startDate, endDate, bucket: 'day', aggregation: 'sum' });
            for (const s of samples) {
              if (!Number.isFinite(s.value) || s.value <= 0) continue;
              metrics.push({ metric: m.metric, date: bucketDay(s.startDate, s.endDate), value: Math.round(s.value * 10) / 10, origin: platform === 'healthkit' ? 'Apple Health' : 'Health Connect' });
            }
          } else {
            const { samples } = await Health.readSamples({ dataType: m.type, startDate, endDate, limit: 1000, ascending: true });
            const lastPerDay = new Map<string, { value: number; origin?: string }>();
            for (const s of samples) if (Number.isFinite(s.value)) lastPerDay.set(dayKey(new Date(s.startDate)), { value: s.value, origin: s.sourceName });
            for (const [date, v] of lastPerDay) {
              // HealthKit reports body fat as a fraction (0.2), Health Connect as percent (20)
              const value = m.metric === 'body_fat_pct' && v.value <= 1 ? v.value * 100 : v.value;
              metrics.push({ metric: m.metric, date, value: Math.round(value * 10) / 10, origin: v.origin });
            }
          }
        } catch {
          /* type not supported on this device / not permitted – other metrics still sync */
        }
      }
      return { metrics };
    },
  };
}

/** Called once at app start inside the native app: exposes the bridge to the web code. */
export async function installNativeHealthBridge(): Promise<void> {
  const { Capacitor } = await import('@capacitor/core');
  if (!Capacitor.isNativePlatform()) return;
  const { Health } = await import('@capgo/capacitor-health');
  window.ForgeHealthBridge = createBridge(Health as unknown as HealthPluginLike, Capacitor.getPlatform() === 'ios' ? 'healthkit' : 'healthconnect');
}
