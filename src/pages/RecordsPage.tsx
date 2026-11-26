import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { ChevronRight, Trophy, Search } from 'lucide-react';
import { db } from '@/db/db';
import { currentBests } from '@/db/repo/records';
import { WORKOUT_RECORD_KEY, type RecordType } from '@/db/types';
import { useExerciseMap, useExerciseName, useSettings } from '@/hooks/useData';
import { recordTypesFor } from '@/lib/metrics';
import { RECORD_LABELS } from '@/lib/labels';
import { relativeDay, fmtDate } from '@/lib/time';
import { fmtVolume } from '@/lib/units';
import { PageHeader, SectionTitle } from '@/components/ui/PageHeader';
import { Empty } from '@/components/ui/Empty';
import { MuscleIcon } from '@/components/exercises/MuscleIcon';
import { describePR } from '@/components/workout/PRCelebration';
import { matchesSearch } from '@/db/repo/exercises';

const SHORT: Record<RecordType, string> = {
  weight: 'Gewicht',
  e1rm: '1RM ≈',
  reps: 'Wdh',
  volume: 'Volumen',
  duration: 'Zeit',
  workoutVolume: 'Workout',
};

export default function RecordsPage() {
  const settings = useSettings();
  const exMap = useExerciseMap();
  const name = useExerciseName();
  const records = useLiveQuery(() => db.records.toArray(), []);
  const [q, setQ] = useState('');

  const { byExercise, workoutBest, recent } = useMemo(() => {
    const bests = currentBests(records ?? []);
    const byExercise = new Map<string, Map<RecordType, (typeof records & {})[number]>>();
    for (const r of bests.values()) {
      if (r.exerciseId === WORKOUT_RECORD_KEY) continue;
      const m = byExercise.get(r.exerciseId) ?? new Map();
      m.set(r.type, r);
      byExercise.set(r.exerciseId, m);
    }
    const recent = [...(records ?? [])].filter((r) => r.prevValue != null).sort((a, b) => b.achievedAt - a.achievedAt).slice(0, 8);
    return { byExercise, workoutBest: bests.get(`${WORKOUT_RECORD_KEY}:workoutVolume`), recent };
  }, [records]);

  const rows = [...byExercise.entries()]
    .filter(([id]) => {
      const e = exMap.get(id);
      return e && matchesSearch(e, q);
    })
    .sort((a, b) => name(exMap.get(a[0])).localeCompare(name(exMap.get(b[0])), 'de'));

  return (
    <div className="page">
      <PageHeader back title="Bestleistungen" subtitle="Automatisch erkannt aus deinem Verlauf" />
      {records && records.length === 0 && <Empty icon={<Trophy size={28} />} title="Noch keine Rekorde" text="Sobald du Workouts abschließt, erscheinen hier deine Bestleistungen." />}

      {workoutBest && (
        <Link to={`/history/${workoutBest.workoutId}`} className="relative block overflow-hidden rounded-3xl bg-accent p-5 text-accent-fg">
          <div className="text-[11.5px] font-bold uppercase tracking-[0.14em] opacity-70">Höchstes Workout-Volumen</div>
          <div className="num mt-1 text-[28px] font-bold leading-none">{fmtVolume(workoutBest.value, settings.unit)}</div>
          <div className="mt-1.5 text-[13px] font-medium opacity-75">{fmtDate(workoutBest.achievedAt)}</div>
          <Trophy className="absolute -bottom-3 -right-3 opacity-15" size={110} />
        </Link>
      )}

      {recent.length > 0 && (
        <>
          <SectionTitle>Zuletzt verbessert</SectionTitle>
          <ul className="card divide-y divide-line/60">
            {recent.map((r) => (
              <li key={r.id}>
                <Link to={r.exerciseId === WORKOUT_RECORD_KEY ? `/history/${r.workoutId}` : `/exercises/${r.exerciseId}`} className="flex items-center gap-3 px-4 py-3 hover:bg-elevated/40">
                  <Trophy size={16} className="shrink-0 text-fg dark:text-accent" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold">{r.exerciseId === WORKOUT_RECORD_KEY ? 'Gesamtes Workout' : name(exMap.get(r.exerciseId))}</div>
                    <div className="text-[11.5px] text-muted">
                      {RECORD_LABELS[r.type]} · {relativeDay(r.achievedAt)}
                    </div>
                  </div>
                  <div className="num text-right text-[12.5px]">
                    <span className="text-subtle">{describePR({ type: r.type, value: r.prevValue!, weight: r.prevWeight, reps: r.prevReps }, settings.unit)}</span>
                    <span className="mx-1 text-subtle">→</span>
                    <span className="font-bold">{describePR(r, settings.unit)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      {byExercise.size > 0 && (
        <>
          <SectionTitle>Nach Übung</SectionTitle>
          <div className="relative mb-3">
            <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-subtle" />
            <input className="field bg-surface pl-10" placeholder="Übung suchen …" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rekorde durchsuchen" />
          </div>
          <div className="space-y-2">
            {rows.map(([id, m]) => {
              const ex = exMap.get(id)!;
              return (
                <Link key={id} to={`/exercises/${id}`} className="card block p-3.5 hover:border-line">
                  <div className="flex items-center gap-3">
                    <MuscleIcon muscle={ex.muscleGroup} size={36} />
                    <span className="flex-1 truncate font-bold">{name(ex)}</span>
                    <ChevronRight size={18} className="text-subtle" />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {recordTypesFor(ex.trackingType).map((t) => {
                      const r = m.get(t);
                      return (
                        <div key={t} className="rounded-xl bg-elevated/70 px-3 py-2">
                          <div className="text-[10.5px] font-semibold text-muted">{SHORT[t]}</div>
                          <div className="num text-[13px] font-bold">{r ? describePR(r, settings.unit) : '–'}</div>
                        </div>
                      );
                    })}
                  </div>
                </Link>
              );
            })}
          </div>
          <p className="mt-4 text-[11.5px] leading-relaxed text-subtle">
            Gewichts-, Wiederholungs- und Zeitrekorde sind tatsächlich erbrachte Leistungen. Das 1RM ist ein Schätzwert (Epley, 1–12 Wdh). Wiederholungsrekorde zählen nur gegenüber Sätzen mit gleichem oder höherem Gewicht; Aufwärmsätze werden ignoriert.
          </p>
        </>
      )}
    </div>
  );
}
