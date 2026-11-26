import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import {
  ArrowDown,
  ArrowUp,
  ClipboardCopy,
  Flame,
  Hourglass,
  Info,
  MoreHorizontal,
  Pin,
  Play,
  Plus,
  RotateCcw,
  StickyNote,
  Trash2,
} from 'lucide-react';
import { db } from '@/db/db';
import type { Workout, WorkoutExercise, WorkoutSet } from '@/db/types';
import {
  addSet,
  deleteSet,
  getLastPerformance,
  moveWorkoutExercise,
  removeExerciseFromWorkout,
  resetSetTimer,
  setWorkoutExerciseNote,
  setWorkoutExerciseRest,
  startSetTimer,
  updateSet,
} from '@/db/repo/workouts';
import { saveExerciseNote } from '@/db/repo/exercises';
import { useExerciseName, useSettings } from '@/hooks/useData';
import { sumVolume } from '@/lib/metrics';
import { MUSCLE_LABELS } from '@/lib/labels';
import { fmtVolume } from '@/lib/units';
import { formatClock, relativeDay } from '@/lib/time';
import { MuscleIcon } from '@/components/exercises/MuscleIcon';
import { Sheet } from '@/components/ui/Sheet';
import { useFeedback } from '@/components/ui/Feedback';
import { IconButton } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Chip';
import { SetRow, prevLabel, type Suggestion } from './SetRow';
import { RestPicker } from './TimerPanel';

interface Props {
  workout: Workout;
  we: WorkoutExercise;
  sets: WorkoutSet[];
  index: number;
  count: number;
  onToggleSet: (s: WorkoutSet, suggestion: Suggestion) => void;
  invalidSetId: string | null;
}

