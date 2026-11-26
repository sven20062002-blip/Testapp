import type { MuscleGroup } from '@/db/types';
import clsx from 'clsx';

/** Compact colored monogram badge per muscle group (illustrative marker). */
const HUE: Record<MuscleGroup, number> = {
  chest: 0,
  back: 210,
  shoulders: 30,
  biceps: 280,
  triceps: 320,
  forearms: 250,
  quads: 140,
  hamstrings: 170,
  glutes: 350,
  calves: 190,
  core: 50,
  fullbody: 75,
  cardio: 10,
};
const ABBR: Record<MuscleGroup, string> = {
  chest: 'Br',
  back: 'Rü',
  shoulders: 'Sc',
  biceps: 'Bi',
  triceps: 'Tr',
  forearms: 'Ua',
  quads: 'Qu',
  hamstrings: 'Bb',
  glutes: 'Gs',
  calves: 'Wa',
  core: 'Co',
  fullbody: 'GK',
  cardio: 'Ca',
};

export function MuscleIcon({ muscle, size = 40, className }: { muscle: MuscleGroup; size?: number; className?: string }) {
  const h = HUE[muscle];
  return (
    <div
      aria-hidden
      className={clsx('flex shrink-0 items-center justify-center rounded-xl font-bold tracking-tight', className)}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        background: `linear-gradient(145deg, hsl(${h} 70% 55% / .22), hsl(${h} 70% 45% / .10))`,
        color: `hsl(${h} 85% 62%)`,
        boxShadow: `inset 0 0 0 1px hsl(${h} 70% 55% / .25)`,
      }}
    >
      {ABBR[muscle]}
    </div>
  );
}
