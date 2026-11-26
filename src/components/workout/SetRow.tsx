import { memo, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { ArrowDown, ArrowUp, Check } from 'lucide-react';
import type { TrackingType, WeightUnit, WorkoutSet } from '@/db/types';
import { compareSet, type Trend } from '@/lib/metrics';
import { formatClock, setTimerElapsedMs } from '@/lib/time';
import { fmtWeight, parseDecimal, unitToKg, weightInputValue } from '@/lib/units';
import { updateSet } from '@/db/repo/workouts';
import { useNow } from '@/hooks/useData';

export interface Suggestion {
  weight: number | null;
  reps: number | null;
  holdSec: number | null;
}

interface Props {
  set: WorkoutSet;
  tracking: TrackingType;
  unit: WeightUnit;
  prev?: WorkoutSet;
  suggestion: Suggestion;
  workoutPausedAt: number | null;
  onToggle: (s: WorkoutSet) => void;
  onMenu: (s: WorkoutSet) => void;
  onCopyPrev: (s: WorkoutSet, prev: WorkoutSet) => void;
  invalid?: boolean;
}

export function prevLabel(p: Pick<WorkoutSet, 'weight' | 'reps' | 'holdSec'> | undefined, tracking: TrackingType, unit: WeightUnit): string {
  if (!p) return '–';
  if (tracking === 'duration') return p.holdSec ? formatClock(p.holdSec * 1000) : '–';
  if (tracking === 'bodyweight_reps') return p.weight ? `+${fmtWeight(p.weight, unit, false)} × ${p.reps}` : `${p.reps ?? '–'} Wdh`;
  return `${fmtWeight(p.weight, unit, false)} × ${p.reps ?? '–'}`;
}

function TrendIcon({ t }: { t: Trend }) {
  if (t === 'up') return <ArrowUp size={12} strokeWidth={3} className="text-good" aria-label="gesteigert" />;
  if (t === 'down') return <ArrowDown size={12} strokeWidth={3} className="text-subtle" aria-label="weniger" />;
  return null;
}

export const SetRow = memo(function SetRow({ set, tracking, unit, prev, suggestion, workoutPausedAt, onToggle, onMenu, onCopyPrev, invalid }: Props) {
  const done = set.completed === 1;
  const timerRunning = !!set.timerStartedAt && !done;
  const now = useNow(timerRunning && !workoutPausedAt, 500);
  const cmp = done ? compareSet(set, prev) : null;
  const trend: Trend = !cmp
    ? 'none'
    : tracking === 'duration'
      ? cmp.hold
      : cmp.weight === 'up' || (cmp.weight !== 'down' && cmp.reps === 'up')
        ? 'up'
        : cmp.weight === 'down' || cmp.reps === 'down'
          ? 'down'
          : 'none';

  const timeLabel = timerRunning
    ? formatClock(setTimerElapsedMs(set, workoutPausedAt, now))
    : set.durationSec != null
      ? formatClock(set.durationSec * 1000)
      : null;

  return (
    <div
      className={clsx(
        'grid items-center gap-2 rounded-xl px-1.5 py-1 transition-colors',
        tracking === 'duration' ? 'grid-cols-[40px_1fr_1.25fr_48px]' : 'grid-cols-[40px_1fr_1fr_1fr_48px]',
        done && 'bg-good/[.09]',
        timerRunning && 'bg-accent/[.08] ring-1 ring-accent/40',
        invalid && 'animate-shake ring-1 ring-bad/60',
      )}
      data-testid="set-row"
    >
      <button
        onClick={() => onMenu(set)}
        className="flex h-11 flex-col items-center justify-center rounded-lg hover:bg-elevated"
        aria-label={`Satz ${set.order + 1} – Optionen`}
      >
        <span className={clsx('num text-[15px] font-bold leading-none', set.kind === 'warmup' ? 'text-warn' : done ? 'text-good' : 'text-fg')}>
          {set.kind === 'warmup' ? 'W' : set.order + 1}
        </span>
        {timeLabel && <span className={clsx('num mt-0.5 text-[10px] font-semibold leading-none', timerRunning ? 'text-fg dark:text-accent' : 'text-subtle')}>{timeLabel}</span>}
      </button>

      <button
        onClick={() => prev && onCopyPrev(set, prev)}
        disabled={!prev || done}
        className="num flex min-w-0 items-center justify-center gap-1 truncate rounded-lg py-2 text-[13px] font-medium text-subtle enabled:hover:bg-elevated enabled:hover:text-fg"
        aria-label={prev ? `Letztes Mal ${prevLabel(prev, tracking, unit)} übernehmen` : 'Kein Vorwert'}
      >
        <span className="truncate">{prevLabel(prev, tracking, unit)}</span>
        <TrendIcon t={trend} />
      </button>

      {tracking === 'duration' ? (
        <NumField
          value={set.holdSec}
          placeholder={suggestion.holdSec != null ? String(suggestion.holdSec) : timerRunning ? 'Timer' : 'Sek'}
          decimal={false}
          done={done}
          label={`Haltezeit Satz ${set.order + 1} in Sekunden`}
          onCommit={(v) => updateSet(set.id, { holdSec: v == null ? null : Math.round(v) })}
        />
      ) : (
        <>
          <NumField
            value={set.weight == null ? null : Number(weightInputValue(set.weight, unit).replace(',', '.'))}
            placeholder={suggestion.weight != null ? weightInputValue(suggestion.weight, unit) : tracking === 'bodyweight_reps' ? '+0' : unit}
            decimal
            done={done}
            label={`Gewicht Satz ${set.order + 1} in ${unit}`}
            onCommit={(v) => updateSet(set.id, { weight: v == null ? null : unitToKg(v, unit) })}
          />
          <NumField
            value={set.reps}
            placeholder={suggestion.reps != null ? String(suggestion.reps) : 'Wdh'}
            decimal={false}
            done={done}
            label={`Wiederholungen Satz ${set.order + 1}`}
            onCommit={(v) => updateSet(set.id, { reps: v == null ? null : Math.round(v) })}
          />
        </>
      )}

      <button
        onClick={() => onToggle(set)}
        aria-label={done ? `Satz ${set.order + 1} wieder öffnen` : `Satz ${set.order + 1} abschließen`}
        aria-pressed={done}
        className={clsx(
          'flex h-11 w-12 items-center justify-center rounded-xl transition active:scale-90',
          done ? 'animate-check bg-good text-white' : 'bg-elevated text-subtle hover:text-fg',
        )}
      >
        <Check size={22} strokeWidth={3} />
      </button>
    </div>
  );
});

/** Numeric input with local editing state; commits on change (valid) and blur. */
function NumField({
  value,
  placeholder,
  decimal,
  done,
  label,
  onCommit,
}: {
  value: number | null;
  placeholder: string;
  decimal: boolean;
  done: boolean;
  label: string;
  onCommit: (v: number | null) => void;
}) {
  const fmt = (v: number | null) => (v == null ? '' : String(v).replace('.', ','));
  const [text, setText] = useState(fmt(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(fmt(value));
  }, [value]);

  return (
    <input
      type="text"
      inputMode={decimal ? 'decimal' : 'numeric'}
      enterKeyHint="next"
      autoComplete="off"
      aria-label={label}
      value={text}
      placeholder={placeholder}
      onFocus={(e) => {
        focused.current = true;
        e.currentTarget.select();
      }}
      onChange={(e) => {
        const raw = decimal ? e.target.value.replace(/[^\d.,]/g, '') : e.target.value.replace(/\D/g, '');
        setText(raw);
        const v = parseDecimal(raw);
        if (raw === '' || v != null) onCommit(raw === '' ? null : v);
      }}
      onBlur={() => {
        focused.current = false;
        setText(fmt(value));
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      className={clsx(
        'num h-11 w-full min-w-0 rounded-xl border border-transparent bg-elevated text-center text-[17px] font-bold outline-none transition placeholder:font-semibold placeholder:text-subtle/80 focus:border-accent focus:bg-surface',
        done && 'bg-transparent',
      )}
    />
  );
}
