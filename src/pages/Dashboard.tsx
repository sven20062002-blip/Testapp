import { useMemo, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  BookOpen,
  Check,
  ChevronRight,
  Clock,
  Dumbbell,
  Flame,
  GripVertical,
  History,
  LayoutGrid,
  ListChecks,
  ListPlus,
  Play,
  Plus,
  RotateCcw,
  Settings,
  SlidersHorizontal,
  Trophy,
  Weight,
  X,
} from 'lucide-react';
import clsx from 'clsx';
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { db } from '@/db/db';
import { startWorkout } from '@/db/repo/workouts';
import { updateSettings } from '@/db/repo/settings';
import { currentBests } from '@/db/repo/records';
import { useActiveWorkout, useExerciseMap, useExerciseName, useNow, useSettings } from '@/hooks/useData';
import { totals, weekStreak } from '@/lib/stats';
import { clockElapsedMs, formatDuration, formatHMS, greeting, relativeDay, startOfWeek, fmtLong } from '@/lib/time';
import { fmtVolume, fmtNumber } from '@/lib/units';
import { describePR } from '@/components/workout/PRCelebration';
import { RECORD_LABELS } from '@/lib/labels';
import { unlockAudio } from '@/services/feedback';
import { ActivityWidget, BodyWidget, HealthHint, NutritionWidget, TrainingWidget } from '@/components/dashboard/TodayOverview';
import { DEFAULT_LAYOUT, addWidget, hiddenWidgets, moveWidget, normalizeLayout, removeWidget, widgetMeta, type WidgetId } from '@/components/dashboard/layout';
import { DuelBanner } from '@/components/social/DuelBanner';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';

/* ------------------------------------------------------------------ */
/* Home screen = an ordered list of widgets the user can rearrange.     */
/* ------------------------------------------------------------------ */

