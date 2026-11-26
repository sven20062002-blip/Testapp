import clsx from 'clsx';
import { Clock, Dumbbell, Trophy, Weight } from 'lucide-react';
import { feed, react } from '@/social/api';
import { useRemote } from '@/social/hooks';
import { REACTIONS, type FeedItem, type Reaction } from '@/social/types';
import { useSettings } from '@/hooks/useData';
import { formatDuration } from '@/lib/time';
import { fmtVolume, fmtWeight } from '@/lib/units';
import { useFeedback } from '@/components/ui/Feedback';
import { Empty } from '@/components/ui/Empty';
import { Avatar } from './Avatar';
import { ago, ErrorNote, Skeleton } from './shared';

export function FeedTab() {
  const { data, error, loading, refresh } = useRemote(() => feed(40), [], [{ table: 'reactions' }, { table: 'friendships' }]);
  if (loading && !data) return <Skeleton />;
  if (error && !data) return <ErrorNote error={error} onRetry={refresh} />;
  if (!data?.length)
    return <Empty icon={<Dumbbell size={28} />} title="Noch keine Aktivität" text="Hier erscheinen deine Workouts und die deiner Freunde – sobald jemand trainiert hat." />;
  return (
    <div className="space-y-3">
      {data.map((it) => (
        <FeedCard key={it.workout_id} it={it} onChange={refresh} />
      ))}
    </div>
  );
}

function FeedCard({ it, onChange }: { it: FeedItem; onChange: () => void }) {
  const { unit } = useSettings();
  const { toast } = useFeedback();
  const toggle = async (e: Reaction) => {
    try {
      await react(it.workout_id, it.my_reaction === e ? null : e);
      onChange();
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };
  return (
    <article className="card p-4 animate-rise">
      <header className="flex items-center gap-3">
        <Avatar name={it.display_name} color={it.color} size={40} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold">
            {it.is_me ? 'Du' : it.display_name} <span className="font-normal text-muted">hat trainiert</span>
          </div>
          <div className="text-[12px] text-subtle">
            @{it.username} · {ago(it.ended_at)}
          </div>
        </div>
        {it.pr_count > 0 && (
          <span className="chip chip-social gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold">
            <Trophy size={12} /> {it.pr_count} PR
          </span>
        )}
      </header>
      <h3 className="mt-3 text-[17px] font-semibold tracking-[-0.01em]">{it.name}</h3>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted">
        <span className="flex items-center gap-1.5">
          <Clock size={13} /> {formatDuration(it.duration_sec)}
        </span>
        <span className="flex items-center gap-1.5">
          <Weight size={13} /> {fmtVolume(it.total_volume, unit, true)}
        </span>
        <span className="flex items-center gap-1.5">
          <Dumbbell size={13} /> {it.total_sets} Sätze
        </span>
      </div>
      {!!it.top_exercises?.length && (
        <ul className="mt-3 space-y-1.5 rounded-2xl bg-elevated/60 p-3">
          {it.top_exercises.map((e) => (
            <li key={e.name} className="flex justify-between gap-3 text-[13px]">
              <span className="truncate">{e.name}</span>
              <span className="num shrink-0 text-muted">{e.top_weight ? `${fmtWeight(e.top_weight, unit)} × ${e.top_weight_reps}` : fmtVolume(e.volume, unit)}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex gap-1.5">
        {REACTIONS.map((e) => {
          const n = it.reactions?.[e] ?? 0;
          const mine = it.my_reaction === e;
          return (
            <button
              key={e}
              onClick={() => toggle(e)}
              aria-pressed={mine}
              aria-label={`Reaktion ${e}${n ? ` (${n})` : ''}`}
              className={clsx(
                'flex h-9 items-center gap-1 rounded-full px-3 text-[14px] transition active:scale-95',
                mine ? 'bg-area-social/20 ring-1 ring-area-social/60' : 'bg-elevated hover:bg-line',
              )}
            >
              <span>{e}</span>
              {n > 0 && <span className="num text-[12px] font-semibold text-muted">{n}</span>}
            </button>
          );
        })}
      </div>
    </article>
  );
}
