import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import clsx from 'clsx';
import { LogOut } from 'lucide-react';
import { challengeScores, leaveChallenge, myChallenges } from '@/social/api';
import { useRemote, useSocial } from '@/social/hooks';
import { METRIC_LABELS } from '@/social/types';
import { useNow, useSettings } from '@/hooks/useData';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { useFeedback } from '@/components/ui/Feedback';
import { Avatar } from '@/components/social/Avatar';
import { ErrorNote, Skeleton, fmtScore, remaining } from '@/components/social/shared';

export default function ChallengePage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const { unit } = useSettings();
  const { confirm, toast } = useFeedback();
  const social = useSocial();
  const myId = social.status === 'ready' ? social.session.user.id : null;
  const now = useNow(true, 30_000);
  const list = useRemote(() => myChallenges(), [id]);
  const scores = useRemote(() => challengeScores(id), [id], [{ table: 'challenge_members', filter: `challenge_id=eq.${id}` }]);
  const c = useMemo(() => list.data?.find((x) => x.id === id), [list.data, id]);

  if (list.loading && !list.data) return <div className="page"><Skeleton /></div>;
  if (list.error && !list.data) return <div className="page"><ErrorNote error={list.error} onRetry={list.refresh} /></div>;
  if (!c)
    return (
      <div className="page">
        <PageHeader back="/social" title="Challenge nicht gefunden" />
      </div>
    );
  const ended = Date.parse(c.ends_at) <= now;
  const start = new Date(c.starts_at).toLocaleDateString('de-DE', { day: '2-digit', month: 'short' });
  const end = new Date(c.ends_at).toLocaleDateString('de-DE', { day: '2-digit', month: 'short' });
  const rows = scores.data ?? [];
  const best = Math.max(1, ...rows.map((r) => r.score ?? 0));

  return (
    <div className="page">
      <PageHeader back="/social" title={c.title} area="social" subtitle={`${METRIC_LABELS[c.metric]}${c.exercise_name ? ` · ${c.exercise_name}` : ''}`} />
      <div className="grid grid-cols-2 gap-2.5">
        <div className="card p-4">
          <div className="text-[12px] text-muted">Zeitraum</div>
          <div className="mt-1 text-[15px] font-semibold">
            {start} – {end}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-[12px] text-muted">{ended ? 'Status' : 'Verbleibend'}</div>
          <div className="num mt-1 text-[15px] font-semibold">{ended ? 'Beendet' : remaining(c.ends_at, now)}</div>
        </div>
      </div>

      <h2 className="mb-3 mt-8 text-[17px] font-semibold">Rangliste</h2>
      {scores.loading && !scores.data && <Skeleton rows={3} />}
      {scores.error && !scores.data && <ErrorNote error={scores.error} onRetry={scores.refresh} />}
      <ol className="space-y-2">
        {rows.map((r) => (
          <li key={r.user_id} className={clsx('card p-4', r.is_me && 'ring-1 ring-area-social/50')}>
            <div className="flex items-center gap-3">
              <span className="num w-6 text-center text-[15px] font-bold text-muted">{r.rank ?? '–'}</span>
              <Avatar name={r.display_name} color={r.color} size={36} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-semibold">
                  {r.is_me ? 'Du' : r.display_name}
                  {r.rank === 1 && (r.score ?? 0) > 0 && ' 🏆'}
                </div>
                <div className="text-[12px] text-muted">{r.status === 'invited' ? 'eingeladen' : `@${r.username}`}</div>
              </div>
              <div className="num text-[16px] font-semibold">{r.status === 'joined' ? fmtScore(c.metric, r.score, unit) : '–'}</div>
            </div>
            {r.status === 'joined' && (
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-elevated">
                <div className="h-full rounded-full bg-area-social transition-all duration-700" style={{ width: `${((r.score ?? 0) / best) * 100}%` }} />
              </div>
            )}
          </li>
        ))}
      </ol>
      <p className="mt-4 text-[12px] text-subtle">Gewertet werden alle in Forge beendeten Workouts im Zeitraum. Die Rangliste aktualisiert sich, sobald jemand ein Workout abschließt.</p>
      <Button
        variant="ghost"
        block
        className="mt-6"
        icon={<LogOut size={16} />}
        onClick={async () => {
          const creator = c.creator === myId;
          if (await confirm({ title: creator ? 'Challenge löschen?' : 'Challenge verlassen?', text: creator ? 'Du hast sie erstellt – sie wird für alle gelöscht.' : undefined, confirmLabel: creator ? 'Löschen' : 'Verlassen', danger: true })) {
            await leaveChallenge(c.id).then(() => (toast('Erledigt', 'info'), nav('/social')), (e) => toast(e.message, 'error'));
          }
        }}
      >
        Challenge verlassen
      </Button>
    </div>
  );
}