export default function Dashboard() {
  const settings = useSettings();
  const layout = normalizeLayout(settings.homeWidgets);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  // every change is stored immediately
  const save = (next: WidgetId[]) => void updateSettings({ homeWidgets: next });

  return (
    <div className="page">
      <header className="mb-4 flex items-center justify-between gap-3 pt-1">
        {editing ? (
          <>
            <div>
              <p className="text-[12.5px] font-medium text-muted">Ziehen, verschieben oder entfernen</p>
              <h1 className="title-xl mt-0.5">Startseite anpassen</h1>
            </div>
            <Button variant="primary" size="sm" icon={<Check size={15} />} onClick={() => setEditing(false)}>
              Fertig
            </Button>
          </>
        ) : (
          <>
            <div className="min-w-0">
              <p className="text-[12.5px] font-medium text-muted">{fmtLong(Date.now())}</p>
              <h1 className="title-xl mt-0.5">
                {greeting()}
                {settings.userName ? `, ${settings.userName}` : ''}
              </h1>
            </div>
            <div className="flex shrink-0 gap-1.5">
              <RoundLink onClick={() => setEditing(true)} label="Startseite anpassen" icon={<SlidersHorizontal size={17} />} />
              <RoundLink to="/exercises" label="Übungen" icon={<BookOpen size={17} />} className="lg:hidden" />
              <RoundLink to="/settings" label="Einstellungen" icon={<Settings size={17} />} className="lg:hidden" />
            </div>
          </>
        )}
      </header>

      {!editing && <DuelBanner />}

      {editing ? (
        <EditGrid layout={layout} onChange={save} />
      ) : layout.length ? (
        <div className="grid grid-cols-2 gap-2.5">
          {layout.map((id) => (
            <div key={id} className={clsx(widgetMeta(id).size === 'full' && 'col-span-2')} data-widget={id}>
              <Widget id={id} />
            </div>
          ))}
          {layout.includes('activity') && layout.includes('body') && (
            <div className="col-span-2 empty:hidden">
              <HealthHint />
            </div>
          )}
        </div>
      ) : (
        <button onClick={() => setEditing(true)} className="card flex w-full flex-col items-center gap-2 p-6 text-center text-[13px] text-muted">
          <LayoutGrid size={22} className="text-subtle" />
          Deine Startseite ist leer.
          <span className="font-semibold text-fg">Widgets hinzufügen</span>
        </button>
      )}

      {editing && (
        <div className="mt-3 space-y-2">
          <button
            onClick={() => setAdding(true)}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-line text-[13px] font-semibold text-muted hover:text-fg"
          >
            <Plus size={17} /> Widget hinzufügen
          </button>
          <button onClick={() => save([...DEFAULT_LAYOUT])} className="mx-auto flex items-center gap-1.5 py-2 text-[12px] font-medium text-subtle hover:text-fg">
            <RotateCcw size={13} /> Standard wiederherstellen
          </button>
        </div>
      )}

      <Sheet open={adding} onClose={() => setAdding(false)} title="Widget hinzufügen">
        {hiddenWidgets(layout).length === 0 ? (
          <p className="py-4 text-center text-[13px] text-muted">Alle Widgets sind bereits auf deiner Startseite.</p>
        ) : (
          <div className="space-y-1.5">
            {hiddenWidgets(layout).map((w) => (
              <button
                key={w.id}
                onClick={() => {
                  save(addWidget(layout, w.id));
                  setAdding(false);
                }}
                className={`chip-${w.area} flex w-full items-center gap-3 rounded-2xl bg-elevated/60 px-3.5 py-3 text-left hover:bg-elevated`}
                aria-label={`${w.title} hinzufügen`}
              >
                <span className="nav-pill nav-ink flex h-9 w-9 shrink-0 items-center justify-center rounded-xl">
                  <Plus size={17} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-semibold">{w.title}</span>
                  <span className="block text-[11.5px] text-muted">{w.description}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </Sheet>
    </div>
  );
}

function RoundLink({ to, onClick, label, icon, className }: { to?: string; onClick?: () => void; label: string; icon: ReactNode; className?: string }) {
  const cls = clsx('flex h-9 w-9 items-center justify-center rounded-full bg-elevated text-fg transition hover:bg-line', className);
  return to ? (
    <Link to={to} aria-label={label} className={cls}>
      {icon}
    </Link>
  ) : (
    <button onClick={onClick} aria-label={label} className={cls}>
      {icon}
    </button>
  );
}

/* ---------------- edit mode ---------------- */

function EditGrid({ layout, onChange }: { layout: WidgetId[]; onChange: (l: WidgetId[]) => void }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    onChange(moveWidget(layout, e.active.id as WidgetId, layout.indexOf(e.over.id as WidgetId)));
  };
  if (!layout.length) return <p className="card p-5 text-center text-[13px] text-muted">Keine Widgets – füge unten welche hinzu.</p>;
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={layout} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-2 gap-2.5">
          {layout.map((id, i) => (
            <EditableWidget
              key={id}
              id={id}
              first={i === 0}
              last={i === layout.length - 1}
              onUp={() => onChange(moveWidget(layout, id, i - 1))}
              onDown={() => onChange(moveWidget(layout, id, i + 1))}
              onRemove={() => onChange(removeWidget(layout, id))}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function EditableWidget({ id, first, last, onUp, onDown, onRemove }: { id: WidgetId; first: boolean; last: boolean; onUp: () => void; onDown: () => void; onRemove: () => void }) {
  const meta = widgetMeta(id);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const iconBtn = 'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-elevated hover:text-fg disabled:opacity-30';
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={clsx(
        `chip-${meta.area} rounded-[22px] bg-surface/60 p-1.5 ring-1 ring-line`,
        meta.size === 'full' && 'col-span-2',
        isDragging && 'relative z-20 shadow-2xl ring-2 ring-[rgb(var(--chip))]',
      )}
      data-testid={`edit-${id}`}
    >
      <div className="flex items-center gap-0.5 pb-1">
        <button {...attributes} {...listeners} aria-label={`${meta.title} verschieben`} className={clsx(iconBtn, 'cursor-grab touch-none active:cursor-grabbing')}>
          <GripVertical size={17} />
        </button>
        <span className="nav-ink min-w-0 flex-1 truncate text-[12px] font-semibold">{meta.title}</span>
        <button className={iconBtn} onClick={onUp} disabled={first} aria-label={`${meta.title} nach oben`}>
          <ArrowUp size={15} />
        </button>
        <button className={iconBtn} onClick={onDown} disabled={last} aria-label={`${meta.title} nach unten`}>
          <ArrowDown size={15} />
        </button>
        <button className={clsx(iconBtn, 'hover:text-bad')} onClick={onRemove} aria-label={`${meta.title} entfernen`}>
          <X size={16} />
        </button>
      </div>
      {/* live preview, not clickable while editing */}
      <div className="pointer-events-none select-none" aria-hidden>
        <Widget id={id} />
      </div>
    </div>
  );
}

/* ---------------- widgets ---------------- */

function Widget({ id }: { id: WidgetId }) {
  switch (id) {
    case 'start':
      return <StartWidget />;
    case 'shortcuts':
      return <ShortcutsWidget />;
    case 'training':
      return <TrainingWidget />;
    case 'nutrition':
      return <NutritionWidget />;
    case 'activity':
      return <ActivityWidget />;
    case 'body':
      return <BodyWidget />;
    case 'progress':
      return <ProgressWidget />;
    case 'lastWorkout':
      return <LastWorkoutWidget />;
    case 'records':
      return <RecordsWidget />;
  }
}

function useStart() {
  const nav = useNavigate();
  return async () => {
    unlockAudio();
    await startWorkout({});
    nav('/workout');
  };
}

function useCompleted() {
  return useLiveQuery(() => db.workouts.where('status').equals('completed').toArray(), []);
}

function StartWidget() {
  const active = useActiveWorkout();
  const now = useNow(!!active && !active.pausedAt, 1000);
  const workouts = useCompleted();
  const start = useStart();
  const last = useMemo(() => [...(workouts ?? [])].sort((a, b) => b.startedAt - a.startedAt)[0], [workouts]);
  if (active)
    return (
      <Link to="/workout" className="relative block overflow-hidden rounded-3xl bg-accent p-5 text-accent-fg">
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/25 blur-3xl" />
        <div className="relative flex items-center justify-between">
          <span className="flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-[0.1em] opacity-70">
            <span className="h-2 w-2 animate-pulse rounded-full bg-current" />
            {active.pausedAt ? 'Pausiert' : 'Training läuft'}
          </span>
          <ChevronRight />
        </div>
        <div className="num relative mt-3 text-[40px] font-bold leading-none tracking-[-0.03em]">{formatHMS(clockElapsedMs(active, now))}</div>
        <div className="relative mt-2 text-[14px] font-medium opacity-75">{active.name}</div>
      </Link>
    );
  return (
    <div className="relative overflow-hidden rounded-3xl bg-surface p-5" style={{ boxShadow: 'var(--shadow)' }}>
      <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-area-train/20 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-28 -left-16 h-56 w-56 rounded-full bg-area-social/10 blur-3xl" />
      <div className="relative">
        <div className="label">Bereit?</div>
        <div className="mt-1 text-[17px] font-semibold leading-snug tracking-[-0.02em]">
          {last ? `Letztes Training ${relativeDay(last.startedAt).toLowerCase()}` : 'Dein erstes Workout wartet'}
        </div>
        <button
          onClick={() => void start()}
          className="mt-4 flex h-12 w-full items-center justify-center gap-2.5 rounded-full bg-accent text-[14px] font-semibold text-accent-fg transition active:scale-[.98]"
        >
          <Play size={17} fill="currentColor" /> Workout starten
        </button>
      </div>
    </div>
  );
}

function ShortcutsWidget() {
  return (
    <div className="card grid grid-cols-4 gap-2 px-2 py-3">
      <QuickAction to="/plans" icon={<ListChecks size={19} />} title="Pläne" />
      <QuickAction to="/plans/new" icon={<ListPlus size={19} />} title="Neuer Plan" />
      <QuickAction to="/history" icon={<History size={19} />} title="Verlauf" />
      <QuickAction to="/stats" icon={<BarChart3 size={19} />} title="Statistik" />
    </div>
  );
}

function QuickAction({ to, icon, title }: { to: string; icon: ReactNode; title: string }) {
  return (
    <Link to={to} className="flex flex-col items-center gap-1 rounded-2xl py-1 text-[11px] font-medium text-muted transition hover:text-fg active:scale-95">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-elevated text-fg">{icon}</span>
      {title}
    </Link>
  );
}

function ProgressWidget() {
  const settings = useSettings();
  const workouts = useCompleted();
  const sets = useLiveQuery(() => db.sets.where('completedAt').above(0).toArray(), []);
  const data = useMemo(() => {
    const ws = workouts ?? [];
    const t = totals(ws, sets ?? []);
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
    const days = new Set(ws.filter((w) => w.startedAt >= thisWeek).map((w) => (new Date(w.startedAt).getDay() + 6) % 7));
    return { t, weeks, streak: weekStreak(ws), days };
  }, [workouts, sets]);
  const maxWeek = Math.max(1, ...data.weeks.map((w) => w.count));
  const weekCount = data.weeks[data.weeks.length - 1].count;

  return (
    <div className="card p-3.5">
      <div className="mb-2.5 flex items-center gap-2 text-[13px] font-semibold">
        <span className="chip chip-train h-7 w-7 rounded-[9px]">
          <BarChart3 size={15} />
        </span>
        Trainingsfortschritt
      </div>
      <div className="grid grid-cols-4 gap-1.5 border-b border-line/60 pb-3">
        <Total icon={<Dumbbell size={12} />} label="Workouts" value={fmtNumber(data.t.workouts)} />
        <Total icon={<Clock size={12} />} label="Zeit" value={formatDuration(data.t.durationSec)} />
        <Total icon={<Flame size={12} />} label="Sätze" value={fmtNumber(data.t.sets)} />
        <Total icon={<Weight size={12} />} label="Volumen" value={fmtVolume(data.t.volume, settings.unit, true)} />
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[13px] font-semibold">Diese Woche</div>
          <div className="text-[11.5px] text-muted">
            {weekCount} von {settings.weeklyGoal} Workouts{data.streak > 0 ? ` · ${data.streak} ${data.streak === 1 ? 'Woche' : 'Wochen'} in Folge` : ''}
          </div>
        </div>
        <div className="flex gap-1.5" aria-label="Trainingstage dieser Woche">
          {['M', 'D', 'M', 'D', 'F', 'S', 'S'].map((d, i) => (
            <span key={i} className={clsx('flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold', data.days.has(i) ? 'bg-accent text-accent-fg' : 'bg-elevated text-subtle')}>
              {d}
            </span>
          ))}
        </div>
      </div>
      <div className="mt-3 flex h-[4.5rem] items-end gap-2" role="img" aria-label="Workouts der letzten 8 Wochen">
        {data.weeks.map((w, i) => (
          <div key={w.start} className="group relative flex flex-1 flex-col items-center gap-1.5">
            <div className="flex h-14 w-full items-end">
              <div
                className={clsx('w-full rounded-t-[4px] transition-all', i === data.weeks.length - 1 ? 'bg-accent' : 'bg-accent/45', w.count === 0 && 'bg-elevated')}
                style={{ height: w.count ? `${(w.count / maxWeek) * 100}%` : '4px' }}
              />
            </div>
            <span className="num text-[10px] text-subtle">{new Date(w.start).getDate()}.</span>
            <span className="pointer-events-none absolute -top-7 hidden whitespace-nowrap rounded-lg bg-fg px-2 py-0.5 text-[10px] font-semibold text-bg group-hover:block">
              {w.count} · {Math.round(w.minutes)} Min
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Total({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1 text-[10px] font-medium text-muted">
        <span className="chip chip-train h-4 w-4 rounded-[5px]">{icon}</span>
        {label}
      </div>
      <div className="num mt-1 truncate text-[15px] font-bold tracking-[-0.01em]">{value}</div>
    </div>
  );
}

function LastWorkoutWidget() {
  const settings = useSettings();
  const workouts = useCompleted();
  const last = useMemo(() => [...(workouts ?? [])].sort((a, b) => b.startedAt - a.startedAt)[0], [workouts]);
  if (!last)
    return (
      <div className="card flex items-center gap-3 p-3.5 text-[12px] text-muted">
        <History className="shrink-0 text-subtle" size={18} />
        Hier erscheint dein letztes Workout.
      </div>
    );
  return (
    <Link to={`/history/${last.id}`} className="card flex items-center gap-3 p-3.5 transition hover:border-line">
      <div className="flex h-11 w-11 flex-col items-center justify-center rounded-2xl bg-elevated">
        <span className="num text-[15.5px] font-bold leading-none">{new Date(last.startedAt).getDate()}</span>
        <span className="text-[10px] font-semibold uppercase text-muted">{new Intl.DateTimeFormat('de-DE', { month: 'short' }).format(last.startedAt)}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[10.5px] font-semibold uppercase tracking-wider text-subtle">Letztes Workout</div>
        <div className="truncate font-semibold">{last.name}</div>
        <div className="num truncate text-[12px] text-muted">
          {relativeDay(last.startedAt)} · {formatDuration(last.durationSec)} · {last.totalSets} Sätze · {fmtVolume(last.totalVolume, settings.unit, true)}
        </div>
      </div>
      {last.prCount > 0 && (
        <span className="chip-train flex items-center gap-1 rounded-full bg-[rgb(var(--chip)/0.14)] px-2 py-1 text-[11.5px] font-semibold text-[rgb(var(--chip))]">
          <Trophy size={13} /> {last.prCount}
        </span>
      )}
      <ChevronRight size={18} className="text-subtle" />
    </Link>
  );
}

function RecordsWidget() {
  const settings = useSettings();
  const exMap = useExerciseMap();
  const name = useExerciseName();
  const records = useLiveQuery(() => db.records.toArray(), []);
  const recent = useMemo(() => {
    const bests = currentBests((records ?? []).filter((r) => r.type === 'weight' || r.type === 'duration' || (r.type === 'reps' && !r.weight)));
    return [...bests.values()]
      .filter((r) => exMap.get(r.exerciseId))
      .sort((a, b) => b.achievedAt - a.achievedAt)
      .slice(0, 4);
  }, [records, exMap]);
  return (
    <div className="card p-3.5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-[13px] font-semibold">
          <span className="chip chip-train h-7 w-7 rounded-[9px]">
            <Trophy size={15} />
          </span>
          Bestleistungen
        </span>
        <Link to="/records" className="text-[12px] font-semibold text-muted hover:text-fg">
          Alle
        </Link>
      </div>
      {recent.length === 0 ? (
        <p className="mt-2 text-[12px] text-muted">Deine persönlichen Rekorde erscheinen hier, sobald du Workouts absolvierst.</p>
      ) : (
        <div className="mt-1.5 divide-y divide-line/60">
          {recent.map((r) => (
            <Link key={r.id} to={`/exercises/${r.exerciseId}`} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-semibold">{name(exMap.get(r.exerciseId))}</div>
                <div className="text-[11px] text-muted">
                  {RECORD_LABELS[r.type]} · {relativeDay(r.achievedAt)}
                </div>
              </div>
              <div className="num text-right text-[13.5px] font-bold">{describePR(r, settings.unit)}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
