import { useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Pencil, Pin, RotateCcw, Trash2, Trophy, ChevronRight } from 'lucide-react';
import { db } from '@/db/db';
import { deleteExercise, restoreExercise, saveExerciseNote } from '@/db/repo/exercises';
import { currentBests } from '@/db/repo/records';
import { useExerciseName, useSettings } from '@/hooks/useData';
import { CATEGORY_LABELS, MUSCLE_LABELS, RECORD_LABELS, TRACKING_LABELS } from '@/lib/labels';
import { exerciseProgress } from '@/lib/stats';
import { recordTypesFor, sumVolume } from '@/lib/metrics';
import { fmtDate, formatClock, relativeDay } from '@/lib/time';
import { fmtVolume, fmtWeight, kgToUnit, fmtNumber } from '@/lib/units';
import { PageHeader, SectionTitle } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Segmented';
import { Badge } from '@/components/ui/Chip';
import { useFeedback } from '@/components/ui/Feedback';
import { MuscleIcon } from '@/components/exercises/MuscleIcon';
import { ExerciseForm } from '@/components/exercises/ExerciseForm';
import { AutoNote } from '@/components/workout/ExerciseCard';
import { describePR } from '@/components/workout/PRCelebration';
import { prevLabel } from '@/components/workout/SetRow';
import { LineTrend } from '@/components/charts/Charts';
import type { RecordType, Workout } from '@/db/types';

type Metric = 'e1rm' | 'topWeight' | 'volume' | 'maxReps' | 'maxHold';

