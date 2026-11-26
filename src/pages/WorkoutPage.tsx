import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { ChevronRight, Dumbbell, Flag, ListPlus, MoreHorizontal, NotebookPen, Pause, Play, Plus, Trash2, PencilLine, ArrowRightCircle } from 'lucide-react';
import { db } from '@/db/db';
import type { Workout, WorkoutSet } from '@/db/types';
import {
  addExerciseToWorkout,
  completeSet,
  discardWorkout,
  finishWorkout,
  getLastPerformance,
  pauseWorkout,
  renameWorkout,
  resumeWorkout,
  setWorkoutNote,
  startWorkout,
  uncompleteSet,
} from '@/db/repo/workouts';
import { useActiveWorkout, useExerciseMap, useExerciseName, useNow, useSettings } from '@/hooks/useData';
import { clockElapsedMs, fmtTime, formatHMS, relativeDay, formatDuration } from '@/lib/time';
import { countCompleted, sumVolume, type LivePR } from '@/lib/metrics';
import { fmtVolume } from '@/lib/units';
import { Button, IconButton } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { useFeedback } from '@/components/ui/Feedback';
import { ExercisePicker } from '@/components/exercises/ExercisePicker';
import { ExerciseCard, AutoNote, MenuItem, MenuList } from '@/components/workout/ExerciseCard';
import { TimerPanel } from '@/components/workout/TimerPanel';
import { PRCelebration } from '@/components/workout/PRCelebration';
import type { Suggestion } from '@/components/workout/SetRow';
import { PageHeader, SectionTitle } from '@/components/ui/PageHeader';
import { playPR, unlockAudio, vibrate } from '@/services/feedback';
import { DuelBanner } from '@/components/social/DuelBanner';
import { FEATURES } from '@/config/features';

export default function WorkoutPage() {
  const active = useActiveWorkout();
  const [params, setParams] = useSearchParams();
  const loaded = useLiveQuery(() => db.workouts.count(), []) !== undefined;

  // PWA shortcut: /workout?start=1
  useEffect(() => {
    if (params.get('start') === '1' && loaded) {
      setParams({}, { replace: true });
      if (!active) void startWorkout();
    }
  }, [params, loaded, active, setParams]);

  if (!loaded) return null;
  return active ? <ActiveWorkout workout={active} /> : <StartWorkout />;
}

/* ------------------------------------------------------------------ */