export function ExerciseCard({ workout, we, sets, index, count, onToggleSet, invalidSetId }: Props) {
  const settings = useSettings();
  const name = useExerciseName();
  const { confirm, toast } = useFeedback();
  const nav = useNavigate();
  const tracking = we.snapshot.trackingType;
  const last = useLiveQuery(() => getLastPerformance(we.exerciseId, workout.id), [we.exerciseId, workout.id]);
  const permNote = useLiveQuery(() => db.exerciseNotes.get(we.exerciseId), [we.exerciseId]);
  const [menu, setMenu] = useState(false);
  const [activeSet, setActiveSet] = useState<WorkoutSet | null>(null);
  const [restPicker, setRestPicker] = useState(false);
  const [showOneOff, setShowOneOff] = useState(!!we.note);

  const ordered = useMemo(() => [...sets].sort((a, b) => a.order - b.order), [sets]);
  const lastSets = last?.sets ?? [];
  const doneCount = ordered.filter((s) => s.completed).length;
  const volume = sumVolume(ordered);

  /** Suggestion per row: same set of last workout, otherwise previous row of today */
  const suggestions = useMemo(() => {
    const out: Suggestion[] = [];
    ordered.forEach((s, i) => {
      const p = lastSets[i];
      const before = ordered[i - 1];
      const prevRow = before ? { weight: before.weight ?? out[i - 1]?.weight ?? null, reps: before.reps ?? out[i - 1]?.reps ?? null, holdSec: before.holdSec ?? out[i - 1]?.holdSec ?? null } : null;
      out.push({
        weight: p?.weight ?? prevRow?.weight ?? null,
        reps: p?.reps ?? prevRow?.reps ?? null,
        holdSec: p?.holdSec ?? prevRow?.holdSec ?? null,
      });
      void s;
    });
    return out;
  }, [ordered, lastSets]);

  const applyLast = async () => {
    const open = ordered.filter((s) => !s.completed);
    for (const s of open) {
      const i = ordered.indexOf(s);
      const p = lastSets[i];
      if (p) await updateSet(s.id, { weight: p.weight, reps: p.reps, holdSec: p.holdSec });
    }
    // add missing sets so the structure matches last time
    for (let i = ordered.length; i < lastSets.length; i++) {
      const id = await addSet(we.id);
      await updateSet(id, { weight: lastSets[i].weight, reps: lastSets[i].reps, holdSec: lastSets[i].holdSec });
    }
    toast('Werte vom letzten Training übernommen', 'success');
  };

  const remove = async () => {
    setMenu(false);
    if (await confirm({ title: 'Übung entfernen?', text: `${name(we.snapshot)} und alle ${ordered.length} Sätze werden aus diesem Workout entfernt.`, confirmLabel: 'Entfernen', danger: true }))
      await removeExerciseFromWorkout(we.id);
  };

  const restLabel = we.restSec != null ? formatClock(we.restSec * 1000) : null;

  return (
    <section id={`we-${we.id}`} className="card scroll-mt-40 p-3 sm:p-4 animate-rise" aria-label={name(we.snapshot)}>
      {/* Header */}
      <div className="flex items-start gap-3 px-1">
        <MuscleIcon muscle={we.snapshot.muscleGroup} size={42} />
        <div className="min-w-0 flex-1 pt-0.5">
          <h3 className="truncate text-[17px] font-bold leading-tight tracking-tight">{name(we.snapshot)}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
            <span>{MUSCLE_LABELS[we.snapshot.muscleGroup]}</span>
            <span className="text-subtle">·</span>
            <span className="num">
              {doneCount}/{ordered.length} Sätze
            </span>
            {we.targetReps && <Badge>Ziel {we.targetReps}</Badge>}
            {restLabel && (
              <Badge>
                <Hourglass size={10} /> {restLabel}
              </Badge>
            )}
          </div>
        </div>
        <IconButton label="Übungsoptionen" onClick={() => setMenu(true)}>
          <MoreHorizontal size={20} />
        </IconButton>
      </div>

      {/* Permanent note */}
      <PermanentNote exerciseId={we.exerciseId} text={permNote?.text ?? ''} />

      {/* One-off workout note */}
      {showOneOff && (
        <AutoNote
          value={we.note}
          onSave={(t) => setWorkoutExerciseNote(we.id, t)}
          placeholder="Notiz nur für dieses Workout …"
          icon={<StickyNote size={14} />}
          label="Workout-Notiz"
          tone="plain"
        />
      )}

      {/* Last workout */}
      {last && lastSets.length > 0 && (
        <div className="mx-1 mt-3 rounded-xl bg-elevated/70 p-3">
          <div className="flex items-center justify-between">
            <div className="label">Letztes Training · {relativeDay(last.workout.endedAt ?? last.workout.startedAt)}</div>
            {ordered.some((s) => !s.completed) && (
              <button onClick={applyLast} className="flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-bold text-fg hover:bg-line dark:text-accent">
                <ClipboardCopy size={13} /> Übernehmen
              </button>
            )}
          </div>
          <div className="num mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-muted">
            {lastSets.map((s, i) => (
              <span key={s.id}>
                <span className="text-subtle">{s.kind === 'warmup' ? 'W' : i + 1}:</span> {prevLabel(s, tracking, settings.unit)}
              </span>
            ))}
          </div>
          {last.note && <div className="mt-1.5 text-[12px] italic text-subtle">„{last.note}“</div>}
        </div>
      )}

      {/* Sets */}
      <div className="mt-3">
        <div
          className={clsx(
            'grid gap-2 px-1.5 pb-1 text-center text-[10.5px] font-bold uppercase tracking-wider text-subtle',
            tracking === 'duration' ? 'grid-cols-[40px_1fr_1.25fr_48px]' : 'grid-cols-[40px_1fr_1fr_1fr_48px]',
          )}
        >
          <span>Satz</span>
          <span>Vorher</span>
          {tracking === 'duration' ? (
            <span>Sekunden</span>
          ) : (
            <>
              <span>{tracking === 'bodyweight_reps' ? `+${settings.unit}` : settings.unit}</span>
              <span>Wdh</span>
            </>
          )}
          <span>✓</span>
        </div>
        <div className="space-y-1">
          {ordered.map((s, i) => (
            <SetRow
              key={s.id}
              set={s}
              tracking={tracking}
              unit={settings.unit}
              prev={lastSets[i]}
              suggestion={suggestions[i]}
              workoutPausedAt={workout.pausedAt}
              onToggle={(x) => onToggleSet(x, suggestions[i])}
              onMenu={setActiveSet}
              onCopyPrev={(x, p) => updateSet(x.id, { weight: p.weight, reps: p.reps, holdSec: p.holdSec })}
              invalid={invalidSetId === s.id}
            />
          ))}
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2 px-1">
        <button
          onClick={() => addSet(we.id)}
          className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-elevated text-[14px] font-semibold transition hover:bg-line active:scale-[.99]"
        >
          <Plus size={17} /> Satz hinzufügen
        </button>
        {!showOneOff && (
          <IconButton label="Workout-Notiz hinzufügen" variant="secondary" className="h-11 w-11" onClick={() => setShowOneOff(true)}>
            <StickyNote size={18} />
          </IconButton>
        )}
      </div>
      {volume > 0 && (
        <div className="num mt-2 px-1.5 text-right text-[12px] text-subtle">
          Volumen <span className="font-semibold text-muted">{fmtVolume(volume, settings.unit)}</span>
        </div>
      )}

      {/* Exercise menu */}
      <Sheet open={menu} onClose={() => setMenu(false)} title={name(we.snapshot)}>
        <MenuList>
          <MenuItem icon={<ArrowUp size={18} />} disabled={index === 0} onClick={() => (moveWorkoutExercise(workout.id, we.id, -1), setMenu(false))}>
            Nach oben
          </MenuItem>
          <MenuItem icon={<ArrowDown size={18} />} disabled={index === count - 1} onClick={() => (moveWorkoutExercise(workout.id, we.id, 1), setMenu(false))}>
            Nach unten
          </MenuItem>
          <MenuItem icon={<Hourglass size={18} />} onClick={() => (setMenu(false), setRestPicker(true))}>
            Pausenzeit für diese Übung {restLabel ? `(${restLabel})` : '(Standard)'}
          </MenuItem>
          {we.restSec != null && (
            <MenuItem icon={<RotateCcw size={18} />} onClick={() => (setWorkoutExerciseRest(we.id, null), setMenu(false))}>
              Standard-Pausenzeit verwenden
            </MenuItem>
          )}
          <MenuItem icon={<StickyNote size={18} />} onClick={() => (setShowOneOff(true), setMenu(false))}>
            Workout-Notiz hinzufügen
          </MenuItem>
          <MenuItem icon={<Info size={18} />} onClick={() => nav(`/exercises/${we.exerciseId}`)}>
            Übungsdetails & Verlauf
          </MenuItem>
          <MenuItem icon={<Trash2 size={18} />} danger onClick={remove}>
            Übung entfernen
          </MenuItem>
        </MenuList>
      </Sheet>

      <RestPicker
        open={restPicker}
        onClose={() => setRestPicker(false)}
        title="Pausenzeit für diese Übung"
        onPick={(sec) => void setWorkoutExerciseRest(we.id, sec)}
      />

      {/* Set menu */}
      <Sheet open={!!activeSet} onClose={() => setActiveSet(null)} title={activeSet ? `Satz ${activeSet.order + 1}` : ''}>
        {activeSet && (
          <MenuList>
            {!activeSet.completed && (
              <MenuItem
                icon={<Play size={18} />}
                disabled={!!workout.pausedAt}
                onClick={() => (startSetTimer(activeSet.id), setActiveSet(null))}
              >
                {activeSet.timerStartedAt ? 'Satz-Timer neu starten' : 'Satz-Timer starten'}
              </MenuItem>
            )}
            {activeSet.timerStartedAt && !activeSet.completed && (
              <MenuItem icon={<RotateCcw size={18} />} onClick={() => (resetSetTimer(activeSet.id), setActiveSet(null))}>
                Satz-Timer zurücksetzen
              </MenuItem>
            )}
            <MenuItem
              icon={<Flame size={18} />}
              onClick={() => (updateSet(activeSet.id, { kind: activeSet.kind === 'warmup' ? 'normal' : 'warmup' }), setActiveSet(null))}
            >
              {activeSet.kind === 'warmup' ? 'Als Arbeitssatz markieren' : 'Als Aufwärmsatz markieren'}
            </MenuItem>
            <MenuItem
              icon={<Trash2 size={18} />}
              danger
              onClick={async () => {
                const s = activeSet;
                setActiveSet(null);
                await deleteSet(s.id);
                toast(`Satz ${s.order + 1} gelöscht`, 'info');
              }}
            >
              Satz löschen
            </MenuItem>
          </MenuList>
        )}
      </Sheet>
    </section>
  );
}

