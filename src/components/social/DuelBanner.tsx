import { Link } from 'react-router-dom';
import { Swords } from 'lucide-react';
import { duelScores } from '@/social/api';
import { useActiveDuels, useRemote } from '@/social/hooks';
import { useNow, useSettings } from '@/hooks/useData';
import type { DuelSummary } from '@/social/types';
import { fmtScore, remaining } from './shared';

/** Live score of running duels, shown on the active workout screen. */
export function DuelBanner() {
  const duels = useActiveDuels();
  if (!duels.length) return null;
  return (
    <div className="mt-3 space-y-2">
      {duels.map((d) => (
        <Banner key={d.id} d={d} />
      ))}
    </div>
  );
}

function Banner({ d }: { d: DuelSummary }) {
  const { unit } = useSettings();
  const now = useNow(true, 1000);
  const { data } = useRemote(() => duelScores(d.id), [d.id], [{ table: 'duel_sets', filter: `duel_id=eq.${d.id}` }], { pollMs: 10_000, events: ['forge:duel-set'] });
  const me = data?.find((s) => s.is_me)?.score ?? 0;
  const op = data?.find((s) => !s.is_me)?.score ?? 0;
  const total = me + op || 1;
  return (
    <Link to={`/social/duel/${d.id}`} className="block overflow-hidden rounded-2xl bg-area-social/10 p-3 ring-1 ring-area-social/40">
      <div className="flex items-center justify-between text-[12px] font-semibold">
        <span className="flex items-center gap-1.5 text-area-social">
          <Swords size={14} /> Duell vs. {d.opponent_display_name}
        </span>
        <span className="num text-muted">noch {d.ends_at ? remaining(d.ends_at, now) : '–'}</span>
      </div>
      <div className="num mt-1.5 flex items-baseline justify-between text-[15px] font-semibold">
        <span>Du {fmtScore(d.metric, me, unit)}</span>
        <span className="text-muted">{fmtScore(d.metric, op, unit)}</span>
      </div>
      <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-elevated">
        <div className="h-full bg-area-social transition-all duration-500" style={{ width: `${(me / total) * 100}%` }} />
      </div>
      <div className="mt-1 text-[11px] text-subtle">{d.exercise_name ? `Nur ${d.exercise_name} zählt` : 'Jede Übung zählt'} · Sätze werden automatisch übertragen</div>
    </Link>
  );
}
