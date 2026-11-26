import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Dumbbell, Plus, Search } from 'lucide-react';
import { useExercises, useExerciseName } from '@/hooks/useData';
import { matchesSearch } from '@/db/repo/exercises';
import { CATEGORY_LABELS, MUSCLE_LABELS, MUSCLE_ORDER } from '@/lib/labels';
import type { ExerciseCategory, MuscleGroup } from '@/db/types';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Chip, Badge } from '@/components/ui/Chip';
import { Empty } from '@/components/ui/Empty';
import { MuscleIcon } from '@/components/exercises/MuscleIcon';
import { ExerciseForm } from '@/components/exercises/ExerciseForm';

export default function ExercisesPage() {
  const all = useExercises();
  const name = useExerciseName();
  const [q, setQ] = useState('');
  const [muscle, setMuscle] = useState<MuscleGroup | 'all'>('all');
  const [cat, setCat] = useState<ExerciseCategory | 'all' | 'custom'>('all');
  const [creating, setCreating] = useState(false);

  const visible = useMemo(() => (all ?? []).filter((e) => !e.deletedAt), [all]);
  const list = useMemo(
    () =>
      visible
        .filter(
          (e) =>
            (muscle === 'all' || e.muscleGroup === muscle) &&
            (cat === 'all' || (cat === 'custom' ? e.isCustom === 1 : e.category === cat)) &&
            matchesSearch(e, q),
        )
        .sort((a, b) => name(a).localeCompare(name(b), 'de')),
    [visible, muscle, cat, q, name],
  );
  const muscles = MUSCLE_ORDER.filter((m) => visible.some((e) => e.muscleGroup === m));

  // group by first letter for scannability
  const groups = useMemo(() => {
    const g = new Map<string, typeof list>();
    for (const e of list) {
      const k = name(e).charAt(0).toUpperCase();
      g.set(k, [...(g.get(k) ?? []), e]);
    }
    return [...g.entries()];
  }, [list, name]);

  return (
    <div className="page">
      <PageHeader
        title="Übungen"
        subtitle={`${visible.length} Übungen in deiner Bibliothek`}
        back={undefined}
        actions={
          <Button variant="primary" onClick={() => setCreating(true)} icon={<Plus size={18} />}>
            Eigene
          </Button>
        }
      />
      <div className="sticky top-0 z-20 -mx-4 bg-bg/90 px-4 pb-3 pt-2 backdrop-blur-xl sm:-mx-6 sm:px-6" style={{ top: 0 }}>
        <div className="relative">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-subtle" />
          <input className="field bg-surface pl-10" placeholder="Name suchen (deutsch oder englisch) …" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Übungen suchen" />
        </div>
        <div className="scroll-x -mx-4 mt-3 px-4 sm:-mx-6 sm:px-6">
          <Chip active={muscle === 'all'} onClick={() => setMuscle('all')}>
            Alle Muskeln
          </Chip>
          {muscles.map((m) => (
            <Chip key={m} active={muscle === m} onClick={() => setMuscle(m)}>
              {MUSCLE_LABELS[m]}
            </Chip>
          ))}
        </div>
        <div className="scroll-x -mx-4 mt-2 px-4 sm:-mx-6 sm:px-6">
          <Chip active={cat === 'all'} onClick={() => setCat('all')}>
            Alle Kategorien
          </Chip>
          {(Object.keys(CATEGORY_LABELS) as ExerciseCategory[])
            .filter((c) => visible.some((e) => e.category === c))
            .map((c) => (
              <Chip key={c} active={cat === c} onClick={() => setCat(c)}>
                {CATEGORY_LABELS[c]}
              </Chip>
            ))}
          {visible.some((e) => e.isCustom) && (
            <Chip active={cat === 'custom'} onClick={() => setCat('custom')}>
              Eigene
            </Chip>
          )}
        </div>
      </div>

      {list.length === 0 && all && (
        <Empty
          icon={<Dumbbell size={28} />}
          title="Keine Übung gefunden"
          text="Passe Suche oder Filter an – oder lege eine eigene Übung an."
          action={
            <Button variant="primary" onClick={() => setCreating(true)} icon={<Plus size={18} />}>
              Übung erstellen
            </Button>
          }
        />
      )}

      <div className="mt-1 space-y-4">
        {groups.map(([letter, items]) => (
          <section key={letter}>
            <div className="label mb-1.5 px-1">{letter}</div>
            <ul className="card divide-y divide-line/60 overflow-hidden">
              {items.map((e) => (
                <li key={e.id}>
                  <Link to={`/exercises/${e.id}`} className="flex items-center gap-3 px-3.5 py-3 transition hover:bg-elevated/50">
                    <MuscleIcon muscle={e.muscleGroup} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-semibold">{name(e)}</span>
                        {e.isCustom === 1 && <Badge tone="accent">Eigene</Badge>}
                      </div>
                      <div className="truncate text-[12.5px] text-muted">
                        {MUSCLE_LABELS[e.muscleGroup]} · {CATEGORY_LABELS[e.category]}
                      </div>
                    </div>
                    <ChevronRight size={18} className="text-subtle" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <ExerciseForm open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}
