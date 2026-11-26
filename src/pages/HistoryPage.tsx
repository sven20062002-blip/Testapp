import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { ChevronRight, History, Search, Trophy } from 'lucide-react';
import { db } from '@/db/db';
import { useExerciseName, useSettings } from '@/hooks/useData';
import { formatDuration, fmtTime } from '@/lib/time';
import { fmtVolume } from '@/lib/units';
import { PageHeader } from '@/components/ui/PageHeader';
import { Empty } from '@/components/ui/Empty';

const monthFmt = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' });
const dayFmt = new Intl.DateTimeFormat('de-DE', { weekday: 'short' });

export default function HistoryPage() {
  const settings = useSettings();
  const name = useExerciseName();
  const [q, setQ] = useState('');
  const workouts = useLiveQuery(() => db.workouts.where('status').equals('completed').reverse().sortBy('startedAt'), []);
  const wes = useLiveQuery(() => db.workoutExercises.toArray(), []);

  const exByWorkout = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const we of [...(wes ?? [])].sort((a, b) => a.order - b.order)) m.set(we.workoutId, [...(m.get(we.workoutId) ?? []), name(we.snapshot)]);
    return m;
  }, [wes, name]);

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = (workouts ?? []).filter(
      (w) => !needle || w.name.toLowerCase().includes(needle) || (exByWorkout.get(w.id) ?? []).some((n) => n.toLowerCase().includes(needle)),
    );
    const g = new Map<string, typeof filtered>();
    for (const w of filtered) {
      const k = monthFmt.format(w.startedAt);
      g.set(k, [...(g.get(k) ?? []), w]);
    }
    return [...g.entries()];
  }, [workouts, q, exByWorkout]);

  return (
    <div className="page">
      <PageHeader title="Verlauf" subtitle={workouts ? `${workouts.length} abgeschlossene Workouts` : undefined} />
      {workouts && workouts.length > 0 && (
        <div className="relative mb-4">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-subtle" />
          <input className="field bg-surface pl-10" placeholder="Workout oder Übung suchen …" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Verlauf durchsuchen" />
        </div>
      )}
      {workouts && workouts.length === 0 && (
        <Empty icon={<History size={28} />} title="Noch keine Workouts" text="Abgeschlossene Trainings erscheinen hier – mit allen Sätzen, Zeiten und Notizen." />
      )}
      <div className="space-y-6">
        {groups.map(([month, ws]) => (
          <section key={month}>
            <div className="mb-2 flex items-baseline justify-between px-1">
              <h2 className="text-[15px] font-bold capitalize">{month}</h2>
              <span className="text-[12px] text-subtle">{ws.length} Workouts</span>
            </div>
            <div className="space-y-2">
              {ws.map((w) => (
                <Link key={w.id} to={`/history/${w.id}`} className="card flex items-center gap-4 p-4 transition hover:border-line">
                  <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-2xl bg-elevated">
                    <span className="text-[10px] font-semibold uppercase text-muted">{dayFmt.format(w.startedAt)}</span>
                    <span className="num text-[17px] font-bold leading-none">{new Date(w.startedAt).getDate()}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-bold">{w.name}</span>
                      {w.prCount > 0 && (
                        <span className="flex shrink-0 items-center gap-0.5 rounded-md bg-accent-soft px-1.5 py-0.5 text-[11px] font-bold dark:text-accent">
                          <Trophy size={11} /> {w.prCount}
                        </span>
                      )}
                    </div>
                    <div className="num text-[13px] text-muted">
                      {fmtTime(w.startedAt)} · {formatDuration(w.durationSec)} · {w.totalSets} Sätze · {fmtVolume(w.totalVolume, settings.unit, true)}
                    </div>
                    <div className="mt-0.5 truncate text-[12px] text-subtle">{(exByWorkout.get(w.id) ?? []).join(' · ')}</div>
                  </div>
                  <ChevronRight size={18} className="shrink-0 text-subtle" />
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
