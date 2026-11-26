import { useState } from 'react';
import clsx from 'clsx';
import { Hourglass, Minus, Pause, Play, Plus, SkipForward, Square, Timer } from 'lucide-react';
import type { Workout, WorkoutExercise, WorkoutSet } from '@/db/types';
import { adjustRest, pauseRest, resumeRest, startRest, stopRest } from '@/db/repo/timers';
import { nextOpenSet, startSetTimer } from '@/db/repo/workouts';
import { useNow, useRest, useSettings, useExerciseName } from '@/hooks/useData';
import { formatClock, restRemainingMs, setTimerElapsedMs } from '@/lib/time';
import { parseDecimal } from '@/lib/units';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { unlockAudio } from '@/services/feedback';

export const REST_PRESETS = [30, 60, 90, 120, 180];

/**
 * Both live timers (set timer + rest timer) side by side, always visible on the workout screen.
 */
export function TimerPanel({
  workout,
  exercises,
  sets,
  onCompleteSet,
}: {
  workout: Workout;
  exercises: WorkoutExercise[];
  sets: WorkoutSet[];
  onCompleteSet: (s: WorkoutSet) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      <SetTimerCard workout={workout} exercises={exercises} sets={sets} onCompleteSet={onCompleteSet} />
      <RestTimerCard workout={workout} />
    </div>
  );
}

function SetTimerCard({
  workout,
  exercises,
  sets,
  onCompleteSet,
}: {
  workout: Workout;
  exercises: WorkoutExercise[];
  sets: WorkoutSet[];
  onCompleteSet: (s: WorkoutSet) => void;
}) {
  const running = sets.find((s) => s.timerStartedAt && !s.completed);
  const now = useNow(!!running && !workout.pausedAt, 200);
  const name = useExerciseName();
  const we = running && exercises.find((e) => e.id === running.workoutExerciseId);
  const lastDone = [...sets].filter((s) => s.completed && s.durationSec != null).sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))[0];

  const startNext = async () => {
    unlockAudio();
    const next = await nextOpenSet(workout.id);
    if (next) await startSetTimer(next.id);
  };
  const hasOpen = sets.some((s) => !s.completed);

  return (
    <div className={clsx('card relative overflow-hidden p-3.5', running && 'ring-1 ring-accent/50')}>
      <div className="flex items-center gap-1.5 text-[12px] font-semibold text-muted">
        <Timer size={14} /> Satz-Timer
      </div>
      {running && we ? (
        <>
          <div className="num mt-1 text-[28px] font-bold leading-none tracking-tight text-fg">
            {formatClock(setTimerElapsedMs(running, workout.pausedAt, now))}
          </div>
          <div className="mt-1 truncate text-[12px] text-muted">
            {name(we.snapshot)} · Satz {running.order + 1}
          </div>
          <Button variant="primary" size="sm" block className="mt-2.5" onClick={() => onCompleteSet(running)} icon={<Square size={13} fill="currentColor" />}>
            Satz fertig
          </Button>
        </>
      ) : (
        <>
          <div className="num mt-1 text-[28px] font-bold leading-none tracking-tight text-subtle">0:00</div>
          <div className="mt-1 truncate text-[12px] text-muted">
            {lastDone ? `Letzter Satz: ${formatClock(lastDone.durationSec! * 1000)}` : 'Misst die Dauer jedes Satzes'}
          </div>
          <Button size="sm" block className="mt-2.5" disabled={!hasOpen || !!workout.pausedAt} onClick={startNext} icon={<Play size={13} fill="currentColor" />}>
            Satz starten
          </Button>
        </>
      )}
    </div>
  );
}

