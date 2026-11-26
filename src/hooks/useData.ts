import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { db } from '@/db/db';
import { DEFAULT_SETTINGS } from '@/db/repo/settings';
import { IDLE_REST } from '@/db/repo/timers';
import { exerciseName } from '@/db/repo/exercises';
import type { Exercise, Settings } from '@/db/types';

export function useSettings(): Settings {
  const s = useLiveQuery(() => db.settings.get('settings'), []);
  return useMemo(() => ({ ...DEFAULT_SETTINGS, ...(s ?? {}) }), [s]);
}

export function useActiveWorkout() {
  return useLiveQuery(() => db.workouts.where('status').equals('active').first(), []);
}

export function useRest() {
  return useLiveQuery(() => db.timers.get('rest'), []) ?? IDLE_REST;
}

/** All exercises including deleted (needed for lookups); filter `deletedAt` for the library */
export function useExercises(): Exercise[] | undefined {
  return useLiveQuery(() => db.exercises.toArray(), []);
}

export function useExerciseMap(): Map<string, Exercise> {
  const list = useExercises();
  return useMemo(() => new Map((list ?? []).map((e) => [e.id, e])), [list]);
}

export function useExerciseName() {
  const { exerciseLang } = useSettings();
  return (e: { nameDe: string; nameEn: string } | undefined) => (e ? exerciseName(e, exerciseLang) : 'Unbekannte Übung');
}

/** Re-renders every `ms` while enabled. Values are always derived from Date.now(). */
export function useNow(enabled = true, ms = 250): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), ms);
    const onVis = () => setNow(Date.now());
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [enabled, ms]);
  return now;
}

export function useOnline(): boolean {
  const [on, setOn] = useState(() => navigator.onLine);
  useEffect(() => {
    const a = () => setOn(true);
    const b = () => setOn(false);
    window.addEventListener('online', a);
    window.addEventListener('offline', b);
    return () => {
      window.removeEventListener('online', a);
      window.removeEventListener('offline', b);
    };
  }, []);
  return on;
}
