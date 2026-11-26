import { useMemo, useRef, useState, type ReactNode } from 'react';
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
  Maximize2,
  Minimize2,
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
import type { Settings as SettingsT } from '@/db/types';
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { db } from '@/db/db';
import { startWorkout } from '@/db/repo/workouts';
import { updateSettingsWith } from '@/db/repo/settings';
import { currentBests } from '@/db/repo/records';
import { useActiveWorkout, useExerciseMap, useExerciseName, useLoadedSettings, useNow, useSettings } from '@/hooks/useData';
import { totals, weekStreak } from '@/lib/stats';
import { clockElapsedMs, formatDuration, formatHMS, greeting, relativeDay, startOfWeek, fmtLong } from '@/lib/time';
import { fmtVolume } from '@/lib/units';
import { describePR } from '@/components/workout/PRCelebration';
import { RECORD_LABELS } from '@/lib/labels';
import { unlockAudio } from '@/services/feedback';
import { ActivityWidget, BodyWidget, HealthHint, NutritionWidget, TrainingWidget } from '@/components/dashboard/TodayOverview';
import { DEFAULT_LAYOUT, addWidget, hiddenWidgets, moveWidget, normalizeLayout, removeWidget, setWidgetSize, widgetMeta, widgetSize, type WidgetId, type WidgetSize } from '@/components/dashboard/layout';
import { useFlip } from '@/hooks/useFlip';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { DuelBanner } from '@/components/social/DuelBanner';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';

/* ------------------------------------------------------------------ */
/* Home screen = an ordered list of widgets the user can rearrange.     */
/* ------------------------------------------------------------------ */

export default function Dashboard() {
  const loaded = useLoadedSettings();
  // render the home screen only once the user's layout is known – no jump from the default layout
  return loaded ? <Home settings={loaded} /> : <div className="page" />;
}

