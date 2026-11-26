import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight, Clock, Dumbbell, Flame, History, Layers, ListPlus, Play, Settings, Trophy, Weight, BookOpen, BarChart3 } from 'lucide-react';
import clsx from 'clsx';
import { db } from '@/db/db';
import { startWorkout } from '@/db/repo/workouts';
import { currentBests } from '@/db/repo/records';
import { useActiveWorkout, useExerciseMap, useExerciseName, useNow, useSettings } from '@/hooks/useData';
import { totals, weekStreak } from '@/lib/stats';
import { clockElapsedMs, formatDuration, formatHMS, greeting, relativeDay, startOfWeek, fmtLong } from '@/lib/time';
import { fmtVolume, fmtNumber } from '@/lib/units';
import { Stat } from '@/components/ui/Stat';
import { SectionTitle } from '@/components/ui/PageHeader';
import { describePR } from '@/components/workout/PRCelebration';
import { RECORD_LABELS } from '@/lib/labels';
import { Logo } from '@/components/layout/Logo';
import { unlockAudio } from '@/services/feedback';
import { TodayOverview } from '@/components/dashboard/TodayOverview';

export default function Dashboard() {
  const nav = useNavigate();
  const settings = useSettings();
  const active = useActiveWorkout();
  const exMap = useExerciseMap();
  const name = useExerciseName();
  const now = useNow(!!active && !active.pausedAt, 1000);
  const workouts = useLiveQuery(() => db.workouts.where('status').equals('completed').toArray(), []);
  const sets = useLiveQuery(() => db.sets.where('completedAt').above(0).toArray(), []);
  const plans = useLiveQuery(() => db.plans.toArray(), []);
  const records = useLiveQuery(() => db.records.toArray(), []);

  const data = useMemo(() => {
    const ws = workouts ?? [];
    const t = totals(ws, sets ?? []);
    const last = [...ws].sort((a, b) => b.startedAt - a.startedAt)[0];
    // last 8 weeks activity
    const weeks: { start: number; count: number; minutes: number }[] = [];
    const thisWeek = startOfWeek(Date.now());
    for (let i = 7; i >= 0; i--) {
      const d = new Date(thisWeek);
      d.setDate(d.getDate() - i * 7);
      weeks.push({ start: d.getTime(), count: 0, minutes: 0 });
    }
    for (const w of ws) {
      const wk = weeks.find((x) => x.start === startOfWeek(w.startedAt));
      if (wk) {
        wk.count++;
        wk.minutes += w.durationSec / 60;
      }
    }
    // days trained this week
    const days = new Set(ws.filter((w) => w.startedAt >= thisWeek).map((w) => (new Date(w.startedAt).getDay() + 6) % 7));
    return { t, last, weeks, streak: weekStreak(ws), days };
  }, [workouts, sets]);

  const recentPRs = useMemo(() => {
    const bests = currentBests((records ?? []).filter((r) => r.type === 'weight' || r.type === 'duration' || (r.type === 'reps' && !r.weight)));
    return [...bests.values()]
      .filter((r) => exMap.get(r.exerciseId))
      .sort((a, b) => b.achievedAt - a.achievedAt)
      .slice(0, 4);
  }, [records, exMap]);

  const quickPlans = useMemo(
    () => [...(plans ?? [])].sort((a, b) => (b.lastUsedAt ?? b.createdAt) - (a.lastUsedAt ?? a.createdAt)).slice(0, 6),
    [plans],
  );

  const start = async (planId?: string) => {
    unlockAudio();
    await startWorkout(planId ? { planId } : {});
    nav('/workout');
  };

  if (!workouts) return <div className="page" />;
  const maxWeek = Math.max(1, ...data.weeks.map((w) => w.count));
  const weekCount = data.weeks[data.weeks.length - 1].count;

  return (
    <div className="page">
      {/* Header */}
      <header className="mb-5 flex items-center justify-between pt-2">
        <div className="flex items-center gap-3">
          <div className="lg:hidden">
            <Logo size={36} />
          </div>
          <div>
            <p className="text-[13px] font-medium text-muted">{fmtLong(Date.now())}</p>
            <h1 className="text-[26px] font-extrabold leading-tight tracking-tight sm:text-[30px]">
              {greeting()}
              {settings.userName ? `, ${settings.userName}` : ''}
            </h1>
          </div>
        </div>
        <div className="flex gap-1 lg:hidden">
          <Link to="/exercises" aria-label="Übungen" className="flex h-10 w-10 items-center justify-center rounded-xl bg-elevated text-fg">
            <BookOpen size={19} />
          </Link>
          <Link to="/settings" aria-label="Einstellungen" className="flex h-10 w-10 items-center justify-center rounded-xl bg-elevated text-fg">
            <Settings size={19} />
          </Link>
        </div>
      </header>

      {/* Hero action */}
      {active ? (
        <Link
          to="/workout"
          className="relative block overflow-hidden rounded-3xl bg-accent p-5 text-accent-fg shadow-[0_16px_48px_-16px_rgb(var(--accent)/.8)] animate-rise"
        >
          <div className="flex items-center justify-between">
            <span className="rounded-full bg-black/10 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wider">
              {active.pausedAt ? 'Pausiert' : 'Läuft gerade'}
            </span>
            <ChevronRight />
          </div>
          <div className="num mt-4 text-[44px] font-extrabold leading-none tracking-tight">{formatHMS(clockElapsedMs(active, now))}</div>
          <div className="mt-1.5 text-[15px] font-semibold opacity-80">{active.name} – zurück zum Training</div>
        </Link>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 animate-rise">
          <button
            onClick={() => start()}
            className="col-span-2 flex items-center gap-4 rounded-3xl bg-accent p-5 text-left text-accent-fg shadow-[0_16px_48px_-16px_rgb(var(--accent)/.8)] transition active:scale-[.99]"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-black/10">
              <Play size={28} fill="currentColor" />
            </span>
            <span className="flex-1">
              <span className="block text-xl font-extrabold tracking-tight">Workout starten</span>
              <span className="block text-sm font-medium opacity-75">Leeres Training – Timer läuft sofort</span>
            </span>
          </button>
          <QuickAction to="/workout" icon={<Layers size={20} />} title="Plan starten" sub={`${plans?.length ?? 0} gespeichert`} />
          <QuickAction to="/plans/new" icon={<ListPlus size={20} />} title="Neuer Plan" sub="Training erstellen" />
          <QuickAction to="/history" icon={<History size={20} />} title="Verlauf" sub={`${data.t.workouts} Workouts`} />
          <QuickAction to="/stats" icon={<BarChart3 size={20} />} title="Statistik" sub="Fortschritt ansehen" />
        </div>
      )}

      {/* Central daily overview */}
      <SectionTitle>Heute</SectionTitle>
      <TodayOverview />

      {/* Totals */}
      <SectionTitle>Dein Trainingsfortschritt</SectionTitle>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Stat icon={<Dumbbell size={14} />} label="Workouts" value={fmtNumber(data.t.workouts)} sub={`${data.streak} ${data.streak === 1 ? 'Woche' : 'Wochen'} in Folge`} />
        <Stat icon={<Clock size={14} />} label="Trainingszeit" value={formatDuration(data.t.durationSec)} />
        <Stat icon={<Flame size={14} />} label="Sätze" value={fmtNumber(data.t.sets)} sub={`${fmtNumber(data.t.reps)} Wiederholungen`} />
        <Stat icon={<Weight size={14} />} label="Volumen" value={fmtVolume(data.t.volume, settings.unit, true)} />
      </div>

      {/* Weekly activity */}
      <div className="card mt-2.5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[15px] font-bold">Diese Woche</div>
            <div className="text-[13px] text-muted">
              {weekCount} von {settings.weeklyGoal} Workouts
            </div>
          </div>
          <div className="flex gap-1.5" aria-label="Trainingstage dieser Woche">
            {['M', 'D', 'M', 'D', 'F', 'S', 'S'].map((d, i) => (
              <span
                key={i}
                className={clsx(
                  'flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold',
                  data.days.has(i) ? 'bg-accent text-accent-fg' : 'bg-elevated text-subtle',
                )}
              >
                {d}
              </span>
            ))}
          </div>
        </div>
        <div className="mt-4 flex h-24 items-end gap-2" role="img" aria-label="Workouts der letzten 8 Wochen">
          {data.weeks.map((w, i) => (
            <div key={w.start} className="group relative flex flex-1 flex-col items-center gap-1.5">
              <div className="flex h-20 w-full items-end">
                <div
                  className={clsx('w-full rounded-t-[4px] transition-all', i === data.weeks.length - 1 ? 'bg-accent' : 'bg-accent/45', w.count === 0 && 'bg-elevated')}
                  style={{ height: w.count ? `${(w.count / maxWeek) * 100}%` : '4px' }}
                />
              </div>
              <span className="num text-[10px] text-subtle">{new Date(w.start).getDate()}.</span>
              <span className="pointer-events-none absolute -top-7 hidden whitespace-nowrap rounded-lg bg-fg px-2 py-0.5 text-[11px] font-semibold text-bg group-hover:block">
                {w.count} · {Math.round(w.minutes)} Min
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Last workout */}
      {data.last && (
        <>
          <SectionTitle action={<Link to="/history" className="text-[13px] font-semibold text-muted hover:text-fg">Alle</Link>}>Letztes Workout</SectionTitle>
          <Link to={`/history/${data.last.id}`} className="card flex items-center gap-4 p-4 transition hover:border-line">
            <div className="flex h-12 w-12 flex-col items-center justify-center rounded-2xl bg-elevated">
              <span className="num text-[17px] font-extrabold leading-none">{new Date(data.last.startedAt).getDate()}</span>
              <span className="text-[10px] font-semibold uppercase text-muted">
                {new Intl.DateTimeFormat('de-DE', { month: 'short' }).format(data.last.startedAt)}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-bold">{data.last.name}</div>
              <div className="num text-[13px] text-muted">
                {relativeDay(data.last.startedAt)} · {formatDuration(data.last.durationSec)} · {data.last.totalSets} Sätze · {fmtVolume(data.last.totalVolume, settings.unit, true)}
              </div>
            </div>
            {data.last.prCount > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-accent-soft px-2 py-1 text-[12px] font-bold dark:text-accent">
                <Trophy size={13} /> {data.last.prCount}
              </span>
            )}
            <ChevronRight size={18} className="text-subtle" />
          </Link>
        </>
      )}

      {/* Plans */}
      <SectionTitle action={<Link to="/plans" className="text-[13px] font-semibold text-muted hover:text-fg">Alle Pläne</Link>}>Trainingspläne</SectionTitle>
      <div className="scroll-x -mx-4 px-4 pb-1 sm:-mx-6 sm:px-6">
        {quickPlans.map((p) => (
          <div key={p.id} className="card flex w-[220px] shrink-0 flex-col p-4">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />
              <span className="truncate font-bold">{p.name}</span>
            </div>
            <div className="mt-1 line-clamp-2 min-h-[2.5em] text-[12px] text-muted">
              {p.exercises
                .slice(0, 4)
                .map((e) => name(exMap.get(e.exerciseId)))
                .join(', ')}
            </div>
            <button
              onClick={() => start(p.id)}
              disabled={!!active}
              className="mt-3 flex h-10 items-center justify-center gap-1.5 rounded-xl bg-elevated text-[13px] font-bold transition hover:bg-line disabled:opacity-40"
            >
              <Play size={14} fill="currentColor" /> Starten
            </button>
          </div>
        ))}
        <Link to="/plans/new" className="flex w-[140px] shrink-0 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line text-[13px] font-semibold text-muted hover:text-fg">
          <ListPlus size={22} /> Neuer Plan
        </Link>
      </div>

      {/* PRs */}
      <SectionTitle action={<Link to="/records" className="text-[13px] font-semibold text-muted hover:text-fg">Alle Rekorde</Link>}>Bestleistungen</SectionTitle>
      {recentPRs.length === 0 ? (
        <div className="card p-5 text-center text-sm text-muted">
          <Trophy className="mx-auto mb-2 text-subtle" size={22} />
          Deine persönlichen Rekorde erscheinen hier, sobald du Workouts absolvierst.
        </div>
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2">
          {recentPRs.map((r) => (
            <Link key={r.id} to={`/exercises/${r.exerciseId}`} className="card flex items-center gap-3 p-4 hover:border-line">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-fg dark:text-accent">
                <Trophy size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{name(exMap.get(r.exerciseId))}</div>
                <div className="text-[12px] text-muted">
                  {RECORD_LABELS[r.type]} · {relativeDay(r.achievedAt)}
                </div>
              </div>
              <div className="num text-right text-[15px] font-extrabold">{describePR(r, settings.unit)}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function QuickAction({ to, icon, title, sub }: { to: string; icon: React.ReactNode; title: string; sub: string }) {
  return (
    <Link to={to} className="card flex flex-col gap-3 p-4 transition hover:border-line active:scale-[.99]">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-elevated text-fg">{icon}</span>
      <span className="min-w-0">
        <span className="block truncate text-[15px] font-bold">{title}</span>
        <span className="block truncate text-[12px] text-muted">{sub}</span>
      </span>
    </Link>
  );
}