export default function ExerciseDetail() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const settings = useSettings();
  const name = useExerciseName();
  const { confirm, toast } = useFeedback();
  const ex = useLiveQuery(() => db.exercises.get(id).then((e) => e ?? null), [id]);
  const note = useLiveQuery(() => db.exerciseNotes.get(id), [id]);
  const records = useLiveQuery(() => db.records.where('exerciseId').equals(id).toArray(), [id]);
  const history = useLiveQuery(async () => {
    const sets = (await db.sets.where('exerciseId').equals(id).toArray()).filter((s) => s.completed);
    const wids = [...new Set(sets.map((s) => s.workoutId))];
    const ws = (await db.workouts.bulkGet(wids)).filter((w): w is Workout => !!w && w.status === 'completed');
    // fallback snapshot for deleted exercises
    const we = await db.workoutExercises.where('exerciseId').equals(id).first();
    return { sets, workouts: ws, snapshot: we?.snapshot };
  }, [id]);
  const [editing, setEditing] = useState(false);
  const tracking = ex?.trackingType ?? history?.snapshot?.trackingType ?? 'weight_reps';
  const [metric, setMetric] = useState<Metric>(tracking === 'duration' ? 'maxHold' : tracking === 'bodyweight_reps' ? 'maxReps' : 'e1rm');

  const points = useMemo(() => (history ? exerciseProgress(id, history.workouts, history.sets) : []), [history, id]);
  const bests = useMemo(() => currentBests(records ?? []), [records]);
  const timeline = useMemo(() => [...(records ?? [])].filter((r) => r.prevValue != null).sort((a, b) => b.achievedAt - a.achievedAt), [records]);
  const sessions = useMemo(() => {
    if (!history) return [];
    return [...history.workouts]
      .sort((a, b) => b.startedAt - a.startedAt)
      .map((w) => ({ w, sets: history.sets.filter((s) => s.workoutId === w.id).sort((a, b) => a.order - b.order) }));
  }, [history]);

  if (ex === undefined || !history) return <div className="page" />;
  const meta = ex ?? history.snapshot;
  if (!meta)
    return (
      <div className="page">
        <PageHeader title="Übung nicht gefunden" back />
      </div>
    );

  const metricOpts: { value: Metric; label: string }[] =
    tracking === 'duration'
      ? [{ value: 'maxHold', label: 'Haltezeit' }]
      : tracking === 'bodyweight_reps'
        ? [
            { value: 'maxReps', label: 'Max Wdh' },
            { value: 'topWeight', label: 'Zusatzgew.' },
          ]
        : [
            { value: 'e1rm', label: '1RM (geschätzt)' },
            { value: 'topWeight', label: 'Gewicht' },
            { value: 'volume', label: 'Volumen' },
          ];
  const isWeight = metric === 'e1rm' || metric === 'topWeight' || metric === 'volume';
  const chartData = points.map((p) => {
    const v = p[metric];
    return { label: p.label, value: v == null ? null : isWeight ? Math.round(kgToUnit(v, settings.unit) * 10) / 10 : v };
  });
  const fmtMetric = (v: number) =>
    metric === 'maxHold' ? formatClock(v * 1000) : metric === 'maxReps' ? `${v} Wdh` : metric === 'volume' ? `${fmtNumber(v)} ${settings.unit}` : `${fmtNumber(v, 1)} ${settings.unit}`;

  const remove = async () => {
    if (!ex) return;
    if (
      await confirm({
        title: `„${name(ex)}“ löschen?`,
        text: 'Die Übung verschwindet aus der Bibliothek und aus Trainingsplänen. Dein Trainingsverlauf mit dieser Übung bleibt vollständig erhalten.',
        confirmLabel: 'Löschen',
        danger: true,
      })
    ) {
      const r = await deleteExercise(ex.id);
      toast(r.removedFromPlans ? `Gelöscht und aus ${r.removedFromPlans} Plan/Plänen entfernt` : 'Übung gelöscht', 'info', {
        label: 'Rückgängig',
        onClick: () => void restoreExercise(ex.id),
      });
      nav('/exercises');
    }
  };

  const types = recordTypesFor(tracking);

  return (
    <div className="page">
      <PageHeader
        back
        title={name(meta)}
        subtitle={meta.nameEn && settings.exerciseLang === 'de' && meta.nameEn !== meta.nameDe ? meta.nameEn : undefined}
        actions={
          ex &&
          !ex.deletedAt && (
            <Button size="sm" onClick={() => setEditing(true)} icon={<Pencil size={15} />}>
              Bearbeiten
            </Button>
          )
        }
      />

      {ex?.deletedAt && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl bg-warn/10 px-4 py-3 text-[13px]">
          <span className="flex-1">Diese Übung wurde gelöscht. Der Verlauf bleibt erhalten.</span>
          <Button size="sm" onClick={() => restoreExercise(ex.id)} icon={<RotateCcw size={14} />}>
            Wiederherstellen
          </Button>
        </div>
      )}

      <div className="card flex gap-4 p-3.5">
        <MuscleIcon muscle={meta.muscleGroup} size={56} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-1.5">
            <Badge tone="accent">{MUSCLE_LABELS[meta.muscleGroup]}</Badge>
            <Badge>{CATEGORY_LABELS[meta.category]}</Badge>
            {ex?.secondaryMuscles.map((m) => <Badge key={m}>{MUSCLE_LABELS[m]}</Badge>)}
          </div>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">{ex?.description || 'Keine Beschreibung.'}</p>
          <p className="mt-2 text-[11.5px] text-subtle">Erfassung: {TRACKING_LABELS[tracking]}</p>
        </div>
      </div>

      {ex && !ex.deletedAt && (
        <AutoNote
          value={note?.text ?? ''}
          onSave={(t) => saveExerciseNote(id, t)}
          placeholder="Dauerhafte Notiz – erscheint bei jedem Training mit dieser Übung …"
          icon={<Pin size={14} />}
          label="Dauerhafte Notiz"
          tone="accent"
        />
      )}

      {/* Records */}
      <SectionTitle>Bestleistungen</SectionTitle>
      <div className="grid grid-cols-2 gap-2.5">
        {types.map((t) => {
          const r = bests.get(`${id}:${t}`);
          return (
            <div key={t} className="card p-3.5">
              <div className="text-[11.5px] font-semibold text-muted">
                {RECORD_LABELS[t]}
              </div>
              <div className="num mt-1 text-[18px] font-bold">{r ? describePR(r, settings.unit) : '–'}</div>
              {r && <div className="text-[11.5px] text-subtle">{relativeDay(r.achievedAt)}</div>}
            </div>
          );
        })}
      </div>

      {/* Chart */}
      <SectionTitle>Entwicklung</SectionTitle>
      <div className="card p-3.5">
        {metricOpts.length > 1 && <Segmented value={metric} onChange={setMetric} options={metricOpts} size="sm" className="mb-4" label="Kennzahl" />}
        {points.length >= 2 ? (
          <LineTrend data={chartData} fmt={fmtMetric} />
        ) : (
          <p className="py-10 text-center text-[13px] text-muted">Nach mindestens zwei Trainings mit dieser Übung siehst du hier deinen Verlauf.</p>
        )}
        {metric === 'e1rm' && points.length >= 2 && (
          <p className="mt-2 text-[10.5px] text-subtle">Geschätztes 1RM nach Epley, nur aus Sätzen mit 1–12 Wiederholungen. Schätzwert – kein tatsächlich gehobenes Gewicht.</p>
        )}
      </div>

      {/* PR timeline */}
      {timeline.length > 0 && (
        <>
          <SectionTitle>Rekord-Historie</SectionTitle>
          <ul className="card divide-y divide-line/60">
            {timeline.slice(0, 12).map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                <Trophy size={16} className="shrink-0 text-fg dark:text-accent" />
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] font-semibold">{RECORD_LABELS[r.type as RecordType]}</div>
                  <div className="text-[11.5px] text-subtle">{fmtDate(r.achievedAt)}</div>
                </div>
                <div className="num text-right text-[12.5px]">
                  <span className="text-subtle">{describePR({ type: r.type, value: r.prevValue!, weight: r.prevWeight, reps: r.prevReps }, settings.unit)}</span>
                  <span className="mx-1.5 text-subtle">→</span>
                  <span className="font-bold">{describePR(r, settings.unit)}</span>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Session history */}
      <SectionTitle>Verlauf ({sessions.length})</SectionTitle>
      {sessions.length === 0 && <p className="text-[13px] text-muted">Noch nicht trainiert.</p>}
      <div className="space-y-2">
        {sessions.slice(0, 30).map(({ w, sets }) => (
          <Link key={w.id} to={`/history/${w.id}`} className="card block p-3.5 hover:border-line">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold">{fmtDate(w.startedAt)}</div>
                <div className="text-[11.5px] text-muted">{w.name}</div>
              </div>
              <ChevronRight size={18} className="text-subtle" />
            </div>
            <div className="num mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12.5px] text-muted">
              {sets.map((s, i) => (
                <span key={s.id}>
                  <span className="text-subtle">{s.kind === 'warmup' ? 'W' : i + 1}:</span> {prevLabel(s, tracking, settings.unit)}
                </span>
              ))}
            </div>
            {tracking !== 'duration' && (
              <div className="num mt-1.5 text-[11.5px] text-subtle">
                Volumen {fmtVolume(sumVolume(sets), settings.unit)}
                {sets.some((s) => s.weight) && ` · Top ${fmtWeight(Math.max(...sets.map((s) => s.weight ?? 0)), settings.unit)}`}
              </div>
            )}
          </Link>
        ))}
      </div>

      {ex && !ex.deletedAt && (
        <Button variant="danger" size="lg" block className="mt-8" onClick={remove} icon={<Trash2 size={17} />}>
          Übung löschen
        </Button>
      )}
      {ex && <ExerciseForm open={editing} onClose={() => setEditing(false)} exercise={ex} />}
    </div>
  );
}
