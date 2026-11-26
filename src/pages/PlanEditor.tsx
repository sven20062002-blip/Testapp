import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import clsx from 'clsx';
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { restrictToVerticalAxis } from '@/lib/dnd';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Minus, Plus, Trash2, Hourglass, Pin, Play } from 'lucide-react';
import { db } from '@/db/db';
import type { PlanExercise } from '@/db/types';
import { newPlanExercise, savePlan, validatePlan } from '@/db/repo/plans';
import { startWorkout } from '@/db/repo/workouts';
import { useActiveWorkout, useExerciseMap, useExerciseName } from '@/hooks/useData';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button, IconButton } from '@/components/ui/Button';
import { useFeedback } from '@/components/ui/Feedback';
import { ExercisePicker } from '@/components/exercises/ExercisePicker';
import { MuscleIcon } from '@/components/exercises/MuscleIcon';
import { Field } from '@/components/exercises/ExerciseForm';
import { PLAN_COLORS, MUSCLE_LABELS } from '@/lib/labels';
import { RestPicker } from '@/components/workout/TimerPanel';
import { formatClock } from '@/lib/time';
import { clearDraft, onAppLeave, readDraft, writeDraft } from '@/lib/leave';

interface PlanDraft {
  name: string;
  description: string;
  color: string;
  exercises: PlanExercise[];
  savedAt: number;
}

