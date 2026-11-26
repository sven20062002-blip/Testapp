import { useMemo } from 'react';
import { useExercises, useExerciseName } from '@/hooks/useData';
import { fmtNumber, fmtVolume, fmtWeight } from '@/lib/units';
import type { WeightUnit } from '@/db/types';
import type { ChallengeMetric } from '@/social/types';

/** Only standard exercises share ids across users – custom exercises can't be compared. */
export function useSharedExercises() {
  const all = useExercises();
  const name = useExerciseName();
  return useMemo(
    () =>
      (all ?? [])
        .filter((e) => e.id.startsWith('ex-') && !e.deletedAt && e.trackingType === 'weight_reps')
        .map((e) => ({ key: e.id, name: name(e), nameDe: e.nameDe }))
        .sort((a, b) => a.name.localeCompare(b.name, 'de')),
    [all, name],
  );
}

export function fmtScore(metric: ChallengeMetric | 'reps', v: number | null | undefined, unit: WeightUnit): string {
  if (v == null) return '–';
  if (metric === 'volume') return fmtVolume(v, unit, true);
  if (metric === 'e1rm' || metric === 'max_weight') return fmtWeight(v, unit);
  if (metric === 'workouts') return `${fmtNumber(v)} ${v === 1 ? 'Workout' : 'Workouts'}`;
  if (metric === 'reps') return `${fmtNumber(v)} Wdh`;
  return `${fmtNumber(v)} Sätze`;
}

const rtf = new Intl.RelativeTimeFormat('de', { numeric: 'auto' });
export function ago(iso: string): string {
  const s = (Date.parse(iso) - Date.now()) / 1000;
  const a = Math.abs(s);
  if (a < 60) return 'gerade eben';
  if (a < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (a < 86400) return rtf.format(Math.round(s / 3600), 'hour');
  if (a < 86400 * 7) return rtf.format(Math.round(s / 86400), 'day');
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: 'short' });
}

export function remaining(iso: string, now = Date.now()): string {
  const ms = Math.max(0, Date.parse(iso) - now);
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d} T ${h} h`;
  if (h > 0) return `${h} h ${m} min`;
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export function ErrorNote({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="card flex items-center justify-between gap-3 p-3.5 text-[12.5px] text-muted">
      <span>{error}</span>
      {onRetry && (
        <button onClick={onRetry} className="shrink-0 font-semibold text-fg">
          Erneut
        </button>
      )}
    </div>
  );
}

export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2.5" aria-busy>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="card h-20 animate-pulse bg-surface/60" />
      ))}
    </div>
  );
}
