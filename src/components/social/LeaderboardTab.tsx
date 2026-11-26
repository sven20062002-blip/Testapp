import { useState } from 'react';
import clsx from 'clsx';
import { Trophy } from 'lucide-react';
import { leaderboard, volumeLeaderboard } from '@/social/api';
import { useRemote } from '@/social/hooks';
import { useSettings } from '@/hooks/useData';
import { startOfWeek } from '@/lib/time';
import { fmtNumber, fmtVolume, fmtWeight } from '@/lib/units';
import { Segmented } from '@/components/ui/Segmented';
import { Empty } from '@/components/ui/Empty';
import { Avatar } from './Avatar';
import { ErrorNote, Skeleton, useSharedExercises } from './shared';

type Mode = 'week' | 'month' | 'e1rm' | 'max_weight';

export function LeaderboardTab() {
  const { unit } = useSettings();
  const exercises = useSharedExercises();
  const [mode, setMode] = useState<Mode>('week');
  const [ex, setEx] = useState('ex-bench-press');
  const since = mode === 'week' ? new Date(startOfWeek(Date.now())) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  const vol = useRemote(() => (mode === 'week' || mode === 'month' ? volumeLeaderboard(since.toISOString()) : Promise.resolve(null)), [mode]);
  const lift = useRemote(() => (mode === 'e1rm' || mode === 'max_weight' ? leaderboard(ex, mode) : Promise.resolve(null)), [mode, ex]);

  const rows =
    mode === 'week' || mode === 'month'
      ? (vol.data ?? []).map((r) => ({ ...r, main: fmtVolume(r.volume, unit, true), sub: `${r.workouts} Workouts · ${fmtNumber(r.sets)} Sätze`, value: r.volume }))
      : (lift.data ?? []).map((r) => ({
          ...r,
          main: mode === 'e1rm' ? `≈ ${fmtWeight(r.value, unit)}` : fmtWeight(r.value, unit),
          sub: mode === 'max_weight' && r.reps ? `× ${r.reps} Wdh · ${new Date(r.achieved_at).toLocaleDateString('de-DE')}` : new Date(r.achieved_at).toLocaleDateString('de-DE'),
          value: r.value,
        }));
  const st = mode === 'week' || mode === 'month' ? vol : lift;

  return (
    <div>
      <Segmented
        value={mode}
        onChange={setMode}
        size="sm"
        label="Rangliste"
        options={[
          { value: 'week', label: 'Woche' },
          { value: 'month', label: 'Monat' },
          { value: 'e1rm', label: '1RM' },
          { value: 'max_weight', label: 'Max. Gewicht' },
        ]}
      />
      {(mode === 'e1rm' || mode === 'max_weight') && (
        <select className="field mt-3" value={ex} onChange={(e) => setEx(e.target.value)} aria-label="Übung">
          {exercises.map((e) => (
            <option key={e.key} value={e.key}>
              {e.name}
            </option>
          ))}
        </select>
      )}
      <p className="mt-2 px-1 text-[11.5px] text-subtle">
        {mode === 'week' ? 'Trainingsvolumen seit Montag' : mode === 'month' ? 'Trainingsvolumen in diesem Monat' : mode === 'e1rm' ? 'Bestes geschätztes 1RM (Epley) – aller Zeiten' : 'Höchstes bewegtes Gewicht – aller Zeiten'}
        {' · '}du und deine Freunde
      </p>
      <div className="mt-3">
        {st.loading && !st.data && <Skeleton rows={3} />}
        {st.error && !st.data && <ErrorNote error={st.error} onRetry={st.refresh} />}
        {st.data && !rows.length && <Empty icon={<Trophy size={26} />} title="Noch keine Einträge" text="Sobald ihr Workouts mit dieser Übung absolviert habt, erscheint hier die Rangliste." />}
        {rows.length > 0 && (
          <ol className="card divide-y divide-line/50">
            {rows.map((r, i) => (
              <li key={r.user_id} className={clsx('flex items-center gap-3 px-4 py-3', r.is_me && 'bg-area-social/[0.06]')}>
                <span
                  className={clsx(
                    'num flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12.5px] font-bold',
                    i === 0 && r.value > 0 ? 'bg-[#FACC15] text-black' : i === 1 && r.value > 0 ? 'bg-[#CBD5E1] text-black' : i === 2 && r.value > 0 ? 'bg-[#D97706] text-white' : 'bg-elevated text-muted',
                  )}
                >
                  {i + 1}
                </span>
                <Avatar name={r.display_name} color={r.color} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-semibold">{r.is_me ? 'Du' : r.display_name}</div>
                  <div className="truncate text-[11.5px] text-muted">{r.sub}</div>
                </div>
                <div className="num shrink-0 text-[15px] font-semibold">{r.main}</div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