function StartWorkout() {
  const exMap = useExerciseMap();
  const exName = useExerciseName();
  const plans = useLiveQuery(() => db.plans.orderBy('updatedAt').reverse().toArray(), []);
  const recent = useLiveQuery(() => db.workouts.where('status').equals('completed').reverse().sortBy('startedAt').then((w) => w.slice(0, 4)), []);
  const start = async (o: Parameters<typeof startWorkout>[0] = {}) => {
    unlockAudio();
    await startWorkout(o);
    window.scrollTo({ top: 0 });
  };
  const sortedPlans = useMemo(
    () => [...(plans ?? [])].sort((a, b) => (b.lastUsedAt ?? b.createdAt) - (a.lastUsedAt ?? a.createdAt)),
    [plans],
  );

  return (
    <div className="page">
      <PageHeader title="Training" subtitle="Starte ein neues Workout oder wähle einen Plan" />
      <button
        onClick={() => start()}
        className="group relative flex w-full items-center gap-4 overflow-hidden rounded-3xl bg-accent p-5 text-left text-accent-fg transition active:scale-[.99]"
      >
        <div aria-hidden className="drift pointer-events-none absolute -right-10 -top-16 h-40 w-40 rounded-full bg-white/25 blur-2xl" />
        <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-black/10 transition-transform duration-300 group-hover:scale-110">
          <Play size={28} fill="currentColor" />
        </div>
        <div className="relative flex-1">
          <div className="text-[18px] font-bold tracking-tight">Leeres Workout starten</div>
          <div className="text-[13px] font-medium opacity-75">Übungen frei hinzufügen</div>
        </div>
        <ChevronRight className="opacity-60 transition group-hover:translate-x-1" />
      </button>

      <SectionTitle
        area="train"
        action={
          <Link to="/plans" className="text-[12px] font-semibold text-muted hover:text-fg">
            Verwalten
          </Link>
        }
      >
        Trainingspläne
      </SectionTitle>
      <div className="stagger grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {sortedPlans.map((p) => (
          <button key={p.id} onClick={() => start({ planId: p.id })} className="card flex w-full min-w-0 items-center gap-3 p-3.5 text-left transition hover:border-line active:scale-[.99]" aria-label={`${p.name} starten`}>
            <span className="h-10 w-1.5 shrink-0 rounded-full" style={{ background: p.color }} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-bold">{p.name}</div>
              <div className="truncate text-[11.5px] text-muted">
                {p.exercises
                  .slice(0, 4)
                  .map((e) => exName(exMap.get(e.exerciseId)))
                  .join(', ') || 'Noch keine Übungen'}
              </div>
              <div className="num truncate text-[11px] text-subtle">
                {p.exercises.length} Übungen · {p.exercises.reduce((a, e) => a + e.targetSets, 0)} Sätze
                {p.lastUsedAt ? ` · zuletzt ${relativeDay(p.lastUsedAt).toLowerCase()}` : ''}
              </div>
            </div>
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-elevated">
              <Play size={16} fill="currentColor" />
            </span>
          </button>
        ))}
        <Link to="/plans/new" className="flex min-h-[64px] items-center justify-center gap-2 rounded-2xl border border-dashed border-line text-[12.5px] font-semibold text-muted hover:text-fg">
          <ListPlus size={18} /> Neuer Plan
        </Link>
      </div>

      {!!recent?.length && (
        <>
          <SectionTitle>Workout wiederholen</SectionTitle>
          <div className="card divide-y divide-line/60">
            {recent.map((w) => (
              <button key={w.id} onClick={() => start({ templateWorkoutId: w.id })} className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-elevated/50">
                <Dumbbell size={18} className="text-subtle" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{w.name}</div>
                  <div className="text-[12.5px] text-muted">
                    {relativeDay(w.startedAt)} · {formatDuration(w.durationSec)}
                  </div>
                </div>
                <span className="text-[12.5px] font-semibold text-muted">Als Vorlage</span>
                <ChevronRight size={18} className="text-subtle" />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ActiveWorkout({ workout }: { workout: Workout }) {
  const nav = useNavigate();
  const settings = useSettings();
  const name = useExerciseName();
  const { toast, confirm } = useFeedback();
  const exercises = useLiveQuery(() => db.workoutExercises.where('workoutId').equals(workout.id).sortBy('order'), [workout.id]);
  const sets = useLiveQuery(() => db.sets.where('workoutId').equals(workout.id).toArray(), [workout.id]);
  const [picker, setPicker] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [invalid, setInvalid] = useState<string | null>(null);
  const [celebration, setCelebration] = useState<{ prs: LivePR[]; name: string } | null>(null);

  const setsByWe = useMemo(() => {
    const m = new Map<string, WorkoutSet[]>();
    for (const s of sets ?? []) m.set(s.workoutExerciseId, [...(m.get(s.workoutExerciseId) ?? []), s]);
    return m;
  }, [sets]);

  const onToggleSet = useCallback(
    async (s: WorkoutSet, suggestion?: Suggestion) => {
      unlockAudio();
      if (s.completed) {
        await uncompleteSet(s.id);
        return;
      }
      const res = await completeSet(s.id, suggestion);
      if (res.error) {
        setInvalid(s.id);
        setTimeout(() => setInvalid(null), 700);
        toast(res.error, 'error');
        return;
      }
      if (settings.vibration) vibrate(30);
      if (FEATURES.social) void import('@/social/duelBridge').then((m) => m.postSetToDuels(s.id)).catch(() => {});
      if (res.prs.length) {
        const we = exercises?.find((e) => e.id === s.workoutExerciseId);
        setCelebration({ prs: res.prs, name: we ? name(we.snapshot) : '' });
        if (settings.sound) playPR();
        if (settings.vibration) vibrate([40, 60, 40, 60, 120]);
      }
    },
    [exercises, name, settings.sound, settings.vibration, toast],
  );

  const onCompleteFromTimer = useCallback(
    async (s: WorkoutSet) => {
      // complete via set-timer card: use same suggestion logic as the card (last workout values)
      const last = await getLastPerformance(s.exerciseId, workout.id);
      const p = last?.sets[s.order];
      await onToggleSet(s, p ? { weight: p.weight, reps: p.reps, holdSec: p.holdSec } : undefined);
    },
    [onToggleSet, workout.id],
  );

  const nextOpen = useMemo(() => {
    if (!exercises || !sets) return null;
    for (const we of exercises) if ((setsByWe.get(we.id) ?? []).some((s) => !s.completed)) return we;
    return null;
  }, [exercises, sets, setsByWe]);

  const scrollTo = (weId: string) => document.getElementById(`we-${weId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const allSets = sets ?? [];
  const done = countCompleted(allSets);
  const open = allSets.filter((s) => !s.completed).length;
  const volume = sumVolume(allSets);

  const finish = async () => {
    try {
      const r = await finishWorkout(workout.id);
      setFinishOpen(false);
      toast('Workout gespeichert 💪', 'success');
      nav(`/history/${r.workoutId}?summary=1`, { replace: true });
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const discard = async () => {
    setMenu(false);
    if (await confirm({ title: 'Workout verwerfen?', text: 'Alle Sätze dieses Workouts werden gelöscht. Das kann nicht rückgängig gemacht werden.', confirmLabel: 'Verwerfen', danger: true, skippable: false })) {
      await discardWorkout(workout.id);
      toast('Workout verworfen', 'info');
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl">
      {/* Sticky header with workout clock */}
      <div className="sticky top-0 z-30 border-b border-line/60 bg-bg/85 px-4 pb-3 backdrop-blur-xl sm:px-6" style={{ paddingTop: 'calc(var(--safe-top) + 10px)' }}>
        <div className="flex items-center gap-2">
          <button onClick={() => setRenaming(true)} className="min-w-0 flex-1 text-left" aria-label="Workout umbenennen">
            <div className="flex items-center gap-1.5 truncate text-[14px] font-bold">
              <span className="truncate">{workout.name}</span>
              <PencilLine size={13} className="shrink-0 text-subtle" />
            </div>
            <div className="text-[11.5px] text-muted">Gestartet {fmtTime(workout.startedAt)}</div>
          </button>
          <IconButton label="Workout-Optionen" onClick={() => setMenu(true)}>
            <MoreHorizontal size={20} />
          </IconButton>
          <Button variant="primary" size="sm" className="h-10 px-4" onClick={() => setFinishOpen(true)} icon={<Flag size={15} />}>
            Beenden
          </Button>
        </div>
        <div className="mt-2 flex items-center gap-3">
          <div
            className={clsx('num text-[34px] font-bold leading-none tracking-tight', workout.pausedAt ? 'text-warn' : 'text-fg')}
            role="timer"
            aria-label="Gesamtdauer"
            data-testid="workout-clock"
          >
            <WorkoutClock workout={workout} />
          </div>
          <button
            onClick={() => (workout.pausedAt ? resumeWorkout(workout.id) : pauseWorkout(workout.id))}
            className={clsx(
              'flex h-10 items-center gap-1.5 rounded-full px-3.5 text-[12.5px] font-bold transition active:scale-95',
              workout.pausedAt ? 'bg-warn text-black' : 'bg-elevated text-fg',
            )}
            aria-label={workout.pausedAt ? 'Workout fortsetzen' : 'Workout pausieren'}
          >
            {workout.pausedAt ? <Play size={15} fill="currentColor" /> : <Pause size={15} fill="currentColor" />}
            {workout.pausedAt ? 'Weiter' : 'Pause'}
          </button>
          <div className="ml-auto hidden text-right text-[11.5px] text-muted sm:block">
            <div className="num font-semibold text-fg">{done} Sätze</div>
            <div className="num">{fmtVolume(volume, settings.unit)}</div>
          </div>
        </div>
        {!!exercises?.length && (
          <div className="scroll-x -mx-4 mt-3 px-4 sm:-mx-6 sm:px-6">
            {exercises.map((we) => {
              const ss = setsByWe.get(we.id) ?? [];
              const d = ss.filter((s) => s.completed).length;
              const complete = ss.length > 0 && d === ss.length;
              return (
                <button
                  key={we.id}
                  onClick={() => scrollTo(we.id)}
                  className={clsx(
                    'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11.5px] font-semibold transition',
                    complete ? 'border-good/40 bg-good/10 text-good' : nextOpen?.id === we.id ? 'border-accent bg-accent/10 text-fg' : 'border-line text-muted',
                  )}
                >
                  <span className="max-w-[9rem] truncate">{name(we.snapshot)}</span>
                  <span className="num opacity-70">
                    {d}/{ss.length}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="px-4 pt-4 sm:px-6" style={{ paddingBottom: 'calc(var(--nav-h) + var(--safe-bottom) + 40px)' }}>
        {workout.pausedAt && (
          <div className="mb-3 flex items-center gap-3 rounded-2xl border border-warn/30 bg-warn/10 px-4 py-3 text-[13px] font-medium">
            <Pause size={18} className="text-warn" />
            <span className="flex-1">Workout pausiert – alle Timer stehen.</span>
            <Button size="sm" onClick={() => resumeWorkout(workout.id)}>
              Fortsetzen
            </Button>
          </div>
        )}

        <TimerPanel workout={workout} exercises={exercises ?? []} sets={allSets} onCompleteSet={onCompleteFromTimer} />
        {FEATURES.social && <DuelBanner />}

        {nextOpen && (exercises?.length ?? 0) > 1 && (
          <button
            onClick={() => scrollTo(nextOpen.id)}
            className="mt-2.5 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[12.5px] font-semibold text-muted hover:bg-elevated"
          >
            <ArrowRightCircle size={16} className="text-fg dark:text-accent" />
            Nächste Übung: <span className="truncate text-fg">{name(nextOpen.snapshot)}</span>
          </button>
        )}

        <div className="mt-2.5 space-y-2.5">
          {exercises?.map((we, i) => (
            <ExerciseCard
              key={we.id}
              workout={workout}
              we={we}
              sets={setsByWe.get(we.id) ?? []}
              index={i}
              count={exercises.length}
              onToggleSet={onToggleSet}
              invalidSetId={invalid}
            />
          ))}
        </div>

        {exercises && exercises.length === 0 && (
          <div className="mt-6 rounded-3xl border border-dashed border-line px-6 py-10 text-center">
            <Dumbbell className="mx-auto text-subtle" size={32} />
            <p className="mt-3 font-semibold">Noch keine Übungen</p>
            <p className="mt-1 text-[13px] text-muted">Füge die erste Übung hinzu, um Sätze zu erfassen.</p>
          </div>
        )}

        <Button variant="secondary" size="xl" block className="mt-4 border border-dashed border-line" onClick={() => setPicker(true)} icon={<Plus size={20} />}>
          Übung hinzufügen
        </Button>

        <div className="mt-5">
          <AutoNote
            value={workout.note}
            onSave={(t) => setWorkoutNote(workout.id, t)}
            placeholder="Wie lief das Training? Notizen zum heutigen Workout …"
            icon={<NotebookPen size={14} />}
            label="Workout-Notiz"
            tone="plain"
          />
        </div>

        <div className="mt-6 grid grid-cols-2 gap-2">
          <Button variant="danger" size="lg" onClick={discard} icon={<Trash2 size={17} />}>
            Verwerfen
          </Button>
          <Button variant="primary" size="lg" onClick={() => setFinishOpen(true)} icon={<Flag size={17} />}>
            Beenden
          </Button>
        </div>
      </div>

      <ExercisePicker
        open={picker}
        onClose={() => setPicker(false)}
        onPick={async (ids) => {
          let last = '';
          for (const id of ids) last = await addExerciseToWorkout(workout.id, id);
          setTimeout(() => last && scrollTo(last), 150);
        }}
      />

      <Sheet
        open={finishOpen}
        onClose={() => setFinishOpen(false)}
        title="Workout beenden?"
        footer={
          <div className="flex gap-2">
            <Button block size="lg" onClick={() => setFinishOpen(false)}>
              Weiter trainieren
            </Button>
            <Button block size="lg" variant="primary" onClick={finish} disabled={done === 0}>
              Speichern
            </Button>
          </div>
        }
      >
        <div className="grid grid-cols-3 gap-2">
          <MiniStat label="Dauer" value={<WorkoutClock workout={workout} />} />
          <MiniStat label="Sätze" value={String(done)} />
          <MiniStat label="Volumen" value={fmtVolume(volume, settings.unit, true)} />
        </div>
        {done === 0 && <p className="mt-4 text-[13px] font-medium text-warn">Schließe mindestens einen Satz ab, um das Workout zu speichern – oder verwirf es.</p>}
        {done > 0 && open > 0 && (
          <p className="mt-4 text-[13px] text-muted">
            <span className="font-semibold text-warn">{open} offene Sätze</span> werden nicht gespeichert.
          </p>
        )}
      </Sheet>

      <Sheet open={menu} onClose={() => setMenu(false)} title="Workout">
        <MenuList>
          <MenuItem icon={<PencilLine size={18} />} onClick={() => (setMenu(false), setRenaming(true))}>
            Umbenennen
          </MenuItem>
          <MenuItem icon={workout.pausedAt ? <Play size={18} /> : <Pause size={18} />} onClick={() => (setMenu(false), workout.pausedAt ? resumeWorkout(workout.id) : pauseWorkout(workout.id))}>
            {workout.pausedAt ? 'Fortsetzen' : 'Pausieren'}
          </MenuItem>
          <MenuItem icon={<Trash2 size={18} />} danger onClick={discard}>
            Workout verwerfen
          </MenuItem>
        </MenuList>
      </Sheet>

      <RenameSheet open={renaming} onClose={() => setRenaming(false)} value={workout.name} onSave={(v) => renameWorkout(workout.id, v)} />

      {celebration && <PRCelebration prs={celebration.prs} exerciseName={celebration.name} unit={settings.unit} onClose={() => setCelebration(null)} />}
    </div>
  );
}

/**
 * The ticking workout clock lives in its own component so only this text re-renders
 * every 250 ms – not the whole workout screen (inputs, open menus, exercise picker).
 */
export function WorkoutClock({ workout }: { workout: Workout }) {
  const now = useNow(!workout.pausedAt, 250);
  return <>{formatHMS(clockElapsedMs(workout, now))}</>;
}

function MiniStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-elevated p-3 text-center">
      <div className="num text-[16.5px] font-bold">{value}</div>
      <div className="text-[11.5px] text-muted">{label}</div>
    </div>
  );
}

export function RenameSheet({ open, onClose, value, onSave, title = 'Umbenennen' }: { open: boolean; onClose: () => void; value: string; onSave: (v: string) => Promise<void>; title?: string }) {
  const [v, setV] = useState(value);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (open) {
      setV(value);
      setErr('');
    }
  }, [open, value]);
  const save = async () => {
    try {
      await onSave(v);
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <Button variant="primary" size="lg" block onClick={save}>
          Speichern
        </Button>
      }
    >
      <input className="field" value={v} maxLength={60} autoFocus onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} aria-label="Name" />
      {err && <p className="mt-2 text-[13px] text-bad">{err}</p>}
    </Sheet>
  );
}