export default function PlanEditor() {
  const { id } = useParams();
  const nav = useNavigate();
  const { toast } = useFeedback();
  const active = useActiveWorkout();
  const existing = useLiveQuery(async () => (id ? ((await db.plans.get(id)) ?? null) : null), [id]);
  const notes = useLiveQuery(() => db.exerciseNotes.toArray(), []);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(PLAN_COLORS[0]);
  const [items, setItems] = useState<PlanExercise[]>([]);
  const [loaded, setLoaded] = useState(!id);
  const [picker, setPicker] = useState(false);
  const [restFor, setRestFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  // unsaved changes are kept as a draft (also when the app is left) and restored on return
  const draftKey = `forge-plan-draft:${id ?? 'new'}`;
  const [restored, setRestored] = useState(false);
  const applyState = (x: Pick<PlanDraft, 'name' | 'description' | 'color' | 'exercises'>) => {
    setName(x.name);
    setDescription(x.description);
    setColor(x.color);
    setItems(x.exercises);
  };

  useEffect(() => {
    if (loaded && id) return;
    const draft = readDraft<PlanDraft>(draftKey);
    if (!id) {
      if (draft) {
        applyState(draft);
        setDirty(true);
        setRestored(true);
      }
      return;
    }
    if (existing && !loaded) {
      if (draft && draft.savedAt > existing.updatedAt) {
        applyState(draft);
        setDirty(true);
        setRestored(true);
      } else {
        if (draft) clearDraft(draftKey);
        applyState(existing);
      }
      setLoaded(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, existing, loaded]);

  const draftRef = useRef<PlanDraft | null>(null);
  draftRef.current = dirty ? { name, description, color, exercises: items, savedAt: Date.now() } : null;
  useEffect(() => {
    if (dirty) writeDraft(draftKey, { name, description, color, exercises: items, savedAt: Date.now() });
  }, [dirty, name, description, color, items, draftKey]);
  useEffect(
    () =>
      onAppLeave(() => {
        if (draftRef.current) writeDraft(draftKey, { ...draftRef.current, savedAt: Date.now() });
      }),
    [draftKey],
  );

  const discardDraft = () => {
    clearDraft(draftKey);
    setRestored(false);
    setDirty(false);
    setError(null);
    applyState(existing ?? { name: '', description: '', color: PLAN_COLORS[0], exercises: [] });
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const update = (rowId: string, patch: Partial<PlanExercise>) => {
    setItems((xs) => xs.map((x) => (x.id === rowId ? { ...x, ...patch } : x)));
    setDirty(true);
  };

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    setItems((xs) => {
      const from = xs.findIndex((x) => x.id === e.active.id);
      const to = xs.findIndex((x) => x.id === e.over!.id);
      return arrayMove(xs, from, to);
    });
    setDirty(true);
  };

  const save = async (andStart = false) => {
    const input = { name, description, color, exercises: items };
    const err = validatePlan(input);
    if (err) {
      setError(err);
      return;
    }
    try {
      const pid = await savePlan(input, id);
      toast(id ? 'Plan gespeichert' : 'Plan erstellt', 'success');
      setDirty(false);
      clearDraft(draftKey);
      setRestored(false);
      if (andStart && !active) {
        await startWorkout({ planId: pid });
        nav('/workout');
      } else nav('/plans');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (id && existing === undefined) return <div className="page" />;
  if (id && existing === null)
    return (
      <div className="page">
        <PageHeader title="Plan nicht gefunden" back="/plans" />
      </div>
    );

  return (
    <div className="page">
      <PageHeader title={id ? 'Plan bearbeiten' : 'Neuer Plan'} back="/plans" />

      {restored && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl bg-area-train/10 px-4 py-3 text-[13px]">
          <span className="flex-1">Ungespeicherte Änderungen wiederhergestellt.</span>
          <button className="font-semibold text-muted hover:text-fg" onClick={discardDraft}>
            Verwerfen
          </button>
        </div>
      )}

      <div className="card space-y-4 p-4">
        <Field label="Name" htmlFor="plan-name">
          <input
            id="plan-name"
            className="field text-[17px] font-semibold"
            placeholder="z. B. Push Day"
            value={name}
            maxLength={50}
            onChange={(e) => (setName(e.target.value), setDirty(true), setError(null))}
          />
        </Field>
        <Field label="Beschreibung" htmlFor="plan-desc">
          <input
            id="plan-desc"
            className="field"
            placeholder="optional, z. B. Brust, Schultern & Trizeps"
            value={description}
            maxLength={120}
            onChange={(e) => (setDescription(e.target.value), setDirty(true))}
          />
        </Field>
        <div>
          <span className="label mb-2 block">Farbe</span>
          <div className="flex flex-wrap gap-2.5" role="radiogroup" aria-label="Farbe">
            {PLAN_COLORS.map((c) => (
              <button
                key={c}
                role="radio"
                aria-checked={color === c}
                aria-label={`Farbe ${c}`}
                onClick={() => (setColor(c), setDirty(true))}
                className={clsx('h-8 w-8 rounded-full transition', color === c ? 'ring-2 ring-fg ring-offset-2 ring-offset-surface' : 'opacity-80 hover:opacity-100')}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="mb-2.5 mt-6 flex items-center justify-between px-0.5">
        <h2 className="text-[17px] font-bold">
          Übungen <span className="num text-muted">({items.length})</span>
        </h2>
        {items.length > 1 && <span className="text-[12px] text-subtle">Zum Sortieren ziehen</span>}
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd} modifiers={[restrictToVerticalAxis]}>
        <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {items.map((it) => (
              <SortableRow
                key={it.id}
                item={it}
                note={notes?.find((n) => n.exerciseId === it.exerciseId)?.text}
                onChange={(p) => update(it.id, p)}
                onRemove={() => (setItems((xs) => xs.filter((x) => x.id !== it.id)), setDirty(true))}
                onRest={() => setRestFor(it.id)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <Button variant="secondary" size="lg" block className="mt-3 border border-dashed border-line" onClick={() => setPicker(true)} icon={<Plus size={18} />}>
        Übungen hinzufügen
      </Button>

      {error && <p className="mt-4 animate-shake text-center text-sm font-semibold text-bad">{error}</p>}

      <div className="mt-6 grid grid-cols-2 gap-2">
        <Button size="lg" onClick={() => save(true)} disabled={!!active} icon={<Play size={16} fill="currentColor" />}>
          Speichern & starten
        </Button>
        <Button variant="primary" size="lg" onClick={() => save(false)}>
          {dirty || !id ? 'Plan speichern' : 'Fertig'}
        </Button>
      </div>

      <ExercisePicker
        open={picker}
        onClose={() => setPicker(false)}
        onPick={(ids) => {
          setItems((xs) => [...xs, ...ids.map((x) => newPlanExercise(x))]);
          setDirty(true);
          setError(null);
        }}
      />
      <RestPicker
        open={!!restFor}
        onClose={() => setRestFor(null)}
        title="Pausenzeit für diese Übung"
        onPick={(sec) => restFor && update(restFor, { restSec: sec })}
      />
    </div>
  );
}

function SortableRow({
  item,
  note,
  onChange,
  onRemove,
  onRest,
}: {
  item: PlanExercise;
  note?: string;
  onChange: (p: Partial<PlanExercise>) => void;
  onRemove: () => void;
  onRest: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const exMap = useExerciseMap();
  const name = useExerciseName();
  const ex = exMap.get(item.exerciseId);
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={clsx('card p-3', isDragging && 'relative z-10 scale-[1.02] shadow-2xl ring-1 ring-accent/60')}
    >
      <div className="flex items-center gap-2">
        <button
          {...attributes}
          {...listeners}
          aria-label={`${name(ex)} verschieben`}
          className="flex h-10 w-8 cursor-grab touch-none items-center justify-center rounded-lg text-subtle hover:text-fg active:cursor-grabbing"
        >
          <GripVertical size={20} />
        </button>
        {ex && <MuscleIcon muscle={ex.muscleGroup} size={36} />}
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{name(ex)}</div>
          <div className="text-[12px] text-muted">{ex ? MUSCLE_LABELS[ex.muscleGroup] : 'Gelöschte Übung'}</div>
        </div>
        <IconButton label="Aus Plan entfernen" variant="danger" onClick={onRemove}>
          <Trash2 size={18} />
        </IconButton>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-2 pl-10">
        <div className="flex items-center rounded-xl bg-elevated">
          <button aria-label="Weniger Sätze" className="flex h-9 w-9 items-center justify-center text-muted hover:text-fg" onClick={() => onChange({ targetSets: Math.max(1, item.targetSets - 1) })}>
            <Minus size={15} />
          </button>
          <span className="num min-w-[4.5rem] text-center text-[13px] font-bold">{item.targetSets} Sätze</span>
          <button aria-label="Mehr Sätze" className="flex h-9 w-9 items-center justify-center text-muted hover:text-fg" onClick={() => onChange({ targetSets: Math.min(20, item.targetSets + 1) })}>
            <Plus size={15} />
          </button>
        </div>
        <input
          className="num h-9 w-24 rounded-xl bg-elevated px-3 text-center text-[13px] font-semibold outline-none placeholder:text-subtle focus:ring-1 focus:ring-accent"
          placeholder="Wdh-Ziel"
          aria-label="Ziel-Wiederholungen"
          value={item.targetReps}
          maxLength={12}
          onChange={(e) => onChange({ targetReps: e.target.value })}
        />
        <button onClick={onRest} className="flex h-9 items-center gap-1.5 rounded-xl bg-elevated px-3 text-[13px] font-semibold text-muted hover:text-fg">
          <Hourglass size={13} />
          {item.restSec != null ? formatClock(item.restSec * 1000) : 'Pause: Std.'}
        </button>
        {item.restSec != null && (
          <button onClick={() => onChange({ restSec: null })} className="text-[12px] font-semibold text-subtle hover:text-fg">
            zurücksetzen
          </button>
        )}
      </div>
      {note && (
        <div className="ml-10 mt-2 flex gap-1.5 rounded-lg bg-accent-soft/60 px-2.5 py-1.5 text-[12px]">
          <Pin size={12} className="mt-0.5 shrink-0" /> <span className="line-clamp-2">{note}</span>
        </div>
      )}
    </div>
  );
}
