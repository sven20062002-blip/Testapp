import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom';
import { CalendarClock, Clock, Copy, Flame, MoreHorizontal, NotebookPen, PencilLine, Play, Repeat, Save, StickyNote, Trash2, Trophy, Weight, X } from 'lucide-react';
import clsx from 'clsx';
import { db } from '@/db/db';
import type { WorkoutSet, WorkoutExercise } from '@/db/types';
import { deleteWorkout, getLastPerformance, renameWorkout, setWorkoutNote, startWorkout } from '@/db/repo/workouts';
import { planFromWorkout } from '@/db/repo/plans';
import { useActiveWorkout, useExerciseName, useSettings } from '@/hooks/useData';
import { fmtDate, fmtTime, formatClock, formatDuration } from '@/lib/time';
import { compareSet, setVolume, sumVolume } from '@/lib/metrics';
import { fmtVolume, fmtWeight, fmtNumber } from '@/lib/units';
import { RECORD_LABELS } from '@/lib/labels';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button, IconButton } from '@/components/ui/Button';
import { Stat } from '@/components/ui/Stat';
import { Sheet } from '@/components/ui/Sheet';
import { useFeedback } from '@/components/ui/Feedback';
import { MuscleIcon } from '@/components/exercises/MuscleIcon';
import { AutoNote, MenuItem, MenuList } from '@/components/workout/ExerciseCard';
import { describePR } from '@/components/workout/PRCelebration';
import { prevLabel } from '@/components/workout/SetRow';
import { RenameSheet } from './WorkoutPage';

