import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate } from 'react-router-dom';
import { Copy, ListChecks, MoreHorizontal, Pencil, Play, Plus, Trash2, BookOpen } from 'lucide-react';
import { db } from '@/db/db';
import type { Plan } from '@/db/types';
import { deletePlan, duplicatePlan } from '@/db/repo/plans';
import { startWorkout } from '@/db/repo/workouts';
import { useActiveWorkout, useExerciseMap, useExerciseName } from '@/hooks/useData';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button, IconButton } from '@/components/ui/Button';
import { Empty } from '@/components/ui/Empty';
import { Sheet } from '@/components/ui/Sheet';
import { useFeedback } from '@/components/ui/Feedback';
import { MenuItem, MenuList } from '@/components/workout/ExerciseCard';
import { relativeDay } from '@/lib/time';
import { unlockAudio } from '@/services/feedback';

export default function PlansPage() {
  const plans = useLiveQuery(() => db.plans.orderBy('name').toArray(), []);
  const nav = useNavigate();
  const active = useActiveWorkout();
  const exMap = useExerciseMap();
  const name = useExerciseName();
  const { confirm, toast } = useFeedback();
  const [menu, setMenu] = useState<Plan | null>(null);

  const start = async (p: Plan) => {
    unlockAudio();
    if (active) {
      toast('Es läuft bereits ein Workout', 'warn');
      nav('/workout');
      return;
    }
    await startWorkout({ planId: p.id });
    nav('/workout');
  };

  return (
    <div className="page">
      <PageHeader
        title="Trainingspläne"
        subtitle="Gespeicherte Abläufe – mit einem Tipp starten"
        actions={
          <>
            <Link to="/exercises" className="hidden h-11 items-center gap-2 rounded-xl bg-elevated px-4 text-[15px] font-semibold sm:flex lg:hidden">
              <BookOpen size={17} /> Übungen
            </Link>
            <Button variant="primary" onClick={() => nav('/plans/new')} icon={<Plus size={18} />}>
              Neu
            </Button>
          </>
        }
      />
      <Link to="/exercises" className="mb-4 flex items-center gap-3 rounded-2xl bg-elevated/70 px-4 py-3 text-[14px] font-semibold sm:hidden">
        <BookOpen size={18} className="text-muted" /> Übungsbibliothek öffnen
      </Link>

      {plans && plans.length === 0 && (
        <Empty
          icon={<ListChecks size={28} />}
          title="Noch keine Trainingspläne"
          text="Speichere komplette Abläufe wie Push, Pull oder Leg Day und starte sie mit einem Tipp."
          action={
            <Button variant="primary" onClick={() => nav('/plans/new')} icon={<Plus size={18} />}>
              Plan erstellen
            </Button>
          }
        />
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {plans?.map((p, i) => (
          <article key={p.id} className="card flex flex-col p-4 animate-rise" style={{ animationDelay: `${i * 30}ms` }}>
            <div className="flex items-start gap-3">
              <span className="mt-1 h-9 w-1.5 shrink-0 rounded-full" style={{ background: p.color }} />
              <Link to={`/plans/${p.id}`} className="min-w-0 flex-1">
                <h2 className="truncate text-[17px] font-bold">{p.name}</h2>
                <p className="truncate text-[13px] text-muted">{p.description || `${p.exercises.length} Übungen`}</p>
              </Link>
              <IconButton label={`Optionen für ${p.name}`} onClick={() => setMenu(p)}>
                <MoreHorizontal size={20} />
              </IconButton>
            </div>
            <ul className="mt-3 flex-1 space-y-1 text-[13px]">
              {p.exercises.slice(0, 5).map((e) => (
                <li key={e.id} className="flex justify-between gap-2">
                  <span className="truncate text-fg/90">{name(exMap.get(e.exerciseId))}</span>
                  <span className="num shrink-0 text-subtle">
                    {e.targetSets} × {e.targetReps || '–'}
                  </span>
                </li>
              ))}
              {p.exercises.length > 5 && <li className="text-subtle">+ {p.exercises.length - 5} weitere</li>}
            </ul>
            <div className="mt-4 flex items-center gap-2">
              <span className="flex-1 text-[12px] text-subtle">{p.lastUsedAt ? `Zuletzt ${relativeDay(p.lastUsedAt).toLowerCase()}` : 'Noch nie trainiert'}</span>
              <Button variant="primary" size="sm" onClick={() => start(p)} icon={<Play size={14} fill="currentColor" />}>
                Starten
              </Button>
            </div>
          </article>
        ))}
      </div>

      <Sheet open={!!menu} onClose={() => setMenu(null)} title={menu?.name}>
        {menu && (
          <MenuList>
            <MenuItem icon={<Play size={18} />} onClick={() => (setMenu(null), start(menu))}>
              Starten
            </MenuItem>
            <MenuItem icon={<Pencil size={18} />} onClick={() => nav(`/plans/${menu.id}`)}>
              Bearbeiten
            </MenuItem>
            <MenuItem
              icon={<Copy size={18} />}
              onClick={async () => {
                setMenu(null);
                await duplicatePlan(menu.id);
                toast('Plan dupliziert', 'success');
              }}
            >
              Duplizieren
            </MenuItem>
            <MenuItem
              icon={<Trash2 size={18} />}
              danger
              onClick={async () => {
                const p = menu;
                setMenu(null);
                if (await confirm({ title: `„${p.name}“ löschen?`, text: 'Der Plan wird gelöscht. Bereits absolvierte Workouts bleiben im Verlauf erhalten.', confirmLabel: 'Löschen', danger: true })) {
                  await deletePlan(p.id);
                  toast('Plan gelöscht', 'info');
                }
              }}
            >
              Löschen
            </MenuItem>
          </MenuList>
        )}
      </Sheet>
    </div>
  );
}
