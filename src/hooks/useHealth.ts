import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/db';
import { DEFAULT_PROFILE } from '@/health/repo';
import { mergeDaily } from '@/health/merge';
import type { HealthMetric, HealthSourceState, Profile } from '@/db/types';
import { addDays, dayKey } from '@/lib/day';

export function useProfile(): Profile {
  const p = useLiveQuery(() => db.profile.get('profile'), []);
  return useMemo(() => ({ ...DEFAULT_PROFILE, ...(p ?? {}) }), [p]);
}

export function useSources(): HealthSourceState[] | undefined {
  return useLiveQuery(() => db.healthSources.toArray(), []);
}

export interface HealthContext {
  merged: Map<string, HealthMetric>;
  stepGoal: number;
}

/** Daily health metrics of the last `days` days, merged across sources by the user's priority order. */
export function useHealthContext(days = 120): (HealthContext & { loaded: true }) | { loaded: false } {
  const profile = useProfile();
  const from = addDays(dayKey(), -days);
  const metrics = useLiveQuery(() => db.healthMetrics.where('date').aboveOrEqual(from).toArray(), [from]);
  return useMemo(() => {
    if (!metrics) return { loaded: false } as const;
    return { loaded: true as const, merged: mergeDaily(metrics, profile.sourcePriority), stepGoal: profile.stepGoal };
  }, [metrics, profile.sourcePriority, profile.stepGoal]);
}
