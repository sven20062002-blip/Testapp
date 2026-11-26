import { Link } from 'react-router-dom';
import { ChevronRight, Hourglass, Pause } from 'lucide-react';
import type { Workout } from '@/db/types';
import { useNow, useRest } from '@/hooks/useData';
import { clockElapsedMs, formatClock, formatHMS, restRemainingMs } from '@/lib/time';

/** Floating mini-player: always one tap back to the running workout & both timers. */
export function ActiveWorkoutBar({ workout }: { workout: Workout }) {
  const rest = useRest();
  const now = useNow(true, 500);
  const restActive = rest.workoutId === workout.id && (rest.status === 'running' || rest.status === 'paused');
  return (
    <Link
      to="/workout"
      className="fixed inset-x-3 bottom-[calc(var(--nav-h)+var(--safe-bottom)+18px)] z-40 mx-auto flex max-w-md items-center gap-3 rounded-[22px] bg-surface/90 p-2.5 pl-4 shadow-[0_10px_40px_-10px_rgb(0_0_0/0.45),0_0_0_0.5px_rgb(var(--fg)/0.08)] backdrop-blur-2xl animate-rise lg:bottom-6 lg:left-auto lg:right-6 lg:mx-0 lg:w-96"
      aria-label="Zum laufenden Workout"
    >
      <span className="relative flex h-2.5 w-2.5">
        <span className={workout.pausedAt ? 'h-2.5 w-2.5 rounded-full bg-warn' : 'h-2.5 w-2.5 animate-pulse-ring rounded-full bg-accent'} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-semibold text-muted">{workout.name}</div>
        <div className="num flex items-center gap-1.5 text-[17px] font-bold">
          {workout.pausedAt && <Pause size={14} className="text-warn" />}
          {formatHMS(clockElapsedMs(workout, now))}
        </div>
      </div>
      {restActive && (
        <div className="num flex items-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-[15px] font-bold text-accent-fg">
          <Hourglass size={15} />
          {formatClock(restRemainingMs(rest, now), true)}
        </div>
      )}
      <ChevronRight size={20} className="text-subtle" />
    </Link>
  );
}
