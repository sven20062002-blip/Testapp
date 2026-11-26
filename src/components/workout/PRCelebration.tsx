import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Trophy } from 'lucide-react';
import type { LivePR } from '@/lib/metrics';
import type { WeightUnit } from '@/db/types';
import { RECORD_LABELS } from '@/lib/labels';
import { fmtWeight } from '@/lib/units';
import { formatClock } from '@/lib/time';

export function describePR(p: { type: LivePR['type']; value: number; weight: number | null; reps: number | null }, unit: WeightUnit): string {
  switch (p.type) {
    case 'e1rm':
      return `≈ ${fmtWeight(p.value, unit)}`;
    case 'duration':
      return formatClock(p.value * 1000);
    case 'reps':
      return p.weight ? `${fmtWeight(p.weight, unit)} × ${p.reps}` : `${p.reps} Wdh`;
    case 'volume':
    case 'workoutVolume':
      return fmtWeight(p.value, unit);
    default:
      return `${fmtWeight(p.weight, unit)} × ${p.reps}`;
  }
}

export function describePrev(p: LivePR, unit: WeightUnit): string {
  return describePR({ type: p.type, value: p.prevValue, weight: p.prevWeight, reps: p.prevReps }, unit);
}

/** Subtle, auto-dismissing celebration card for new personal records. */
export function PRCelebration({ prs, exerciseName, unit, onClose }: { prs: LivePR[]; exerciseName: string; unit: WeightUnit; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 5200);
    return () => clearTimeout(t);
  }, [onClose]);
  return createPortal(
    <div
      className="pointer-events-none fixed inset-x-0 z-[75] flex justify-center px-4 lg:bottom-6"
      style={{ bottom: 'calc(var(--nav-h) + var(--safe-bottom) + 12px)' }}
    >
      <button
        onClick={onClose}
        role="alert"
        className="pointer-events-auto relative w-full max-w-sm overflow-hidden rounded-3xl border border-accent/40 bg-surface p-4 text-left shadow-2xl animate-pop"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 animate-shimmer opacity-60"
          style={{ backgroundImage: 'linear-gradient(110deg, transparent 30%, rgb(var(--accent) / .18) 50%, transparent 70%)', backgroundSize: '200% 100%' }}
        />
        <div className="relative flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent text-accent-fg">
            <Trophy size={24} />
          </div>
          <div className="min-w-0">
            <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-fg dark:text-accent">Neuer Rekord!</div>
            <div className="truncate text-[15px] font-bold">{exerciseName}</div>
          </div>
        </div>
        <div className="relative mt-3 space-y-2">
          {prs.map((p) => (
            <div key={p.type} className="rounded-xl bg-elevated px-3 py-2">
              <div className="text-[11.5px] font-semibold text-muted">
                {RECORD_LABELS[p.type]}
                {p.type === 'reps' && p.weight ? <span className="text-subtle"> · bei gleichem/höherem Gewicht</span> : null}
              </div>
              <div className="num mt-0.5 flex items-baseline gap-2 text-[13px]">
                <span className="text-subtle line-through decoration-1">{describePrev(p, unit)}</span>
                <span className="text-subtle">→</span>
                <span className="text-[15.5px] font-bold">{describePR(p, unit)}</span>
              </div>
            </div>
          ))}
        </div>
      </button>
    </div>,
    document.body,
  );
}