function PermanentNote({ exerciseId, text }: { exerciseId: string; text: string }) {
  const [editing, setEditing] = useState(false);
  if (!text && !editing)
    return (
      <button onClick={() => setEditing(true)} className="ml-1 mt-2 flex items-center gap-1.5 text-[12px] font-semibold text-subtle hover:text-muted">
        <Pin size={12} /> Dauerhafte Notiz hinzufügen
      </button>
    );
  return (
    <AutoNote
      value={text}
      onSave={(t) => saveExerciseNote(exerciseId, t)}
      placeholder="Dauerhafte Notiz zu dieser Übung (z. B. Sitzeinstellung, Griff) …"
      icon={<Pin size={14} />}
      label="Dauerhafte Notiz"
      tone="accent"
      autoFocus={editing && !text}
      onEmptyBlur={() => setEditing(false)}
    />
  );
}

/** Auto-saving note field (debounced, saves on blur as well). */
export function AutoNote({
  value,
  onSave,
  placeholder,
  icon,
  label,
  tone,
  autoFocus,
  onEmptyBlur,
}: {
  value: string;
  onSave: (t: string) => unknown;
  placeholder: string;
  icon: React.ReactNode;
  label: string;
  tone: 'accent' | 'plain';
  autoFocus?: boolean;
  onEmptyBlur?: () => void;
}) {
  const [text, setText] = useState(value);
  const [saved, setSaved] = useState(true);
  const focused = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!focused.current) setText(value);
  }, [value]);
  useEffect(() => {
    const el = ref.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [text]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const flush = (t: string) => {
    clearTimeout(timer.current);
    void Promise.resolve(onSave(t)).then(() => setSaved(true));
  };

  return (
    <div
      className={clsx(
        'mx-1 mt-2.5 flex gap-2 rounded-xl px-3 py-2',
        tone === 'accent' ? 'bg-accent-soft/70 text-fg' : 'bg-elevated/70',
      )}
    >
      <span className={clsx('mt-[3px] shrink-0', tone === 'accent' ? 'text-fg/70 dark:text-accent' : 'text-subtle')}>{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between">
          <span className="text-[10.5px] font-bold uppercase tracking-wider opacity-60">{label}</span>
          <span className="text-[10.5px] text-subtle" aria-live="polite">
            {saved ? '' : 'Speichert …'}
          </span>
        </div>
        <textarea
          ref={ref}
          rows={1}
          value={text}
          autoFocus={autoFocus}
          placeholder={placeholder}
          aria-label={label}
          onFocus={() => (focused.current = true)}
          onChange={(e) => {
            const t = e.target.value;
            setText(t);
            setSaved(false);
            clearTimeout(timer.current);
            timer.current = setTimeout(() => flush(t), 500);
          }}
          onBlur={() => {
            focused.current = false;
            flush(text);
            if (!text.trim()) onEmptyBlur?.();
          }}
          className="mt-0.5 block w-full resize-none bg-transparent text-[14px] leading-snug outline-none placeholder:text-subtle"
        />
      </div>
    </div>
  );
}

export function MenuList({ children }: { children: React.ReactNode }) {
  return <div className="-mx-1 flex flex-col">{children}</div>;
}

export function MenuItem({
  icon,
  children,
  onClick,
  danger,
  disabled,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'flex w-full items-center gap-3 rounded-xl px-3 py-3.5 text-left text-[15px] font-semibold transition hover:bg-elevated disabled:opacity-35',
        danger && 'text-bad',
      )}
    >
      <span className={danger ? 'text-bad' : 'text-muted'}>{icon}</span>
      {children}
    </button>
  );
}
