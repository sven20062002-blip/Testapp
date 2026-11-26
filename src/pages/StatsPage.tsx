import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { BarChart3, ChevronRight, Clock, Dumbbell, Flame, Repeat2, Trophy, Weight } from 'lucide-react';
import { db } from '@/db/db';
import { useExerciseMap, useExerciseName, useSettings } from '@/hooks/useData';
import { buckets, exerciseProgress, muscleDistribution, RANGES, rangeStart, totals, type RangeKey } from '@/lib/stats';
import { formatDuration, formatClock } from '@/lib/time';
import { fmtNumber, fmtVolume, kgToUnit } from '@/lib/units';
import { MUSCLE_LABELS } from '@/lib/labels';
import { PageHeader, SectionTitle } from '@/components/ui/PageHeader';
import { Segmented } from '@/components/ui/Segmented';
import { Stat } from '@/components/ui/Stat';
import { Empty } from '@/components/ui/Empty';
import { AreaTrend, BarTrend, LineTrend, RankBars } from '@/components/charts/Charts';

export default function StatsPage() {
  const settings = useSettings();
  const exMap = useExerciseMap();
  const name = useExerciseName();
  const [range, setRange] = useState<RangeKey>('3m');
  const [volGran, setVolGran] = useState<'auto' | 'week' | 'month'>('auto');
  const [muscleBy, setMuscleBy] = useState<'sets' | 'volume'>('sets');
  const [exId, setExId] = useState<string>('');
  const [exMetric, setExMetric] = useState<'e1rm' | 'topWeight' | 'volume'>('e1rm');

  const workouts = useLiveQuery(() => db.workouts.where('status').equals('completed').toArray(), []);
  const sets = useLiveQuery(() => db.sets.where('completedAt').above(0).toArray(), []);
  const wes = useLiveQuery(() => db.workoutExercises.toArray(), []);

  const now = Date.now();
  const first = useMemo(() => (workouts?.length ? Math.min(...workouts.map((w) => w.startedAt)) : undefined), [workouts]);
  const from = rangeStart(range, now, first);

  const data = useMemo(() => {
    if (!workouts || !sets || !wes) return null;
    const inRange = workouts.filter((w) => w.startedAt >= from);
    const ids = new Set(inRange.map((w) => w.id));
    const t = totals(inRange, sets);
    const b = buckets(inRange, sets, from, now);
    const vb = volGran === 'auto' ? b : buckets(inRange, sets, from, now, volGran);
    const muscles = muscleDistribution(wes, sets, ids);
    // exercises trained in range, by frequency
    const freq = new Map<string, number>();
    for (const we of wes) if (ids.has(we.workoutId)) freq.set(we.exerciseId, (freq.get(we.exerciseId) ?? 0) + 1);
    const trained = [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
    return { inRange, t, b, vb, muscles, trained, ids };
  }, [workouts, sets, wes, from, now, volGran]);

  const selectedEx = exId || data?.trained.find((id) => (exMap.get(id)?.trackingType ?? 'weight_reps') === 'weight_reps') || data?.trained[0] || '';
  const selTracking = exMap.get(selectedEx)?.trackingType ?? wes?.find((w) => w.exerciseId === selectedEx)?.snapshot.trackingType ?? 'weight_reps';
  const progress = useMemo(
    () => (data && selectedEx && sets ? exerciseProgress(selectedEx, data.inRange, sets) : []),
    [data, selectedEx, sets],
  );

  if (!data) return <div className="page" />;
  const unit = settings.unit;
  const granLabel = { day: 'pro Tag', week: 'pro Woche', month: 'pro Monat' } as const;

  const metric = selTracking === 'duration' ? 'maxHold' : selTracking === 'bodyweight_reps' ? 'maxReps' : exMetric;
  const exChart = progress.map((p) => {
    const v = p[metric as keyof typeof p] as number | null;
    return { label: p.label, value: v == null ? null : metric === 'maxHold' || metric === 'maxReps' ? v : Math.round(kgToUnit(v, unit) * 10) / 10 };
  });
  const exFmt = (v: number) => (metric === 'maxHold' ? formatClock(v * 1000) : metric === 'maxReps' ? `${v} Wdh` : `${fmtNumber(v, 1)} ${unit}`);

  return (
    <div className="page">
      <PageHeader title="Statistik" subtitle="Dein Training in Zahlen" />
      <Segmented value={range} onChange={setRange} options={RANGES.map((r) => ({ value: r.key, label: r.label }))} label="Zeitraum" />

      {data.inRange.length === 0 ? (
        <Empty icon={<BarChart3 size={28} />} title="Keine Daten im Zeitraum" text="Absolviere Workouts oder wähle einen längeren Zeitraum." />
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            <Stat icon={<Dumbbell size={14} />} label="Workouts" value={data.t.workouts} sub={`Ø ${formatDuration(data.t.durationSec / Math.max(1, data.t.workouts))}`} />
            <Stat icon={<Clock size={14} />} label="Trainingszeit" value={formatDuration(data.t.durationSec)} />
            <Stat icon={<Weight size={14} />} label="Volumen" value={fmtVolume(data.t.volume, unit, true)} sub="nur Sätze mit Gewicht" />
            <Stat icon={<Flame size={14} />} label="Sätze" value={fmtNumber(data.t.sets)} />
            <Stat icon={<Repeat2 size={14} />} label="Wiederholungen" value={fmtNumber(data.t.reps)} />
            <Stat icon={<Clock size={14} />} label="Haltezeit" value={formatDuration(data.t.holdSec)} sub="z. B. Plank" />
          </div>

          <SectionTitle>Trainingshäufigkeit</SectionTitle>
          <div className="card p-4">
            <div className="mb-3 text-[13px] text-muted">Workouts {granLabel[data.b.granularity]}</div>
            <BarTrend data={data.b.data.map((b) => ({ label: b.label, value: b.workouts }))} fmt={(v) => `${v} Workout${v === 1 ? '' : 's'}`} />
          </div>

          <SectionTitle
            action={
              <Segmented
                size="sm"
                value={volGran}
                onChange={setVolGran}
                options={[
                  { value: 'auto', label: 'Auto' },
                  { value: 'week', label: 'Woche' },
                  { value: 'month', label: 'Monat' },
                ]}
                label="Zeiteinheit"
              />
            }
          >
            Trainingsvolumen
          </SectionTitle>
          <div className="card p-4">
            <div className="mb-3 text-[13px] text-muted">
              Volumen {granLabel[data.vb.granularity]} ({unit})
            </div>
            <AreaTrend
              data={data.vb.data.map((b) => ({ label: b.label, value: Math.round(kgToUnit(b.volume, unit)) }))}
              fmt={(v) => `${fmtNumber(v)} ${unit}`}
              yFmt={(v) => (v >= 10000 ? `${Math.round(v / 1000)}k` : String(v))}
            />
            <VolumeTrendNote data={data.vb.data.map((b) => b.volume)} />
          </div>

          <SectionTitle>Trainingszeit</SectionTitle>
          <div className="card p-4">
            <div className="mb-3 text-[13px] text-muted">Minuten {granLabel[data.b.granularity]}</div>
            <BarTrend data={data.b.data.map((b) => ({ label: b.label, value: b.minutes }))} fmt={(v) => `${v} Min`} />
          </div>

          <SectionTitle
            action={
              <Segmented
                size="sm"
                value={muscleBy}
                onChange={setMuscleBy}
                options={[
                  { value: 'sets', label: 'Sätze' },
                  { value: 'volume', label: 'Volumen' },
                ]}
                label="Muskelgruppen nach"
              />
            }
          >
            Muskelgruppen
          </SectionTitle>
          <div className="card p-4">
            <RankBars
              items={[...data.muscles]
                .sort((a, b) => (muscleBy === 'sets' ? b.sets - a.sets : b.volume - a.volume))
                .filter((m) => (muscleBy === 'sets' ? m.sets : m.volume) > 0)
                .map((m) => ({ label: MUSCLE_LABELS[m.muscle], value: muscleBy === 'sets' ? m.sets : Math.round(kgToUnit(m.volume, unit)) }))}
              fmt={(v) => (muscleBy === 'sets' ? `${v} Sätze` : `${fmtNumber(v)} ${unit}`)}
            />
          </div>

          <SectionTitle>Fortschritt pro Übung</SectionTitle>
          <div className="card p-4">
            <select className="field mb-3" value={selectedEx} onChange={(e) => setExId(e.target.value)} aria-label="Übung wählen">
              {data.trained.map((id) => (
                <option key={id} value={id}>
                  {name(exMap.get(id) ?? wes?.find((w) => w.exerciseId === id)?.snapshot)}
                </option>
              ))}
            </select>
            {selTracking === 'weight_reps' && (
              <Segmented
                size="sm"
                className="mb-4"
                value={exMetric}
                onChange={setExMetric}
                options={[
                  { value: 'e1rm', label: '1RM (geschätzt)' },
                  { value: 'topWeight', label: 'Höchstes Gewicht' },
                  { value: 'volume', label: 'Volumen' },
                ]}
                label="Kennzahl"
              />
            )}
            {progress.length >= 2 ? (
              <LineTrend data={exChart} fmt={exFmt} />
            ) : (
              <p className="py-8 text-center text-sm text-muted">Mindestens zwei Einheiten im Zeitraum nötig.</p>
            )}
            {selectedEx && (
              <Link to={`/exercises/${selectedEx}`} className="mt-3 flex items-center justify-end gap-1 text-[13px] font-semibold text-muted hover:text-fg">
                Übungsdetails <ChevronRight size={15} />
              </Link>
            )}
          </div>

          <Link to="/records" className="card mt-7 flex items-center gap-3 p-4 hover:border-line">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft dark:text-accent">
              <Trophy size={20} />
            </div>
            <div className="flex-1">
              <div className="font-bold">Persönliche Bestleistungen</div>
              <div className="text-[13px] text-muted">Alle Rekorde nach Übung</div>
            </div>
            <ChevronRight className="text-subtle" />
          </Link>
        </>
      )}
    </div>
  );
}

/** Simple long-term trend statement: compares the mean of the second half vs the first half. */
function VolumeTrendNote({ data }: { data: number[] }) {
  if (data.length < 4) return null;
  const half = Math.floor(data.length / 2);
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  const a = avg(data.slice(0, half));
  const b = avg(data.slice(half));
  if (a === 0 && b === 0) return null;
  const pct = a === 0 ? 100 : Math.round(((b - a) / a) * 100);
  const txt = pct > 3 ? `Steigend: +${pct} % gegenüber der ersten Hälfte des Zeitraums` : pct < -3 ? `Rückläufig: ${pct} % gegenüber der ersten Hälfte` : 'Stabil gegenüber der ersten Hälfte des Zeitraums';
  return <p className={`mt-2 text-[12px] font-semibold ${pct > 3 ? 'text-good' : 'text-muted'}`}>{txt}</p>;
}