function RestTimerCard({ workout }: { workout: Workout }) {
  const rest = useRest();
  const settings = useSettings();
  const mine = rest.workoutId === workout.id || rest.workoutId == null;
  const active = mine && (rest.status === 'running' || rest.status === 'paused');
  const now = useNow(active && rest.status === 'running', 200);
  const [picker, setPicker] = useState(false);
  const remaining = active ? restRemainingMs(rest, now) : 0;
  const pct = active && rest.totalSec ? Math.min(1, remaining / (rest.totalSec * 1000)) : 0;
  const done = mine && rest.status === 'done';

  return (
    <div className={clsx('card relative overflow-hidden p-3.5', active && 'ring-1 ring-accent/50', done && 'ring-2 ring-good')}>
      {active && (
        <div
          className="absolute inset-y-0 left-0 bg-accent/10 transition-[width] duration-200 ease-linear"
          style={{ width: `${pct * 100}%` }}
          aria-hidden
        />
      )}
      <div className="relative">
        <div className="flex items-center justify-between text-[12px] font-semibold text-muted">
          <span className="flex items-center gap-1.5">
            <Hourglass size={14} /> Pause
          </span>
          {!settings.autoRest && <span className="text-[10px] text-subtle">Auto aus</span>}
        </div>
        {active ? (
          <>
            <div
              className={clsx('num mt-1 text-[28px] font-bold leading-none tracking-tight', rest.status === 'paused' ? 'text-warn' : 'text-fg')}
              role="timer"
              aria-live="off"
            >
              {formatClock(remaining, true)}
            </div>
            <div className="mt-1 text-[12px] text-muted">{rest.status === 'paused' ? 'Pausiert' : `von ${formatClock(rest.totalSec * 1000)}`}</div>
            <div className="mt-2.5 grid grid-cols-4 gap-1">
              <MiniBtn label="15 Sekunden weniger" onClick={() => adjustRest(-15)}>
                <Minus size={15} />
              </MiniBtn>
              <MiniBtn label="15 Sekunden mehr" onClick={() => adjustRest(15)}>
                <Plus size={15} />
              </MiniBtn>
              <MiniBtn label={rest.status === 'paused' ? 'Fortsetzen' : 'Pausieren'} onClick={() => (rest.status === 'paused' ? resumeRest() : pauseRest())}>
                {rest.status === 'paused' ? <Play size={15} /> : <Pause size={15} />}
              </MiniBtn>
              <MiniBtn label="Pause überspringen" onClick={() => stopRest()} accent>
                <SkipForward size={15} />
              </MiniBtn>
            </div>
          </>
        ) : (
          <>
            <div className={clsx('num mt-1 text-[28px] font-bold leading-none tracking-tight', done ? 'text-good' : 'text-subtle')}>
              {done ? 'Los!' : formatClock(settings.defaultRestSec * 1000)}
            </div>
            <div className="mt-1 text-[12px] text-muted">{done ? 'Pause vorbei' : 'Standard-Pause'}</div>
            <Button size="sm" block className="mt-2.5" onClick={() => setPicker(true)} icon={<Play size={13} fill="currentColor" />}>
              Pause starten
            </Button>
          </>
        )}
      </div>
      <RestPicker open={picker} onClose={() => setPicker(false)} workoutId={workout.id} />
    </div>
  );
}

function MiniBtn({ children, label, onClick, accent }: { children: React.ReactNode; label: string; onClick: () => void; accent?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={clsx(
        'flex h-9 items-center justify-center rounded-lg transition active:scale-95',
        accent ? 'bg-accent text-accent-fg' : 'bg-elevated text-fg hover:bg-line',
      )}
    >
      {children}
    </button>
  );
}

export function RestPicker({
  open,
  onClose,
  workoutId,
  workoutExerciseId = null,
  onPick,
  title = 'Pausentimer',
}: {
  open: boolean;
  onClose: () => void;
  workoutId?: string;
  workoutExerciseId?: string | null;
  onPick?: (sec: number) => void;
  title?: string;
}) {
  const [custom, setCustom] = useState('');
  const pick = async (sec: number) => {
    unlockAudio();
    if (onPick) onPick(sec);
    else await startRest(sec, workoutId ?? null, workoutExerciseId);
    onClose();
  };
  const customSec = (() => {
    const s = custom.trim();
    if (!s) return null;
    if (s.includes(':')) {
      const [m, sec] = s.split(':');
      const v = Number(m) * 60 + Number(sec || 0);
      return Number.isFinite(v) && v > 0 ? v : null;
    }
    const v = parseDecimal(s);
    return v && v > 0 ? Math.round(v) : null;
  })();
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="grid grid-cols-3 gap-2">
        {REST_PRESETS.map((s) => (
          <button key={s} onClick={() => pick(s)} className="num h-16 rounded-2xl bg-elevated text-lg font-bold transition hover:bg-line active:scale-95">
            {formatClock(s * 1000)}
          </button>
        ))}
      </div>
      <div className="mt-4 flex gap-2">
        <input
          className="field num"
          inputMode="numeric"
          placeholder="Eigene Zeit (Sek. oder m:ss)"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          aria-label="Eigene Pausenzeit"
        />
        <Button variant="primary" size="lg" disabled={!customSec || customSec > 3600} onClick={() => customSec && pick(customSec)}>
          Start
        </Button>
      </div>
    </Sheet>
  );
}