export default function WorkoutDetail() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const settings = useSettings();
  const name = useExerciseName();
  const active = useActiveWorkout();
  const { confirm, toast } = useFeedback();
  const workout = useLiveQuery(() => db.workouts.get(id).then((w) => w ?? null), [id]);
  const wes = useLiveQuery(() => db.workoutExercises.where('workoutId').equals(id).sortBy('order'), [id]);
  const sets = useLiveQuery(() => db.sets.where('workoutId').equals(id).toArray(), [id]);
  const records = useLiveQuery(() => db.records.where('workoutId').equals(id).toArray(), [id]);
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);
  const summary = params.get('summary') === '1';

  const prs = useMemo(() => (records ?? []).filter((r) => r.prevValue != null), [records]);

  if (workout === undefined || !wes || !sets) return <div className="page" />;
  if (workout === null || workout.status !== 'completed')
    return (
      <div className="page">
        <PageHeader title="Workout nicht gefunden" back="/history" />
      </div>
    );

  const reps = sets.reduce((a, s) => a + (s.reps ?? 0), 0);

  const repeat = async () => {
    if (active) {
      toast('Es läuft bereits ein Workout', 'warn');
      nav('/workout');
      return;
    }
    await startWorkout({ templateWorkoutId: workout.id });
    nav('/workout');
  };

  const remove = async () => {
    setMenu(false);
    if (await confirm({ title: 'Workout löschen?', text: 'Das Workout wird dauerhaft aus dem Verlauf gelöscht. Bestleistungen werden neu berechnet.', confirmLabel: 'Löschen', danger: true })) {
      await deleteWorkout(workout.id);
      toast('Workout gelöscht', 'info');
      nav('/history', { replace: true });
    }
  };

  return (
    <div className="page">
      <PageHeader
        back="/history"
        title={workout.name}
        subtitle={`${fmtDate(workout.startedAt)} · ${fmtTime(workout.startedAt)}–${fmtTime(workout.endedAt ?? workout.startedAt)}`}
        actions={
          <IconButton label="Optionen" variant="secondary" onClick={() => setMenu(true)}>
            <MoreHorizontal size={20} />
          </IconButton>
        }
      />

      {summary && (
        <div className="relative mb-4 overflow-hidden rounded-3xl bg-accent p-5 text-accent-fg animate-pop">
          <button aria-label="Schließen" onClick={() => setParams({}, { replace: true })} className="absolute right-3 top-3 rounded-full p-1.5 hover:bg-black/10">
            <X size={18} />
          </button>
          <div className="text-[11.5px] font-bold uppercase tracking-[0.14em] opacity-70">Workout abgeschlossen</div>
          <div className="mt-1 text-[21px] font-bold tracking-tight">Starke Leistung! 💪</div>
          <div className="mt-1 text-[13px] font-medium opacity-80">
            {prs.length > 0 ? `${prs.length} neue ${prs.length === 1 ? 'Bestleistung' : 'Bestleistungen'} in diesem Training.` : 'Dein Training ist gespeichert.'}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Stat icon={<Clock size={14} />} label="Dauer" value={formatClock(workout.durationSec * 1000)} sub={formatDuration(workout.durationSec)} />
        <Stat icon={<Flame size={14} />} label="Sätze" value={workout.totalSets} sub={`${fmtNumber(reps)} Wdh`} />
        <Stat icon={<Weight size={14} />} label="Volumen" value={fmtVolume(workout.totalVolume, settings.unit, true)} />
        <Stat icon={<Trophy size={14} />} label="Rekorde" value={prs.length} sub={<span className="flex items-center gap-1"><CalendarClock size={11} /> {fmtTime(workout.startedAt)} Uhr</span>} />
      </div>

      {prs.length > 0 && (
        <div className="card mt-3 p-3.5">
          <div className="label mb-2">Neue Bestleistungen</div>
          <ul className="space-y-2">
            {prs.map((r) => {
              const we = wes.find((w) => w.exerciseId === r.exerciseId);
              return (
                <li key={r.id} className="flex items-center gap-3">
                  <Trophy size={16} className="shrink-0 text-fg dark:text-accent" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold">{r.type === 'workoutVolume' ? 'Gesamtes Workout' : name(we?.snapshot)}</div>
                    <div className="text-[11.5px] text-muted">{RECORD_LABELS[r.type]}</div>
                  </div>
                  <div className="num text-right text-[12.5px]">
                    <span className="text-subtle">{describePR({ type: r.type, value: r.prevValue!, weight: r.prevWeight, reps: r.prevReps }, settings.unit)}</span>
                    <span className="mx-1 text-subtle">→</span>
                    <span className="font-bold">{describePR(r, settings.unit)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <AutoNote
        value={workout.note}
        onSave={(t) => setWorkoutNote(workout.id, t)}
        placeholder="Notiz zu diesem Workout …"
        icon={<NotebookPen size={14} />}
        label="Workout-Notiz"
        tone="plain"
      />

      <div className="mt-5 space-y-3">
        {wes.map((we) => (
          <ExerciseResult key={we.id} we={we} sets={sets.filter((s) => s.workoutExerciseId === we.id).sort((a, b) => a.order - b.order)} startedAt={workout.startedAt} workoutId={workout.id} />
        ))}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-2">
        <Button size="lg" onClick={() => setSavingPlan(true)} icon={<Save size={17} />}>
          Als Plan
        </Button>
        <Button variant="primary" size="lg" onClick={repeat} icon={<Repeat size={17} />}>
          Wiederholen
        </Button>
      </div>

      <Sheet open={menu} onClose={() => setMenu(false)} title="Workout">
        <MenuList>
          <MenuItem icon={<Play size={18} />} onClick={() => (setMenu(false), repeat())}>
            Als Vorlage für neues Workout
          </MenuItem>
          <MenuItem icon={<Copy size={18} />} onClick={() => (setMenu(false), setSavingPlan(true))}>
            Als Trainingsplan speichern
          </MenuItem>
          <MenuItem icon={<PencilLine size={18} />} onClick={() => (setMenu(false), setRenaming(true))}>
            Umbenennen
          </MenuItem>
          <MenuItem icon={<Trash2 size={18} />} danger onClick={remove}>
            Workout löschen
          </MenuItem>
        </MenuList>
      </Sheet>
      <RenameSheet open={renaming} onClose={() => setRenaming(false)} value={workout.name} onSave={(v) => renameWorkout(workout.id, v)} />
      <RenameSheet
        open={savingPlan}
        onClose={() => setSavingPlan(false)}
        value={workout.name}
        title="Als Trainingsplan speichern"
        onSave={async (v) => {
          const pid = await planFromWorkout(workout.id, v);
          toast('Trainingsplan erstellt', 'success');
          nav(`/plans/${pid}`);
        }}
      />
    </div>
  );
}

function ExerciseResult({ we, sets, startedAt, workoutId }: { we: WorkoutExercise; sets: WorkoutSet[]; startedAt: number; workoutId: string }) {
  const settings = useSettings();
  const name = useExerciseName();
  const prev = useLiveQuery(() => getLastPerformance(we.exerciseId, workoutId, startedAt), [we.exerciseId, workoutId, startedAt]);
  const tracking = we.snapshot.trackingType;
  const vol = sumVolume(sets);
  const prevVol = prev ? sumVolume(prev.sets) : null;
  const diff = prevVol != null && vol > 0 ? vol - prevVol : null;

  return (
    <section className="card p-3.5">
      <Link to={`/exercises/${we.exerciseId}`} className="flex items-center gap-3">
        <MuscleIcon muscle={we.snapshot.muscleGroup} size={38} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-bold">{name(we.snapshot)}</h3>
          <div className="num text-[11.5px] text-muted">
            {sets.length} Sätze
            {vol > 0 && ` · ${fmtVolume(vol, settings.unit)}`}
            {diff != null && diff !== 0 && (
              <span className={clsx('ml-1 font-semibold', diff > 0 ? 'text-good' : 'text-subtle')}>
                ({diff > 0 ? '+' : '−'}
                {fmtVolume(Math.abs(diff), settings.unit)} vs. letztes Mal)
              </span>
            )}
          </div>
        </div>
      </Link>
      {we.note && (
        <div className="mt-2.5 flex gap-2 rounded-xl bg-elevated/70 px-3 py-2 text-[12.5px]">
          <StickyNote size={14} className="mt-0.5 shrink-0 text-subtle" /> {we.note}
        </div>
      )}
      <table className="num mt-3 w-full text-[13px]">
        <thead>
          <tr className="text-[10px] font-bold uppercase tracking-wider text-subtle">
            <th className="w-10 pb-1.5 text-left">Satz</th>
            <th className="pb-1.5 text-left">Leistung</th>
            <th className="pb-1.5 text-left">Vorher</th>
            <th className="pb-1.5 text-right">{tracking === 'duration' ? '' : 'Volumen'}</th>
            <th className="w-14 pb-1.5 text-right">Zeit</th>
          </tr>
        </thead>
        <tbody>
          {sets.map((s, i) => {
            const p = prev?.sets[i];
            const c = compareSet(s, p);
            const up = tracking === 'duration' ? c.hold === 'up' : c.weight === 'up' || (c.weight !== 'down' && c.reps === 'up');
            return (
              <tr key={s.id} className="border-t border-line/50">
                <td className={clsx('py-2 font-bold', s.kind === 'warmup' && 'text-warn')}>{s.kind === 'warmup' ? 'W' : i + 1}</td>
                <td className="py-2 font-semibold">
                  {prevLabel(s, tracking, settings.unit)}
                  {up && <span className="ml-1.5 text-[10.5px] font-bold text-good">▲</span>}
                </td>
                <td className="py-2 text-[12.5px] text-subtle">{p ? prevLabel(p, tracking, settings.unit) : '–'}</td>
                <td className="py-2 text-right text-muted">{setVolume(s) > 0 ? fmtWeight(setVolume(s), settings.unit) : ''}</td>
                <td className="py-2 text-right text-subtle">{s.durationSec != null ? formatClock(s.durationSec * 1000) : '–'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
