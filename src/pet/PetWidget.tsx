import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { Kettli } from './Kettli';
import { usePet, usePetView, useTodayQuests } from './hooks';
import { CURRENCY } from './model';

/** Home-screen tile: Kettli, its level and today's quest progress. */
export function PetWidget({ compact }: { compact?: boolean }) {
  const pet = usePet();
  const { quests } = useTodayQuests();
  const mains = quests?.filter((q) => q.id !== 'bonus') ?? [];
  const claimed = mains.filter((q) => q.claimed).length;
  const ready = mains.filter((q) => q.done && !q.claimed).length;
  const view = usePetView(pet, claimed);
  if (!pet || !view) return <div className="card h-full min-h-[112px]" />;
  const kettli = <Kettli skin={pet.equipped.skin} accessory={pet.equipped.accessory} level={view.level} mood={view.mood} size={compact ? 74 : 104} />;
  if (compact)
    return (
      <Link to="/pet" className="chip-pet card flex h-full flex-col items-center p-2.5 pb-3 text-center">
        {kettli}
        <span className="text-[12.5px] font-semibold">{pet.name}</span>
        <span className="text-[10.5px] text-muted">
          Lv {view.level} · {claimed}/3 Aufgaben
        </span>
        {ready > 0 && <span className="nav-pill nav-ink mt-1 rounded-full px-2 py-0.5 text-[10px] font-bold">{ready} zum Abholen</span>}
      </Link>
    );
  return (
    <Link to="/pet" className="chip-pet card flex items-center gap-3 p-3 pr-3.5">
      <div className="-my-1 shrink-0">{kettli}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[15px] font-bold">{pet.name}</span>
          <ChevronRight size={16} className="shrink-0 text-subtle" />
        </div>
        <div className="text-[11.5px] text-muted">
          Level {view.level} · {pet.coins} {CURRENCY}
          {pet.streak > 1 ? ` · 🔥 ${pet.streak}` : ''}
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-elevated">
          <div className="nav-dot h-full rounded-full transition-[width] duration-700" style={{ width: `${Math.max(3, view.pct * 100)}%` }} />
        </div>
        <div className="mt-2 flex gap-1">
          {mains.map((q) => (
            <span
              key={q.id}
              className={`h-1.5 flex-1 rounded-full ${q.claimed ? 'nav-dot' : q.done ? 'nav-dot animate-pulse opacity-60' : 'bg-elevated'}`}
              title={q.title}
            />
          ))}
        </div>
        <div className="mt-1 text-[11px] font-medium text-muted">
          {ready > 0 ? <span className="nav-ink font-semibold">{ready} Belohnung{ready > 1 ? 'en' : ''} bereit!</span> : `${claimed} von 3 Tagesaufgaben erledigt`}
        </div>
      </div>
    </Link>
  );
}
