import { useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import clsx from 'clsx';
import { Swords, Trophy } from 'lucide-react';
import { cancelDuel, closeDuel, duelScores, myDuels } from '@/social/api';
import { useRemote } from '@/social/hooks';
import { useActiveWorkout, useNow, useSettings } from '@/hooks/useData';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { useFeedback } from '@/components/ui/Feedback';
import { Avatar } from '@/components/social/Avatar';
import { ErrorNote, Skeleton, fmtScore, remaining } from '@/components/social/shared';

export default function DuelPage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const { unit } = useSettings();
  const { toast, confirm } = useFeedback();
  const active = useActiveWorkout();
  const now = useNow(true, 1000);
  const duels = useRemote(() => myDuels(), [id], [{ table: 'duels', filter: `id=eq.${id}` }]);
  const scores = useRemote(() => duelScores(id), [id], [{ table: 'duel_sets', filter: `duel_id=eq.${id}` }], { pollMs: 10_000, events: ['forge:duel-set'] });
  const d = useMemo(() => duels.data?.find((x) => x.id === id), [duels.data, id]);
  const ended = d?.ends_at ? Date.parse(d.ends_at) <= now : false;

  // close the duel on the server once the time is up (idempotent)
  useEffect(() => {
    if (d?.status === 'active' && ended) void closeDuel(d.id).then(() => duels.refresh());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d?.status, ended]);

  if (duels.loading && !duels.data) return <div className="page"><Skeleton /></div>;
  if (duels.error && !duels.data) return <div className="page"><ErrorNote error={duels.error} onRetry={duels.refresh} /></div>;
  if (!d)
    return (
      <div className="page">
        <PageHeader back="/social" title="Duell nicht gefunden" />
      </div>
    );

  const me = scores.data?.find((s) => s.is_me);
  const op = scores.data?.find((s) => !s.is_me);
  const myScore = me?.score ?? 0;
  const opScore = op?.score ?? 0;
  const total = myScore + opScore || 1;
  const finished = d.status === 'finished' || (d.status === 'active' && ended);
  const live = d.status === 'active' && !ended;
  const outcome = myScore > opScore ? 'win' : myScore < opScore ? 'loss' : 'draw';

  return (
    <div className="page">
      <PageHeader back="/social" title="Live-Duell" area="social" subtitle={`${d.exercise_name ?? 'Alle Übungen'} · ${d.metric === 'volume' ? 'Volumen' : 'Wiederholungen'} · ${d.duration_min} min`} />

      <div className="card relative overflow-hidden p-4">
        <div aria-hidden className="pointer-events-none absolute -left-16 -top-16 h-48 w-48 rounded-full bg-area-train/15 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-16 -right-16 h-48 w-48 rounded-full bg-area-social/20 blur-3xl" />
        <div className="relative text-center">
          {live && (
            <div className="inline-flex items-center gap-2 rounded-full bg-area-social/15 px-3 py-1 text-[11.5px] font-semibold text-area-social">
              <span className="h-2 w-2 animate-pulse rounded-full bg-area-social" /> LIVE · noch {d.ends_at ? remaining(d.ends_at, now) : ''}
            </div>
          )}
          {d.status === 'pending' && <div className="text-[12.5px] font-medium text-muted">Wartet auf Annahme durch {d.i_am_challenger ? d.opponent_display_name : 'dich'}</div>}
          {finished && (
            <div className={clsx('inline-flex items-center gap-2 rounded-full px-3 py-1 text-[12.5px] font-semibold', outcome === 'win' ? 'bg-good/15 text-good' : outcome === 'loss' ? 'bg-elevated text-muted' : 'bg-elevated')}>
              {outcome === 'win' ? <><Trophy size={14} /> Du hast gewonnen!</> : outcome === 'loss' ? `${d.opponent_display_name} hat gewonnen` : 'Unentschieden'}
            </div>
          )}
          {(d.status === 'cancelled' || d.status === 'declined') && <div className="text-[12.5px] text-muted">{d.status === 'cancelled' ? 'Abgebrochen' : 'Abgelehnt'}</div>}

          <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <Side name="Du" display={me?.display_name ?? 'Du'} color={me?.color ?? '#CDFF40'} score={fmtScore(d.metric, myScore, unit)} sets={me?.sets ?? 0} lead={myScore > opScore} />
            <Swords size={22} className="text-subtle" />
            <Side name={d.opponent_display_name} display={d.opponent_display_name} color={d.opponent_color} score={fmtScore(d.metric, opScore, unit)} sets={op?.sets ?? 0} lead={opScore > myScore} />
          </div>
          <div className="mt-5 flex h-2.5 overflow-hidden rounded-full bg-elevated">
            <div className="h-full bg-area-train transition-all duration-700" style={{ width: `${(myScore / total) * 100}%` }} />
            <div className="h-full flex-1 bg-area-social/70" />
          </div>
        </div>
      </div>

      {live && (
        <div className="mt-4">
          {active ? (
            <Button variant="primary" size="lg" block onClick={() => nav('/workout')}>
              Zurück zum Training – Sätze zählen automatisch
            </Button>
          ) : (
            <Button variant="primary" size="lg" block onClick={() => nav('/workout?start=1')}>
              Workout starten & mitmachen
            </Button>
          )}
          <p className="mt-2 text-center text-[11.5px] text-subtle">
            Jeder abgeschlossene Satz {d.exercise_name ? `bei ${d.exercise_name} ` : ''}wird sofort übertragen. Aufwärmsätze zählen nicht.
          </p>
        </div>
      )}
      {(d.status === 'pending' || live) && (
        <Button
          variant="ghost"
          block
          className="mt-3"
          onClick={async () => {
            if (await confirm({ title: 'Duell abbrechen?', confirmLabel: 'Abbrechen', danger: true })) {
              await cancelDuel(d.id).then(() => toast('Duell abgebrochen', 'info'), (e) => toast(e.message, 'error'));
              void duels.refresh();
            }
          }}
        >
          Duell abbrechen
        </Button>
      )}
    </div>
  );
}

function Side({ name, display, color, score, sets, lead }: { name: string; display: string; color: string; score: string; sets: number; lead: boolean }) {
  return (
    <div className="min-w-0">
      <Avatar name={display} color={color} size={56} className={clsx('mx-auto', lead && 'ring-2 ring-offset-2 ring-offset-surface')} />
      <div className="mt-2 truncate text-[13px] font-semibold">{name}</div>
      <div className="num mt-1 text-[20px] font-bold tracking-[-0.02em]">{score}</div>
      <div className="text-[11.5px] text-muted">{sets} Sätze</div>
    </div>
  );
}
