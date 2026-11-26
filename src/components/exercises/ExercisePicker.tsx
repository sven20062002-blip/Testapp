import { useMemo, useState } from 'react';
import { Check, Plus, Search } from 'lucide-react';
import clsx from 'clsx';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { useExercises, useExerciseName } from '@/hooks/useData';
import { matchesSearch } from '@/db/repo/exercises';
import { CATEGORY_LABELS, MUSCLE_LABELS, MUSCLE_ORDER } from '@/lib/labels';
import type { MuscleGroup } from '@/db/types';
import { MuscleIcon } from './MuscleIcon';
import { ExerciseForm } from './ExerciseForm';

/** Multi-select exercise picker with search + muscle filter + inline creation. */
export function ExercisePicker({
  open,
  onClose,
  onPick,
  title = 'Übungen hinzufügen',
}: {
  open: boolean;
  onClose: () => void;
  onPick: (ids: string[]) => void | Promise<void>;
  title?: string;
}) {
  const all = useExercises();
  const name = useExerciseName();
  const [q, setQ] = useState('');
  const [muscle, setMuscle] = useState<MuscleGroup | 'all'>('all');
  const [sel, setSel] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  const list = useMemo(
    () =>
      (all ?? [])
        .filter((e) => !e.deletedAt && (muscle === 'all' || e.muscleGroup === muscle) && matchesSearch(e, q))
        .sort((a, b) => name(a).localeCompare(name(b), 'de')),
    [all, muscle, q, name],
  );
  const muscles = useMemo(() => MUSCLE_ORDER.filter((m) => (all ?? []).some((e) => !e.deletedAt && e.muscleGroup === m)), [all]);

  const close = () => {
    setSel([]);
    setQ('');
    onClose();
  };
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <>
      <Sheet
        open={open && !creating}
        onClose={close}
        title={title}
        tall
        size="lg"
        footer={
          <Button
            variant="primary"
            size="lg"
            block
            disabled={!sel.length}
            onClick={async () => {
              await onPick(sel);
              close();
            }}
          >
            {sel.length ? `${sel.length} ${sel.length === 1 ? 'Übung' : 'Übungen'} hinzufügen` : 'Übungen auswählen'}
          </Button>
        }
      >
        <div className="sticky top-0 z-10 -mx-5 bg-surface px-5 pb-3">
          <div className="relative">
            <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-subtle" />
            <input className="field pl-10" placeholder="Übung suchen …" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Übung suchen" />
          </div>
          <div className="scroll-x -mx-5 mt-3 px-5">
            <Chip active={muscle === 'all'} onClick={() => setMuscle('all')}>
              Alle
            </Chip>
            {muscles.map((m) => (
              <Chip key={m} active={muscle === m} onClick={() => setMuscle(m)}>
                {MUSCLE_LABELS[m]}
              </Chip>
            ))}
          </div>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="mb-1 flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left font-semibold text-fg hover:bg-elevated"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-dashed border-line text-muted">
            <Plus size={18} />
          </span>
          Eigene Übung erstellen
        </button>
        <ul className="divide-y divide-line/60">
          {list.map((e) => {
            const on = sel.includes(e.id);
            return (
              <li key={e.id}>
                <button
                  onClick={() => toggle(e.id)}
                  aria-pressed={on}
                  className={clsx('flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition', on && 'bg-accent-soft/60')}
                >
                  <MuscleIcon muscle={e.muscleGroup} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{name(e)}</div>
                    <div className="truncate text-[12.5px] text-muted">
                      {MUSCLE_LABELS[e.muscleGroup]} · {CATEGORY_LABELS[e.category]}
                      {e.isCustom ? ' · Eigene' : ''}
                    </div>
                  </div>
                  <span
                    className={clsx(
                      'flex h-7 w-7 items-center justify-center rounded-full border-2 transition',
                      on ? 'animate-check border-accent bg-accent text-accent-fg' : 'border-line',
                    )}
                  >
                    {on && <Check size={16} strokeWidth={3} />}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {!list.length && <p className="py-10 text-center text-[13px] text-muted">Keine Übung gefunden.</p>}
      </Sheet>
      <ExerciseForm open={creating} onClose={() => setCreating(false)} onSaved={(id) => setSel((s) => [...s, id])} />
    </>
  );
}