function Home({ settings }: { settings: SettingsT }) {
  const layout = normalizeLayout(settings.homeWidgets);
  const sizes = settings.homeWidgetSizes;
  const sizeOf = (id: WidgetId) => widgetSize(id, sizes);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  // every change is stored immediately – computed from the stored state, so fast taps never overwrite each other
  const edit = (fn: (l: WidgetId[]) => WidgetId[]) => void updateSettingsWith((cur) => ({ homeWidgets: fn(normalizeLayout(cur.homeWidgets)) }));
  const resize = (id: WidgetId, size: WidgetSize) => void updateSettingsWith((cur) => ({ homeWidgetSizes: setWidgetSize(cur.homeWidgetSizes, id, size) }));
  const grid = useRef<HTMLDivElement>(null);
  const skipFlip = useRef(false);
  // tiles glide to their new place when the order, size or mode changes
  useFlip(grid, [layout.join(), JSON.stringify(sizes ?? {}), editing], skipFlip);

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
        <div ref={grid}>
          <EditGrid
            layout={layout}
            sizeOf={sizeOf}
            onChange={edit}
            onResize={resize}
            onDragged={() => (skipFlip.current = true)}
          />
        </div>
      ) : layout.length ? (
        <div ref={grid} className="grid grid-cols-2 gap-2.5">
          {layout.map((id) => (
            <div key={id} className={clsx(sizeOf(id) === 'full' && 'col-span-2')} data-widget={id} data-size={sizeOf(id)} data-flip={id}>
              <Widget id={id} compact={sizeOf(id) === 'half'} />
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
          <button
            onClick={() => {
              void updateSettingsWith(() => ({ homeWidgets: [...DEFAULT_LAYOUT], homeWidgetSizes: null }));
            }}
            className="mx-auto flex items-center gap-1.5 py-2 text-[12px] font-medium text-subtle hover:text-fg">
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
                  edit((l) => addWidget(l, w.id));
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

function EditGrid({
  layout,
  sizeOf,
  onChange,
  onResize,
  onDragged,
}: {
  layout: WidgetId[];
  sizeOf: (id: WidgetId) => WidgetSize;
  onChange: (fn: (l: WidgetId[]) => WidgetId[]) => void;
  onResize: (id: WidgetId, s: WidgetSize) => void;
  onDragged: () => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    onDragged(); // dnd-kit already animated the drop
    const [from, to] = [e.active.id as WidgetId, e.over.id as WidgetId];
    onChange((l) => moveWidget(l, from, l.indexOf(to)));
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
              size={sizeOf(id)}
              onResize={(sz) => onResize(id, sz)}
              first={i === 0}
              last={i === layout.length - 1}
              onUp={() => onChange((l) => moveWidget(l, id, l.indexOf(id) - 1))}
              onDown={() => onChange((l) => moveWidget(l, id, l.indexOf(id) + 1))}
              onRemove={() => onChange((l) => removeWidget(l, id))}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function EditableWidget({
  id,
  size,
  onResize,
  first,
  last,
  onUp,
  onDown,
  onRemove,
}: {
  id: WidgetId;
  size: WidgetSize;
  onResize: (s: WidgetSize) => void;
  first: boolean;
  last: boolean;
  onUp: () => void;
  onDown: () => void;
  onRemove: () => void;
}) {
  const meta = widgetMeta(id);
  const half = size === 'half';
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const iconBtn = clsx(
    'flex shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-elevated hover:text-fg active:scale-90 disabled:opacity-30',
    half ? 'h-7 w-7' : 'h-8 w-8',
  );
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={clsx(
        `chip-${meta.area} rounded-[22px] bg-surface/60 p-1.5 ring-1 ring-line`,
        !half && 'col-span-2',
        isDragging && 'relative z-20 shadow-2xl ring-2 ring-[rgb(var(--chip))]',
      )}
      data-testid={`edit-${id}`}
      data-flip={id}
    >
      <div className="flex items-center gap-0.5 pb-1">
        <button {...attributes} {...listeners} aria-label={`${meta.title} verschieben`} className={clsx(iconBtn, 'cursor-grab touch-none active:cursor-grabbing')}>
          <GripVertical size={17} />
        </button>
        <span className={clsx('nav-ink min-w-0 flex-1 truncate font-semibold', half ? 'text-[10.5px]' : 'text-[12px]')}>{half ? '' : meta.title}</span>
        <button className={iconBtn} onClick={onUp} disabled={first} aria-label={`${meta.title} nach oben`}>
          <ArrowUp size={15} />
        </button>
        <button className={iconBtn} onClick={onDown} disabled={last} aria-label={`${meta.title} nach unten`}>
          <ArrowDown size={15} />
        </button>
        <button className={iconBtn} onClick={() => onResize(half ? 'full' : 'half')} aria-label={`${meta.title} ${half ? 'vergrößern' : 'verkleinern'}`}>
          {half ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
        </button>
        <button className={clsx(iconBtn, 'hover:text-bad')} onClick={onRemove} aria-label={`${meta.title} entfernen`}>
          <X size={16} />
        </button>
      </div>
      {/* live preview, not clickable while editing */}
      <div className="pointer-events-none select-none" aria-hidden>
        <Widget id={id} compact={half} />
      </div>
    </div>
  );
}

/* ---------------- widgets ---------------- */

function Widget({ id, compact }: { id: WidgetId; compact: boolean }) {
  switch (id) {
    case 'start':
      return <StartWidget compact={compact} />;
    case 'shortcuts':
      return <ShortcutsWidget compact={compact} />;
    case 'training':
      return <TrainingWidget compact={compact} />;
    case 'nutrition':
      return <NutritionWidget compact={compact} />;
    case 'activity':
      return <ActivityWidget compact={compact} />;
    case 'body':
      return <BodyWidget compact={compact} />;
    case 'progress':
      return <ProgressWidget compact={compact} />;
    case 'lastWorkout':
      return <LastWorkoutWidget compact={compact} />;
    case 'records':
      return <RecordsWidget compact={compact} />;
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

function StartWidget({ compact }: { compact?: boolean }) {
  const active = useActiveWorkout();
  const now = useNow(!!active && !active.pausedAt, 1000);
  const workouts = useCompleted();
  const start = useStart();
  const last = useMemo(() => [...(workouts ?? [])].sort((a, b) => b.startedAt - a.startedAt)[0], [workouts]);
  if (compact)
    return active ? (
      <Link to="/workout" className="relative flex h-full min-h-[112px] flex-col justify-between overflow-hidden rounded-3xl bg-accent p-3.5 text-accent-fg">
        <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] opacity-75">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" /> {active.pausedAt ? 'Pausiert' : 'Läuft'}
        </span>
        <span className="num text-[22px] font-bold leading-none tracking-tight">{formatHMS(clockElapsedMs(active, now))}</span>
        <span className="truncate text-[11px] font-medium opacity-75">{active.name}</span>
      </Link>
    ) : (
      <button
        onClick={() => void start()}
        className="group relative flex h-full min-h-[112px] w-full flex-col justify-between overflow-hidden rounded-3xl bg-accent p-3.5 text-left text-accent-fg transition active:scale-[.97]"
      >
        <div aria-hidden className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-white/25 blur-2xl transition-transform duration-700 group-hover:scale-125" />
        <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-black/10">
          <Play size={18} fill="currentColor" />
        </span>
        <span className="relative text-[14px] font-semibold leading-tight">Workout starten</span>
      </button>
    );
  if (active)
    return (
      <Link to="/workout" className="relative block overflow-hidden rounded-3xl bg-accent p-5 text-accent-fg">
        <div aria-hidden className="drift pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/25 blur-3xl" />
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
      <div aria-hidden className="drift pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-area-train/20 blur-3xl" />
      <div aria-hidden className="drift-slow pointer-events-none absolute -bottom-28 -left-16 h-56 w-56 rounded-full bg-area-social/10 blur-3xl" />
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

function ShortcutsWidget({ compact }: { compact?: boolean }) {
  if (compact)
    return (
      <div className="card grid h-full grid-cols-2 gap-1 p-2">
        <QuickAction to="/plans" icon={<ListChecks size={17} />} title="Pläne" small />
        <QuickAction to="/plans/new" icon={<ListPlus size={17} />} title="Neu" small />
        <QuickAction to="/history" icon={<History size={17} />} title="Verlauf" small />
        <QuickAction to="/stats" icon={<BarChart3 size={17} />} title="Statistik" small />
      </div>
    );
  return (
    <div className="card grid grid-cols-4 gap-2 px-2 py-3">
      <QuickAction to="/plans" icon={<ListChecks size={19} />} title="Pläne" />
      <QuickAction to="/plans/new" icon={<ListPlus size={19} />} title="Neuer Plan" />
      <QuickAction to="/history" icon={<History size={19} />} title="Verlauf" />
      <QuickAction to="/stats" icon={<BarChart3 size={19} />} title="Statistik" />
    </div>
  );
}

function QuickAction({ to, icon, title, small }: { to: string; icon: ReactNode; title: string; small?: boolean }) {
  return (
    <Link to={to} className={clsx('flex flex-col items-center gap-1 rounded-2xl py-1 font-medium text-muted transition hover:text-fg active:scale-90', small ? 'text-[10px]' : 'text-[11px]')}>
      <span className={clsx('flex items-center justify-center rounded-full bg-elevated text-fg transition-transform', small ? 'h-8 w-8' : 'h-10 w-10')}>{icon}</span>
      {title}
    </Link>
  );
}

function ProgressWidget({ compact }: { compact?: boolean }) {
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
  const bars = (h: string) => (
    <div className={clsx('flex items-end gap-1', h)} role="img" aria-label="Workouts der letzten 8 Wochen">
      {data.weeks.map((w, i) => (
        <div
          key={w.start}
          className={clsx('grow-bar w-full rounded-t-[3px]', i === data.weeks.length - 1 ? 'bg-accent' : 'bg-accent/45', w.count === 0 && 'bg-elevated')}
          style={{ height: w.count ? `${(w.count / maxWeek) * 100}%` : '3px', animationDelay: `${i * 40}ms` }}
        />
      ))}
    </div>
  );
  if (compact)
    return (
      <div className="card h-full p-3.5">
        <div className="flex items-center gap-2 text-[13px] font-semibold">
          <span className="chip chip-train h-7 w-7 rounded-[9px]">
            <BarChart3 size={15} />
          </span>
          Fortschritt
        </div>
        <div className="num mt-2.5 text-[21px] font-bold leading-tight tracking-[-0.02em]">
          <AnimatedNumber value={data.t.workouts} />
        </div>
        <div className="text-[10.5px] text-muted">Workouts gesamt</div>
        {bars('mt-2 h-8')}
      </div>
    );

  return (
    <div className="card p-3.5">
      <div className="mb-2.5 flex items-center gap-2 text-[13px] font-semibold">
        <span className="chip chip-train h-7 w-7 rounded-[9px]">
          <BarChart3 size={15} />
        </span>
        Trainingsfortschritt
      </div>
      <div className="grid grid-cols-4 gap-1.5 border-b border-line/60 pb-3">
        <Total icon={<Dumbbell size={12} />} label="Workouts" value={<AnimatedNumber value={data.t.workouts} />} />
        <Total icon={<Clock size={12} />} label="Zeit" value={formatDuration(data.t.durationSec)} />
        <Total icon={<Flame size={12} />} label="Sätze" value={<AnimatedNumber value={data.t.sets} />} />
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
                className={clsx('grow-bar w-full rounded-t-[4px] transition-all', i === data.weeks.length - 1 ? 'bg-accent' : 'bg-accent/45', w.count === 0 && 'bg-elevated')}
                style={{ height: w.count ? `${(w.count / maxWeek) * 100}%` : '4px', animationDelay: `${i * 45}ms` }}
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

function Total({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
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

function LastWorkoutWidget({ compact }: { compact?: boolean }) {
  const settings = useSettings();
  const workouts = useCompleted();
  const last = useMemo(() => [...(workouts ?? [])].sort((a, b) => b.startedAt - a.startedAt)[0], [workouts]);
  if (compact)
    return (
      <Link to={last ? `/history/${last.id}` : '/history'} className="card block h-full p-3.5">
        <div className="flex items-center gap-2 text-[13px] font-semibold">
          <span className="chip chip-train h-7 w-7 rounded-[9px]">
            <History size={15} />
          </span>
          Zuletzt
        </div>
        <div className="mt-2.5 truncate text-[14px] font-bold">{last ? last.name : '–'}</div>
        <div className="num truncate text-[10.5px] text-muted">{last ? `${relativeDay(last.startedAt)} · ${formatDuration(last.durationSec)}` : 'Noch kein Workout'}</div>
        {last && <div className="num mt-2 truncate text-[10.5px] text-muted">{last.totalSets} Sätze · {fmtVolume(last.totalVolume, settings.unit, true)}</div>}
      </Link>
    );
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

function RecordsWidget({ compact }: { compact?: boolean }) {
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
  if (compact) {
    const top = recent[0];
    return (
      <Link to="/records" className="card block h-full p-3.5">
        <div className="flex items-center gap-2 text-[13px] font-semibold">
          <span className="chip chip-train h-7 w-7 rounded-[9px]">
            <Trophy size={15} />
          </span>
          Rekorde
        </div>
        {top ? (
          <>
            <div className="num mt-2.5 truncate text-[17px] font-bold leading-tight">{describePR(top, settings.unit)}</div>
            <div className="truncate text-[11px] font-semibold">{name(exMap.get(top.exerciseId))}</div>
            <div className="truncate text-[10.5px] text-muted">{relativeDay(top.achievedAt)}</div>
          </>
        ) : (
          <p className="mt-2.5 text-[11px] text-muted">Noch keine Rekorde – leg los!</p>
        )}
      </Link>
    );
  }
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
